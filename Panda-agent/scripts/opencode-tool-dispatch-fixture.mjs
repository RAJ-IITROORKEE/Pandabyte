import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const provider = 'pandabyte-loopback-tool-fixture';
const model = 'fixture-tool-model';
const callID = 'call_pandabyte_fixture';
export const fixtureToolResult = 'pandabyte_fixture_tool_result';
export const fixturePrompt = 'Run the one disposable PandaByte tool fixture.';

export async function startFixtureModel(tool, mode) {
  const token = randomBytes(32).toString('hex');
  const observed = { requests: 0, rejected: 0, toolAdvertised: false, toolCallEmitted: false, resultReturned: false };
  const sink = createServer(async (request, response) => {
    try {
      if (request.socket.remoteAddress !== '127.0.0.1' || request.method !== 'POST'
        || request.url !== '/v1/chat/completions' || request.headers.authorization !== `Bearer ${token}`) throw Error();
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 128_000) throw Error();
        chunks.push(chunk);
      }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (body.model !== model || body.stream !== true || !Array.isArray(body.messages)
        || !body.messages.some(item => item.role === 'user' && item.content === fixturePrompt)) throw Error();
      const attempt = ++observed.requests;
      let delta;
      if (attempt === 1) {
        if (!body.tools?.some(item => item.type === 'function' && item.function?.name === tool)) throw Error();
        observed.toolAdvertised = true;
        delta = { tool_calls: [{ index: 0, id: callID, type: 'function', function: { name: tool, arguments: '{}' } }] };
        observed.toolCallEmitted = true;
      } else if (attempt === 2) {
        const result = body.messages.find(item => item.role === 'tool' && item.tool_call_id === callID);
        if (!result || typeof result.content !== 'string' || !result.content
          || result.content.includes(fixtureToolResult) !== (mode === 'allow')) throw Error();
        observed.resultReturned = true;
        delta = { content: 'Synthetic fixture completed.' };
      } else throw Error();

      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      const write = (value, finish_reason = null) => response.write(`data: ${JSON.stringify({
        id: 'chatcmpl-pandabyte-fixture', object: 'chat.completion.chunk', created: 1, model,
        choices: [{ index: 0, delta: value, finish_reason }],
      })}\n\n`);
      write({ role: 'assistant', ...delta });
      write({}, attempt === 1 ? 'tool_calls' : 'stop');
      response.end('data: [DONE]\n\n');
    } catch {
      observed.rejected++;
      if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"Invalid synthetic fixture request"}}');
    }
  });
  sink.requestTimeout = 5000;
  sink.headersTimeout = 5000;
  sink.listen(0, '127.0.0.1');
  await once(sink, 'listening');
  const baseURL = `http://127.0.0.1:${sink.address().port}/v1`;
  return {
    observed,
    token,
    configure(config) {
      config.model = { providerID: provider, model };
      config.providers = { [provider]: {
        name: 'Disposable loopback tool fixture', package: '@opencode/ai/providers/openai-compatible',
        env: ['PANDA_TOOL_FIXTURE_TOKEN'], settings: { baseURL, encoding: 'none' },
        models: { [model]: { modelID: model, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 262144, output: 128 } } },
      } };
      config.policies.push({ action: 'provider.use', resource: provider, effect: 'allow' });
      config.policies.push({ action: 'tool.use', resource: `${tool}:*`, effect: mode });
    },
    matchesConfig(entries) {
      return entries.some(entry => entry.info?.providers?.[provider]?.settings?.baseURL === baseURL);
    },
    matchesCatalog(rows) {
      return rows.length === 1 && rows[0].providerID === provider && rows[0].id === model;
    },
    async close() {
      sink.closeAllConnections();
      await new Promise((resolve, reject) => sink.close(error => error ? reject(error) : resolve()));
    },
  };
}

export async function observeDispatch({ native, receipt, access, signal, client, messageID, tool }) {
  const deadline = Date.now() + 15000;
  do {
    const state = await native.get(receipt, access, signal);
    const active = await native.active(receipt, access, signal);
    if (state.outcome && state.time.busy !== undefined && state.time.idle >= state.time.busy && !active.active) {
      const history = await client.message.list({ sessionID: receipt.sessionID, limit: 20, order: 'asc' }, { signal });
      const parts = history.data.filter(item => item.type === 'assistant')
        .flatMap(item => item.content).filter(part => part.type === 'tool');
      const user = history.data.filter(item => item.type === 'user');
      const part = parts[0];
      return {
        outcome: state.outcome,
        promptCorrelated: user.length === 1 && user[0].id === messageID && user[0].text === fixturePrompt,
        toolCorrelated: parts.length === 1 && part.id === callID && part.name === tool,
        toolStatus: ['completed', 'error'].includes(part?.state?.status) ? part.state.status : 'unverified',
        fixtureResultRecorded: part?.state?.status === 'completed' && JSON.stringify(part.state.content ?? []).includes(fixtureToolResult),
        nativeToolErrorRecorded: part?.state?.status === 'error' && part.state.error?.message === `Unable to execute ${tool}`,
      };
    }
    await delay(150, undefined, { signal });
  } while (Date.now() < deadline);
  throw Error('fixture_terminal_unverified');
}
