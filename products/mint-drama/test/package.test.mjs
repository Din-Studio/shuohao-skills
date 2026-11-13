import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { readProductLaunch } from '../runtime/launch-config.ts';
import { createCanvasCliTool, withCanvasCliToolName } from '../runtime/canvas-cli-tool.ts';
import { createWorkspaceFileGuardExtension } from '../runtime/workspace-file-guard.ts';
import { fakeModel } from './fake-model.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('imported reference files match their recorded source hashes', () => {
  const source = JSON.parse(readFileSync(join(root, 'runtime-source.json'), 'utf8'));
  assert.equal(source.revision, '327bb1ece8fe1d07a7b5637f8173481fc73ffde9');
  for (const [path, hash] of Object.entries(source.files)) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), hash, path);
  }
});

test('assembled product loads its launcher, nine skills, goal extension and product tools through real Pi', async t => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'mint-product-')));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const model = await fakeModel(workspace, () => ({ text: 'No real model was called.' }));
  t.after(model.close);
  const launch = readProductLaunch(root, 'launch.sh', root);
  assert.ok(!launch.toolNames.includes('bash'));
  assert.ok(!launch.toolNames.includes('canvas_cli'), 'The host injects the canvas tool');
  assert.equal(launch.extensionSources.length, 2);
  const assembled = JSON.parse(readFileSync(join(root, '.pi/assembled.json'), 'utf8'));
  assert.equal(assembled.skills.length, 9);
  for (const [path, hash] of Object.entries(assembled.files)) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, '.pi', path))).digest('hex'), hash, path);
  }
  const settings = SettingsManager.inMemory({ cacheWarming: 'off' }, { projectTrusted: true });
  const loader = new DefaultResourceLoader({
    cwd: workspace, agentDir: join(workspace, '.test-agent'), settingsManager: settings,
    noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
    additionalExtensionPaths: launch.extensionSources, additionalSkillPaths: launch.skillPaths,
    systemPromptOverride: () => readFileSync(launch.systemPromptPath, 'utf8'),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    extensionFactories: [createWorkspaceFileGuardExtension({ workspaceRoot: workspace, forbiddenRoots: [root], readableSkillRoots: [root] })],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.equal(loader.getSkills().skills.length, 9);
  const { session } = await createAgentSession({
    cwd: workspace, agentDir: join(workspace, '.test-agent'), modelRuntime: model.runtime, model: model.context.model,
    resourceLoader: loader, settingsManager: settings, sessionManager: SessionManager.inMemory(),
    tools: withCanvasCliToolName(launch.toolNames),
    customTools: [createCanvasCliTool({ cwd: workspace, canvasSessionId: () => 'unused' })],
  });
  t.after(() => session.dispose());
  const active = session.getActiveToolNames();
  for (const name of withCanvasCliToolName(launch.toolNames)) assert.ok(active.includes(name), name);
  assert.ok(!active.includes('bash') && !active.includes('powershell'));
  assert.ok(!existsSync(join(workspace, 'production.json')));
  assert.equal(model.requests.length, 0);
});
