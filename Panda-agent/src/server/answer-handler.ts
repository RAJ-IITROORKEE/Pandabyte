import { answerQuestion, parseQuestion } from '../retrieval/answers.ts';
import type { Actor, Adapters, Citation, Outcome } from '../retrieval/contracts.ts';
type AuthenticatedActor = Exclude<Actor, null>;
type ResponseKind = Outcome['kind'];
const messages: Record<Exclude<ResponseKind, 'evidence'>, string> = {
    unauthorized: 'Sign in to use documentation answers.',
    invalid: 'The request is invalid.',
    unavailable: 'Documentation answers are currently unavailable.',
    clarification: 'Please clarify which product you mean.',
    insufficient: 'The available documentation does not establish this.',
    conflict: 'The product information needs clarification.',
};
function respond(kind: ResponseKind, status: number, citations: Citation[] = [], allow = false): Response {
    const safeCitations = citations.map(({ id, title, sourceUrl, capturedAt, quote, sectionPath }) => ({ id, title, sourceUrl, capturedAt, quote, sectionPath }));
    const text = kind === 'evidence'
        ? safeCitations.map(c => `The captured listing states: “${c.quote}” [${c.id}]`).join('\n')
        : messages[kind];
    return new Response(JSON.stringify({
        outcome: kind, text, citations: safeCitations,
        capabilities: { documentationAnswers: status === 200, codeSuggestions: false, compile: false, flash: false, serial: false },
    }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...(allow ? { Allow: 'POST' } : {}) } });
}
async function readBody(request: Request): Promise<{
    kind: 'ok';
    value: unknown;
} | {
    kind: 'large' | 'invalid';
}> {
    if (!request.body)
        return { kind: 'invalid' };
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > 8192) {
                try {
                    await reader.cancel();
                }
                catch { /* Already closed. */ }
                return { kind: 'large' };
            }
            chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { kind: 'ok', value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
    }
    catch {
        return { kind: 'invalid' };
    }
    finally {
        reader.releaseLock();
    }
}
export function createAnswerHandler(authenticate: () => Promise<Actor>, adaptersForActor: (actor: AuthenticatedActor) => Promise<Adapters | null> = async () => null): (request: Request) => Promise<Response> {
    return async (request) => {
        if (request.method !== 'POST')
            return respond('invalid', 405, [], true);
        let actor: Actor;
        try {
            actor = await authenticate();
        }
        catch {
            return respond('unavailable', 503);
        }
        if (!actor || typeof actor.subject !== 'string' || !actor.subject.trim() || actor.subject.length > 512)
            return respond('unauthorized', 401);
        try {
            if (request.headers.get('origin') !== new URL(request.url).origin)
                return respond('invalid', 403);
        }
        catch {
            return respond('invalid', 403);
        }
        if (!/^application\/json(?:\s*;\s*[^;]+)*\s*$/i.test(request.headers.get('content-type') ?? ''))
            return respond('invalid', 415);
        const body = await readBody(request);
        if (body.kind === 'large')
            return respond('invalid', 413);
        if (body.kind !== 'ok' || !parseQuestion(body.value))
            return respond('invalid', 400);
        try {
            const adapters = await adaptersForActor(actor);
            if (!adapters)
                return respond('unavailable', 503);
            const outcome = await answerQuestion(actor, body.value, adapters);
            if (outcome.kind === 'evidence')
                return respond('evidence', 200, outcome.citations);
            const status = outcome.kind === 'unauthorized' ? 401 : outcome.kind === 'invalid' ? 400 : outcome.kind === 'unavailable' ? 503 : 200;
            return respond(outcome.kind, status);
        }
        catch {
            return respond('unavailable', 503);
        }
    };
}
