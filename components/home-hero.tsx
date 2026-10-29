import type { ReactNode } from "react";
import styles from "./home.module.css";

export function HomeHero({ children }: { children: ReactNode }) {
  return <section
    className={styles.hero}
    aria-labelledby="home-title"
  >{children}</section>;
}
