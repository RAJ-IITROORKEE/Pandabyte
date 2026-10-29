"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { consumeCelebration } from "./order-celebration";
import styles from "./order-confirmation.module.css";

export function OrderSuccessAnimation({ userId, reference }: { userId: string; reference: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);
  const shouldPlay = useRef<boolean | null>(null);

  useEffect(() => {
    if (shouldPlay.current === null) shouldPlay.current = consumeCelebration(userId, reference);
    const target = container.current;
    const staticIcon = fallback.current;
    if (!target || !staticIcon || !shouldPlay.current) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let player: import("lottie-web").AnimationItem | undefined;
    const reset = () => { player?.destroy(); player = undefined; target.hidden = true; staticIcon.hidden = false; };
    const onMotionChange = () => { if (motion.matches) reset(); };
    motion.addEventListener("change", onMotionChange);
    if (!motion.matches) void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || motion.matches) return;
      player = lottie.loadAnimation({ container: target, renderer: "svg", loop: false, autoplay: true, path: "/animations/order-success.json" });
      player.addEventListener("DOMLoaded", () => { if (!disposed && !motion.matches) { target.hidden = false; staticIcon.hidden = true; } });
      player.addEventListener("data_failed", reset);
      player.addEventListener("error", reset);
    }).catch(reset);
    return () => { disposed = true; motion.removeEventListener("change", onMotionChange); reset(); };
  }, [userId, reference]);

  return <span className={styles.successIcon} aria-hidden="true"><span ref={fallback}><Check size={32} /></span><span ref={container} className={styles.animation} hidden /></span>;
}
