import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorkflowTools, ROLE_TOOLS } from '../.pi/extensions/workflow-tools.mjs';
import { fakeModel } from './fake-model.mjs';
import { createSkillTools } from '../.pi/extensions/skill-tools.mjs';
import { parseWorksheet, serializeWorksheet, inputProblem } from '../.pi/skills/mint-video-prompt-review/scripts/lib/worksheet.mjs';
const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function workspace(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mint-workflow-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const run = (tool, role, task, context, signal, update) => tool.execute('call', { name: 'mint_prompt', args: { role, task } }, signal, update, context);

test('actual Pi writer and reviewer sessions share the host model with isolated tools and context', async t => {
  const workspaceRoot = workspace(t);
  const model = await fakeModel(workspaceRoot, body => {
    const reviewed = body.messages.some(message => JSON.stringify(message.content)?.includes('REVIEW_ONLY'));
    if (body.messages.some(message => message.role === 'tool')) return { text: reviewed ? 'changes_requested: clarify the shot.' : 'Writer handed off the file.' };
    return { tool: 'write', args: { path: reviewed ? 'forbidden.md' : 'writer.md', content: 'written by writer' } };
  });
  t.after(model.close);
  const [workflow] = createWorkflowTools({ productRoot, workspaceRoot });
  const written = await run(workflow, 'mint-video-prompt-writer', 'WRITE_ONLY', model.context);
  assert.equal(written.details.status, 'completed', JSON.stringify(written));
  assert.equal(readFileSync(join(workspaceRoot, 'writer.md'), 'utf8'), 'written by writer');
  const reviewed = await run(workflow, 'mint-video-prompt-reviewer', 'REVIEW_ONLY', model.context);
  assert.equal(reviewed.details.status, 'completed', JSON.stringify(reviewed));
  assert.equal(existsSync(join(workspaceRoot, 'forbidden.md')), false);
  for (const request of model.requests) {
    const names = request.tools.map(tool => tool.function.name);
    assert.ok(!names.some(name => ['bash', 'powershell', 'canvas_cli', 'workflow', 'store_put'].includes(name)));
    const isReview = request.messages.some(message => JSON.stringify(message.content)?.includes('REVIEW_ONLY'));
    assert.equal(names.includes('write'), !isReview);
    assert.ok(names.includes('mint_skill'));
    if (isReview) assert.ok(!JSON.stringify(request.messages).includes('WRITE_ONLY'));
    assert.equal(request.model, 'test-model');
  }
});

test('writer, deterministic checks and independent reviewer preserve revision and input-bound approval', async t => {
  const workspaceRoot = workspace(t);
  const skillsRoot = join(productRoot, '.pi/skills');
  cpSync(join(skillsRoot, 'mint-creation/examples'), workspaceRoot, { recursive: true });
  const [main] = createSkillTools({ workspaceRoot, skillsRoot });
  const input = 'creation/收书人-creation.json';
  const mainCall = async args => {
    const response = await main.execute('main', { skill: 'mint-creation', args });
    assert.equal(response.isError, false, JSON.stringify(response.details));
    return response.details.stdout;
  };
  await mainCall(['prompts', 'init', input]);
  const material = JSON.parse(await mainCall(['prompts', 'brief', input, '--ep', '1']));
  writeFileSync(join(workspaceRoot, 'inputs.json'), JSON.stringify(material));
  const path = 'creation/E01-01/prompt.md';
  const readSheet = () => parseWorksheet(readFileSync(join(workspaceRoot, path), 'utf8'));
  let actions = [];
  const model = await fakeModel(workspaceRoot, () => actions.shift() ?? { text: 'Phase complete.' });
  t.after(model.close);
  const [workflow] = createWorkflowTools({ productRoot, workspaceRoot });
  const dispatch = async (role, steps) => {
    actions = steps;
    const response = await run(workflow, `mint-video-prompt-${role}`, `Complete the assigned ${role} phase.`, model.context);
    assert.equal(response.details.status, 'completed', JSON.stringify(response));
    assert.equal(actions.length, 0);
  };
  const skill = (name, args) => ({ tool: 'mint_skill', args: { skill: name, args } });
  const editSheet = changes => ({ tool: 'edit', args: { path,
    oldText: readFileSync(join(workspaceRoot, path), 'utf8'),
    newText: serializeWorksheet({ ...readSheet(), ...changes }),
  } });
  await dispatch('writer', [skill('mint-video-prompt', ['submit', path])]);
  assert.equal(readSheet().meta.status, 'in_review');
  await mainCall(['prompts', 'check', input]);
  await dispatch('reviewer', [
    editSheet({ review: '结论：退回。\n\n- [必须修改] 镜头 1：说明画面停留。' }),
    skill('mint-video-prompt-review', ['verdict', 'changes_requested', path]),
  ]);
  assert.equal(readSheet().meta.status, 'changes_requested');
  const rejected = await main.execute('main', { skill: 'mint-creation', args: ['export', input, '--out', 'blocked-export'] });
  assert.equal(rejected.isError, true);
  await dispatch('writer', [
    editSheet({ response: '- 镜头 1：保留原有时长，画面停留已满足要求。' }),
    skill('mint-video-prompt', ['submit', path]),
  ]);
  assert.equal(readSheet().meta.round, 2);
  await mainCall(['prompts', 'check', input]);
  await dispatch('reviewer', [
    editSheet({ review: '结论：通过。' }),
    skill('mint-video-prompt-review', ['verdict', 'approved', '--inputs', 'inputs.json', path]),
  ]);
  assert.equal(readSheet().meta.status, 'approved');
  assert.equal(inputProblem(readSheet(), material), null);
  assert.ok(inputProblem(readSheet(), { ...material, creativeBrief: 'Changed project requirements.' }));
});

test('role boundaries reject unknown workflows and cancellation stops a dispatched role without retry', async t => {
  const workspaceRoot = workspace(t);
  let starts = 0;
  const [workflow, control] = createWorkflowTools({ productRoot, workspaceRoot,
    runnerFactory: async ({ role }) => ({ run: async (_task, options) => {
      starts++;
      assert.deepEqual(options.toolNames, ROLE_TOOLS[role.name]);
      assert.deepEqual(options.systemTools, []);
      await new Promise((resolve, reject) => {
        if (options.signal.aborted) reject(new Error('cancelled'));
        else options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      });
    } }),
  });
  await assert.rejects(workflow.execute('bad', { name: 'inline-script', args: { role: 'admin', task: 'run' } }), /packaged workflow/);
  const controller = new AbortController();
  let runId;
  const pending = run(workflow, 'mint-video-prompt-writer', 'Work', undefined, controller.signal, update => { runId = update.details.runId; });
  // Allow the injected runner to begin, then cancel through the real control tool.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await control.execute('status', { action: 'status', runId })).details.status, 'running');
  await control.execute('stop', { action: 'cancel', runId });
  const cancelled = await pending;
  assert.equal(cancelled.details.status, 'cancelled');
  assert.equal(starts, 1);
  assert.equal(cancelled.isError, true);
});

test('a retryable provider failure makes exactly one request and fails the role', async t => {
  const workspaceRoot = workspace(t);
  const model = await fakeModel(workspaceRoot, () => ({ status: 500 }));
  t.after(model.close);
  const [workflow] = createWorkflowTools({ productRoot, workspaceRoot });
  const failed = await run(workflow, 'mint-video-prompt-reviewer', 'Review without retrying.', model.context);
  assert.equal(model.requests.length, 1);
  assert.equal(failed.details.status, 'failed', JSON.stringify(failed));
  assert.equal(failed.isError, true);
});

test('a failed role cannot become a successful null result', async t => {
  const [workflow] = createWorkflowTools({ productRoot, workspaceRoot: workspace(t), runnerFactory: async () => ({ run: async () => { throw new Error('scripted failure'); } }) });
  const failure = await run(workflow, 'mint-video-prompt-reviewer', 'Review');
  assert.equal(failure.isError, true);
  assert.equal(failure.details.status, 'failed');
});
