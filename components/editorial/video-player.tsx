"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import styles from "./editorial.module.css";

export function VideoPlayer({ videoId, title, compact = false, inline = false }: { videoId: string | null; title: string; compact?: boolean; inline?: boolean }) {
  const [started, setStarted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (started) iframeRef.current?.focus();
  }, [started]);

  if (!videoId) return <p className={styles.videoNote}>This video link is unavailable.</p>;
  if (started || inline) {
    return <div className={`${styles.videoFrame} ${compact ? styles.videoFrameCompact : ""}`}>
      <iframe
        ref={iframeRef}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
        title={`Watch ${title}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>;
  }
  return <div className={`${styles.videoFrame} ${compact ? styles.videoFrameCompact : ""}`}>
    <div className={styles.videoPoster}>
      <p>{title}</p>
      <button className={styles.videoButton} type="button" onClick={() => setStarted(true)}><Play aria-hidden="true" size={16} /> Play video</button>
      <p className={styles.videoNote}>The YouTube player loads after you choose to play.</p>
    </div>
  </div>;
}
