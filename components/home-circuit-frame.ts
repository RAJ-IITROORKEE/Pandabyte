export function createCircuitFrameQueue(update: () => void) {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame === null) frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    },
    flush() {
      if (frame === null) return;
      cancelAnimationFrame(frame);
      frame = null;
      update();
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
