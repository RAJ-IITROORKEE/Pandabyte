"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import styles from "./voice-button.module.css";

type Phase = "idle" | "recording" | "transcribing";
const MAX_SECONDS = 60;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function VoiceButton({ disabled, onText }: { disabled: boolean; onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = useRef(true);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; });

  const fail = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => { if (live.current) setMessage(""); }, 5000);
  }, []);

  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (timer.current) clearInterval(timer.current);
      const active = recorder.current;
      if (active) { active.ondataavailable = null; active.onstop = null; if (active.state === "recording") active.stop(); active.stream.getTracks().forEach(track => track.stop()); }
    };
  }, []);
  useEffect(() => { if (disabled) stop(); }, [disabled, stop]);

  async function upload(blob: Blob) {
    setPhase("transcribing");
    try {
      const body = new FormData();
      body.append("audio", blob, "voice");
      const response = await fetch("/api/panda-agent/transcribe", { method: "POST", body });
      if (!response.ok) throw new Error("failed");
      const { text } = await response.json() as { text?: string };
      if (!live.current) return;
      if (text) onTextRef.current(text); else fail("No speech detected.");
    } catch { if (live.current) fail("Voice transcription is unavailable. Try again."); }
    finally { if (live.current) setPhase("idle"); }
  }

  async function start() {
    setMessage("");
    const mime = typeof MediaRecorder === "undefined" ? undefined : TYPES.find(type => MediaRecorder.isTypeSupported(type));
    if (!navigator.mediaDevices?.getUserMedia || !mime) return fail("Voice recording is not supported in this browser.");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return fail("Microphone blocked. Allow it in the browser to use voice."); }
    if (!live.current) { stream.getTracks().forEach(track => track.stop()); return; }
    const chunks: Blob[] = [];
    const active = new MediaRecorder(stream, { mimeType: mime });
    recorder.current = active;
    active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    active.onstop = () => {
      if (timer.current) clearInterval(timer.current);
      stream.getTracks().forEach(track => track.stop());
      recorder.current = null;
      if (live.current && chunks.length) void upload(new Blob(chunks, { type: active.mimeType || mime }));
      else if (live.current) setPhase("idle");
    };
    active.start();
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => setSeconds(value => { if (value + 1 >= MAX_SECONDS) stop(); return value + 1; }), 1000);
  }

  const recording = phase === "recording";
  const busy = phase === "transcribing";
  return <span className={styles.root}>
    <button className={styles.button} type="button" aria-pressed={recording} aria-label={recording ? "Stop recording" : busy ? "Transcribing voice" : "Record voice message"} title="Voice is transcribed on our server by a zero-retention speech model." disabled={disabled || busy} onClick={() => recording ? stop() : void start()} data-recording={recording || undefined}>
      {recording ? <><span className={styles.dot} aria-hidden="true" /><span className={styles.time}>{seconds}s</span><Square size={14} aria-hidden="true" /></> : busy ? <Loader2 className={styles.spin} size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
    </button>
    <span className={styles.message} role="status" aria-live="polite">{message}</span>
  </span>;
}
