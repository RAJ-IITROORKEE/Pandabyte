import { WebSpeechDictationAdapter, type DictationAdapter } from "@assistant-ui/react";

export function createGuardedDictation(adapter: DictationAdapter = new WebSpeechDictationAdapter({ interimResults: false })) {
  let cancelCurrent: (() => void) | undefined;
  return {
    adapter: { listen() {
      cancelCurrent?.();
      const session = adapter.listen();
      let cancelled = false;
      const cancel = () => { if (!cancelled) { cancelled = true; try { session.cancel(); } catch { /* The browser may have already ended the session. */ } } };
      cancelCurrent = cancel;
      return {
        get status() { return cancelled ? { type: "ended" as const, reason: "cancelled" as const } : session.status; },
        stop: () => session.stop(), cancel,
        onSpeechStart: (callback: () => void) => session.onSpeechStart(() => { if (!cancelled) callback(); }),
        onSpeechEnd: (callback: Parameters<typeof session.onSpeechEnd>[0]) => session.onSpeechEnd(result => { if (!cancelled) callback(result); }),
        onSpeech: (callback: Parameters<typeof session.onSpeech>[0]) => session.onSpeech(result => { if (!cancelled) callback(result); }),
      };
    } },
    cancel() { cancelCurrent?.(); cancelCurrent = undefined; },
  };
}
