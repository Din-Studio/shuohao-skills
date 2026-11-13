// Local OpenAI-compatible transport only. No external provider or credentials.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { ModelRuntime, ModelRegistry } from '@earendil-works/pi-coding-agent';

export async function fakeModel(directory, reply) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const scripted = reply(body);
    if (scripted.status) {
      res.writeHead(scripted.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Scripted provider failure', type: 'server_error' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: 'test-completion', object: 'chat.completion.chunk', created: 0, model: 'test-model' };
    const delta = scripted.tool ? { role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests.length}`, type: 'function', function: { name: scripted.tool, arguments: JSON.stringify(scripted.args) } }] } : { role: 'assistant', content: scripted.text };
    for (const data of [
      { ...base, choices: [{ index: 0, delta }] },
      { ...base, choices: [{ index: 0, delta: {}, finish_reason: scripted.tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    ]) res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const runtime = await ModelRuntime.create({ authPath: join(directory, 'auth.json'), modelsPath: null });
  runtime.registerProvider('mint-test', {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'local-test-only',
    models: [{ id: 'test-model', name: 'Test model', reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } }],
  });
  const modelRegistry = new ModelRegistry(runtime);
  return { runtime, requests, context: { model: modelRegistry.find('mint-test', 'test-model'), modelRegistry },
    close: () => new Promise(resolve => server.close(resolve)) };
}
