import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCanvasCliTool } from '../runtime/canvas-cli-tool.ts';
import { installCanvasBridge, registerMainSession, dropSession } from '@scenemint/canvas-cli/cloud';

const decoded = response => {
  assert.equal(response.details.exitCode, 0, JSON.stringify(response));
  return JSON.parse(response.content[0].text);
};
test('imported cloud CLI injects sessions, applies plans, recovers tasks and downloads through the bridge', async t => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'mint-canvas-')));
  const sessionId = randomUUID(), nodeId = randomUUID();
  t.after(() => { dropSession(sessionId); rmSync(workspace, { recursive: true, force: true }); });
  const calls = [];
  const media = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  let submitted = 0, loseReply = true;
  installCanvasBridge({ request: async (record, envelope) => {
    assert.equal(record.sessionId, sessionId);
    assert.equal(record.workspace, workspace);
    calls.push(envelope);
    switch (envelope.method) {
      case 'apply': return { ok: true, applied: envelope.params.commands.length };
      case 'model_catalog': return { ok: true, models: [{ id: 'fake-image', schemaStatus: 'available', inputSchema: { properties: { aspect_ratio: { enum: ['16:9'] } } } }] };
      case 'run_node':
        submitted++;
        if (loseReply) { loseReply = false; throw new Error('simulated lost submit reply'); }
        return { ok: true, taskId: 'task-1' };
      case 'tasks': return { ok: true, rows: [{ taskId: 'task-1', nodeId, status: 'succeeded' }] };
      case 'media_info': return { ok: true, size: media.length, mimeType: 'image/png', fileName: 'image.png', mediaId: 'media-1' };
      case 'media_chunk': return { ok: true, offset: 0, base64: media.toString('base64'), eof: true };
      default: throw new Error(`Unexpected canvas method: ${envelope.method}`);
    }
  } });
  registerMainSession({ sessionId, name: 'test', workspace, canvasId: 'canvas-test', projectId: 'project-test' });
  const tool = createCanvasCliTool({ cwd: workspace, canvasSessionId: () => sessionId });
  const call = args => tool.execute('test', { args });
  assert.equal(decoded(await call(['status'])).state, 'connected');
  await assert.rejects(call(['ls', '/', '--session', 'another-session']), /SESSION_NOT_ALLOWED/);
  const catalog = decoded(await call(['models', '--model-id', 'fake-image']));
  assert.equal(catalog.models[0].id, 'fake-image');
  const plan = { id: 'character-a', prompt: 'Approved image prompt', params: { aspect_ratio: '16:9' }, references: [], output: 'characters/images/character-a.png' };
  const commands = [{ type: 'add_node', id: nodeId, kind: 'gen', position: { x: 0, y: 0 }, title: plan.id,
    draft: { mode: 'image', modelId: catalog.models[0].id, prompt: plan.prompt, aspectRatio: plan.params.aspect_ratio } }];
  writeFileSync(join(workspace, 'batch.json'), JSON.stringify({ commands }));
  decoded(await call(['apply', '--file', 'batch.json']));
  assert.deepEqual(calls.find(entry => entry.method === 'apply').params.commands, commands);
  const referenceNodes = [randomUUID(), randomUUID()];
  const connections = referenceNodes.map(source => ({ type: 'connect', source, target: nodeId, targetHandle: 'reference' }));
  writeFileSync(join(workspace, 'references.json'), JSON.stringify({ commands: connections }));
  decoded(await call(['apply', '--file', 'references.json']));
  assert.deepEqual(calls.filter(entry => entry.method === 'apply').at(-1).params.commands.map(command => command.source), referenceNodes);
  const unapproved = await call(['run', nodeId]);
  assert.notEqual(unapproved.details.exitCode, 0);
  assert.equal(submitted, 0);
  const uncertain = await call(['run', nodeId, '--approved']);
  assert.notEqual(uncertain.details.exitCode, 0);
  const tasks = decoded(await call(['tasks', '--node', nodeId]));
  assert.equal(tasks.rows[0].taskId, 'task-1');
  const downloaded = decoded(await call(['download', nodeId, '--out', plan.output]));
  assert.equal(downloaded.detectedMimeType, 'image/png');
  assert.deepEqual(readFileSync(join(workspace, plan.output)), media);
  assert.equal(submitted, 1, 'Recovery queried the original task and did not resubmit');
  const outside = await call(['download', nodeId, '--out', '../escape.png']);
  assert.notEqual(outside.details.exitCode, 0);
  const overwrite = await call(['download', nodeId, '--out', plan.output]);
  assert.notEqual(overwrite.details.exitCode, 0);
});
