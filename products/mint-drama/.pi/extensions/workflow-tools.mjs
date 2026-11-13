// Product integration using the same workflow engine as app-agent, with fixed dispatch only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Type } from '@earendil-works/pi-ai';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { runWorkflow, WorkflowAgent } from '@quintinshaw/pi-dynamic-workflows';
import { createWorkspaceFileGuardExtension } from '../../runtime/workspace-file-guard.ts';
import { createSkillTools } from './skill-tools.mjs';

export const ROLE_TOOLS = Object.freeze({
  'mint-video-prompt-writer': ['read', 'write', 'edit', 'grep', 'find', 'ls', 'mint_skill'],
  'mint-video-prompt-reviewer': ['read', 'edit', 'grep', 'find', 'ls', 'mint_skill'],
});
const DENIED = ['bash', 'powershell', 'workflow', 'workflow_control', 'canvas_cli', 'store_put', 'store_get'];
const result = (details, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(details) }], details, ...(isError ? { isError: true } : {}),
});

export function loadRoles(productRoot) {
  const roles = new Map();
  for (const [name, tools] of Object.entries(ROLE_TOOLS)) {
    const content = readFileSync(join(productRoot, '.pi/agents', `${name}.md`), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(content);
    if (!match) throw new Error(`Invalid role definition: ${name}`);
    const declared = /^tools:\s*(.+)$/m.exec(match[1])?.[1].split(',').map(value => value.trim());
    if (/^name:\s*(.+)$/m.exec(match[1])?.[1] !== name ||
        !declared || [...declared].sort().join(',') !== [...tools].sort().join(',')) {
      throw new Error(`Role tool policy differs from the product contract: ${name}`);
    }
    roles.set(name, { name, tools: [...tools], prompt: match[2], source: 'project' });
  }
  return roles;
}

export async function createRoleRunner({ productRoot, workspaceRoot, role, context }) {
  if (!context?.model || !context?.modelRegistry) throw new Error('The host model and registry are required.');
  const settings = SettingsManager.inMemory({ cacheWarming: 'off', retry: { enabled: false, provider: { maxRetries: 0 } } }, { projectTrusted: true });
  const loader = new DefaultResourceLoader({
    cwd: workspaceRoot,
    agentDir: join(workspaceRoot, '.mint-runtime/agent'),
    settingsManager: settings,
    noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => `${role.prompt}\n\nUse only the assigned workspace. Read the packaged skill named in the brief. Do not delegate or generate media.`,
    extensionFactories: [createWorkspaceFileGuardExtension({
      workspaceRoot, forbiddenRoots: [productRoot], readableSkillRoots: [productRoot],
    })],
  });
  await loader.reload();
  const extensions = loader.getExtensions();
  if (extensions.errors.length) throw new Error(extensions.errors.map(error => error.error).join('; '));
  return new WorkflowAgent({
    cwd: workspaceRoot,
    modelRegistry: context.modelRegistry,
    tools: createSkillTools({ workspaceRoot, skillsRoot: join(productRoot, '.pi/skills'),
      role: role.name.endsWith('-writer') ? 'writer' : 'reviewer' }),
    excludeTools: DENIED,
    persistAgentSessions: false,
    session: { resourceLoader: loader, settingsManager: settings, tools: [...role.tools],
      agentDir: join(workspaceRoot, '.mint-runtime/agent'), thinkingLevel: 'off' },
  });
}

export function createWorkflowTools({ productRoot, workspaceRoot, runnerFactory = createRoleRunner }) {
  const roles = loadRoles(productRoot);
  const saved = JSON.parse(readFileSync(join(productRoot, '.pi/workflows/mint_prompt.json'), 'utf8'));
  // Foreground calls finish within their originating host turn; no detached model/auth context.
  const runs = new Map();
  const workflow = {
    name: 'workflow', label: 'Prompt workflow',
    description: 'Run the packaged mint_prompt workflow in an isolated writer or reviewer session. Supply a complete task brief. Run deterministic checks between writing and review. No arbitrary scripts, shell, background mode or automatic retries.',
    parameters: Type.Object({
      name: Type.Literal('mint_prompt'),
      args: Type.Object({ role: Type.Union(Object.keys(ROLE_TOOLS).map(name => Type.Literal(name))), task: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    executionMode: 'sequential',
    async execute(_id, params, signal, onUpdate, context) {
      if (params.name !== 'mint_prompt' || !roles.has(params.args?.role) || typeof params.args?.task !== 'string' || !params.args.task.trim()) {
        throw new Error('A packaged workflow, known role and nonempty task are required.');
      }
      signal?.throwIfAborted();
      // Retain only the latest completed result; active calls remain cancellable.
      for (const [id, run] of runs) if (run.status !== 'running') runs.delete(id);
      const runId = randomUUID();
      const controller = new AbortController();
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const record = { runId, status: 'running', role: params.args.role, controller };
      runs.set(runId, record);
      onUpdate?.(result({ runId, status: record.status, role: record.role }));
      try {
        const role = roles.get(params.args.role);
        const runner = await runnerFactory({ productRoot, workspaceRoot, role, context });
        combined.throwIfAborted();
        const completed = await runWorkflow(saved.script, {
          cwd: workspaceRoot, args: params.args, runId, signal: combined,
          agentRegistry: roles, agentRetries: 0, maxAgents: 1, concurrency: 1, persistLogs: false,
          modelRegistry: context?.modelRegistry,
          agent: { run: (prompt, options) => runner.run(prompt, {
            ...options, systemTools: [], toolNames: [...role.tools], disallowedToolNames: DENIED,
            ...(context?.model ? { model: `${context.model.provider}/${context.model.id}` } : {}),
          }) },
        });
        combined.throwIfAborted();
        if (completed.result === null || completed.result === undefined) throw new Error('The role failed without a result. Inspect the worksheet before dispatching again.');
        record.status = 'completed';
        record.output = completed.result;
        return result({ runId, status: record.status, role: record.role, output: record.output });
      } catch (error) {
        record.status = combined.aborted ? 'cancelled' : 'failed';
        record.error = error instanceof Error ? error.message : String(error);
        return result({ runId, status: record.status, role: record.role, error: record.error }, true);
      }
    },
  };
  const control = {
    name: 'workflow_control', label: 'Prompt workflow status',
    description: 'Inspect or cancel a live prompt workflow by runId. Completed state is session-local; after restart inspect the durable worksheets and dispatch only the unfinished phase.',
    parameters: Type.Object({ action: Type.Union([Type.Literal('status'), Type.Literal('cancel')]), runId: Type.String() }, { additionalProperties: false }),
    async execute(_id, params) {
      if (!['status', 'cancel'].includes(params.action)) throw new Error('Unsupported workflow control action.');
      const record = runs.get(params.runId);
      if (!record) return result({ ok: false, error: 'unknown_run' }, true);
      if (params.action === 'cancel' && record.status === 'running') record.controller.abort();
      const { controller: _controller, ...status } = record;
      return result(status);
    },
  };
  return [workflow, control];
}
