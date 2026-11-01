export function createReadAloud(engine: SpeechSynthesis, makeUtterance: (text: string) => SpeechSynthesisUtterance, update: (id: string | null) => void) {
  let generation = 0;
  let current: string | null = null;
  function stop() {
    generation++;
    if (current !== null) engine.cancel();
    current = null;
    update(null);
  }
  function play(id: string, text: string) {
    stop();
    const ticket = ++generation;
    try {
      const utterance = makeUtterance(text);
      current = id;
      update(id);
      utterance.onend = utterance.onerror = () => {
        if (ticket === generation) { current = null; update(null); }
      };
      engine.speak(utterance);
    } catch { if (ticket === generation) { current = null; update(null); } }
  }
  return { play, stop };
}
