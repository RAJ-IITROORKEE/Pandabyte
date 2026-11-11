import { createHash } from 'node:crypto';
import { researchProfileSelection } from '../research-profile.mjs';

type ToolContext = { sessionID: string; messageID: string; id: string };
type MutableTool = { id: string; name: string; execute: (input: unknown, context: ToolContext) => unknown };
type HttpEvent = { sessionID: string; kind: string; request: Request };
type RetryEvent = { decision: { retry: boolean; delay?: number } };
type TitleEvent = { result?: string };
type Context = {
  session: { hook: {
    (name: 'http.request', callback: (event: HttpEvent) => void): Promise<unknown>;
    (name: 'retry', callback: (event: RetryEvent) => void): Promise<unknown>;
    (name: 'title', callback: (event: TitleEvent) => void): Promise<unknown>;
  } };
  tool: { transform: (callback: (editor: { list(): readonly MutableTool[]; update(id: string, callback: (tool: MutableTool) => void): void }) => void) => Promise<unknown> };
};
const validID = (value: unknown, prefix: string) => typeof value === 'string' && new RegExp(`^${prefix}_[a-zA-Z0-9]{26}$`).test(value);
const queryInput = (value: unknown): value is { query: string } => {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(fields).length !== 1 || !Object.hasOwn(fields, 'query') || !Object.hasOwn(fields.query, 'value')) return false;
  const query: unknown = fields.query.value;
  return typeof query === 'string' && query.isWellFormed() && [...query].length >= 1 && [...query].length <= 400 && !/[\u0000-\u001f\u007f-\u009f]/u.test(query);
};

// A plain descriptor is the native Plugin.define result; use the host runtime without installing another Effect.
const researchBinding = {
  id: 'panda-research-binding',
  async setup(context: Context) {
    const selected = researchProfileSelection(process.env.PANDA_RESEARCH_PROFILE as Parameters<typeof researchProfileSelection>[0]);
    const generation = process.env.PANDA_RESEARCH_GENERATION;
    if (!/^[a-f0-9]{64}$/.test(generation ?? '')) throw Error('research_binding_invalid');
    await context.session.hook('http.request', event => {
      if (!validID(event.sessionID, 'ses') || !['primary', 'compaction', 'title', 'generate'].includes(event.kind)) throw Error('research_binding_invalid');
      const headers = new Headers(event.request.headers);
      headers.set('x-panda-native-session', event.sessionID);
      headers.set('x-panda-native-kind', event.kind);
      headers.set('x-panda-native-generation', generation!);
      event.request = new Request(event.request, { headers });
    });
    await context.session.hook('retry', event => { event.decision = { retry: false }; });
    await context.session.hook('title', event => { event.result = 'Panda research fixture'; });
    await context.tool.transform(editor => {
      for (const entry of editor.list()) {
        if (entry.id !== selected.toolName) continue;
        editor.update(entry.id, tool => {
          const execute = tool.execute;
          tool.execute = (input, native) => {
            if (!queryInput(input) || !validID(native.sessionID, 'ses') || !validID(native.messageID, 'msg') || typeof native.id !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(native.id) || !native.id.trim()) throw Error('research_binding_invalid');
            const original = { query: input.query };
            const envelope = { sessionID: native.sessionID, assistantMessageID: native.messageID, toolID: native.id, generation,
              inputHash: createHash('sha256').update(JSON.stringify(original)).digest('hex') };
            return execute({ ...original, __pandaNative: envelope }, native);
          };
        });
      }
    });
  },
};
export default researchBinding;
