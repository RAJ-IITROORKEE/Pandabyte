type Reader = (image: Uint8Array, signal?: AbortSignal) => Promise<unknown>;
type Input = { image: Uint8Array; draft: string; signal?: AbortSignal };
type Result = { state: 'unavailable' | 'unreadable' | 'cancelled'; draft: string } | { state: 'readable'; observedText: string; draft: string };
const validText = (value: string) => value.length <= 1500 && !/\p{Surrogate}/u.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value);

/** Reader injection selects no runtime provider; cancellation only suppresses local release. */
export function createImageInterpreter(reader?: Reader) {
  return {
    async interpret({ image, draft, signal }: Input): Promise<Result> {
      if (!(image instanceof Uint8Array) || image.byteLength < 1 || image.byteLength > 2097152 || typeof draft !== 'string' || !validText(draft)) throw new Error('invalid input');
      if (signal?.aborted) return { state: 'cancelled', draft };
      if (!reader) return { state: 'unavailable', draft };
      const cancelledMarker = Symbol('cancelled');
      let abort: (() => void) | undefined;
      const cancelled = new Promise<symbol>(resolve => {
        abort = () => resolve(cancelledMarker);
        signal?.addEventListener('abort', abort, { once: true });
      });
      try {
        const value = await Promise.race([reader(image, signal), cancelled]);
        if (signal?.aborted || value === cancelledMarker) return { state: 'cancelled', draft };
        if (typeof value !== 'string' || !value.trim() || !validText(value)) return { state: 'unreadable', draft };
        return { state: 'readable', observedText: value, draft };
      } catch {
        return { state: signal?.aborted ? 'cancelled' : 'unavailable', draft };
      } finally { if (abort) signal?.removeEventListener('abort', abort); }
    },
  };
}
