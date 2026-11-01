"use client";

// Adapted from Vercel AI Elements; Apache-2.0 notice in Panda-agent/third-party/ai-elements.
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useMemo } from "react";
import styles from "../workspace.module.css";

export interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({ children, className, duration = 2, spread = 2 }: TextShimmerProps) => {
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);
  const reducedMotion = useReducedMotion();
  return <motion.span
    animate={reducedMotion ? undefined : { backgroundPosition: "0% center" }}
    className={[styles.aiShimmer, className].filter(Boolean).join(" ")}
    initial={reducedMotion ? false : { backgroundPosition: "100% center" }}
    style={{ "--spread": `${dynamicSpread}px` } as CSSProperties}
    transition={reducedMotion ? undefined : { duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
  >{children}</motion.span>;
};

export const Shimmer = memo(ShimmerComponent);
