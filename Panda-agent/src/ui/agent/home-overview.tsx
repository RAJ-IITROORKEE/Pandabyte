"use client";

import { useState } from "react";
import { CalendarDays, MessagesSquare, TrendingDown, TrendingUp } from "lucide-react";
import { activityDays, monthCounts, relativeTime } from "./overview-data";
import styles from "./home-overview.module.css";

type Chat = { id: string; title: string; updatedAt: string };

/** Start-screen overview under the composer: chat activity by day, recent chats and this month against last; all from the saved chat list. */
export function HomeOverview({ chats, onOpen }: { chats: readonly Chat[]; onOpen: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  if (!chats.length) return null;
  const stamps = chats.map(chat => chat.updatedAt);
  const days = activityDays(stamps, now, 12), max = Math.max(1, ...days.map(d => d.count));
  const { thisMonth, lastMonth } = monthCounts(stamps, now), delta = thisMonth - lastMonth;
  const level = (n: number) => n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
  return <div className={styles.grid}>
    <section className={`${styles.card} ${styles.activity}`} aria-labelledby="overview-activity">
      <div className={styles.head}><h2 id="overview-activity"><CalendarDays size={14} aria-hidden="true" /> Activity</h2><span>{chats.length}{chats.length >= 100 ? "+" : ""} chats · last 12 weeks</span></div>
      <div className={styles.heat} role="img" aria-label={`Chats by last activity over 12 weeks; busiest day had ${max}.`}>{days.map(d => <span key={d.day} data-level={level(d.count)} title={`${new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${d.count} ${d.count === 1 ? "chat" : "chats"}`} />)}</div>
    </section>
    <section className={styles.card} aria-labelledby="overview-recent">
      <div className={styles.head}><h2 id="overview-recent"><MessagesSquare size={14} aria-hidden="true" /> Recent chats</h2></div>
      <ul className={styles.recent}>{chats.slice(0, 3).map(chat => <li key={chat.id}><button type="button" onClick={() => onOpen(chat.id)}><span>{chat.title || "New chat"}</span><small>{relativeTime(chat.updatedAt, now)}</small></button></li>)}</ul>
    </section>
    <section className={styles.card} aria-labelledby="overview-month">
      <div className={styles.head}><h2 id="overview-month">This month</h2></div>
      <p className={styles.stat}><strong>{thisMonth}</strong> chats {lastMonth > 0 || thisMonth > 0 ? <span className={delta >= 0 ? styles.up : styles.down}>{delta >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}{delta >= 0 ? "+" : "−"}{Math.abs(delta)} vs last month</span> : null}</p>
    </section>
  </div>;
}
