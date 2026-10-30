import type { ReactNode } from "react";
import styles from "./home.module.css";

export function HomeHero({ children }: { children: ReactNode }) {
  return <section
    className={styles.hero}
    aria-labelledby="home-title"
  >
    {/* Original PCB artwork; CSS signals follow the traces without a canvas runtime. */}
    <svg className={styles.heroPattern} aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id="home-pcb-pattern" width="600" height="360" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M0 54h72l32 32h76m-180-20h64l32 32h48M240 0v42l40 40h88l28 28v54m204-128h-68l-40 40v72l-30 30h-52M0 278h100l40-40h72v-52m28 174v-44l40-40h90l38-38h76m116 82h-76l-32-32v-42M360 0v28l40 40h40m-80 292v-30l-32-32h-48" />
            <circle cx="180" cy="86" r="3" /><circle cx="144" cy="98" r="2" />
            <circle cx="396" cy="164" r="3" /><circle cx="410" cy="178" r="3" />
            <circle cx="212" cy="186" r="3" /><circle cx="484" cy="238" r="3" />
            <circle cx="492" cy="246" r="2" /><circle cx="440" cy="68" r="3" />
            <circle cx="280" cy="298" r="3" />
          </g>
          <g className={styles.connectionSignals} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path pathLength="1" d="M0 54h72l32 32h76" />
            <path pathLength="1" d="M240 0v42l40 40h88l28 28v54" />
            <path pathLength="1" d="M600 36h-68l-40 40v72l-30 30h-52" />
            <path pathLength="1" d="M0 278h100l40-40h72v-52" />
            <path pathLength="1" d="M240 360v-44l40-40h90l38-38h76" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#home-pcb-pattern)" />
    </svg>
    {children}
  </section>;
}
