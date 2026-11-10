"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import {parseVendorCitation,parseCompositeVendorCitation,type VendorCitation} from "../diagnostics/contracts";
import type {ToolActivity} from '../agentic/contracts';
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useExternalStoreRuntime, WebSpeechDictationAdapter, type AppendMessage, type ThreadMessageLike } from "@assistant-ui/react";
import { Archive, ArchiveRestore, ArrowUp, Brain, Check, ChevronDown, Copy, ExternalLink, LogOut, Menu, MoreHorizontal, Search, Settings, SquarePen, Trash2, UserRound, X, Mic, MicOff, FileText, Volume2, Square } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./workspace.module.css";
import { enqueuePrompt, nextQueuedPrompt, type QueuedPrompt } from "./prompt-queue";
import { parseCapabilities, type Capabilities } from "./capabilities";
import { readChatStream, type ContextSummary, type Stage } from "./chat-stream";
import { publicSearchCitationUrl, webSearchSection } from "../search/citation-url";
import { MarkdownText } from "./markdown-text";
import { CitedMarkdown } from "./cited-markdown";
import { createGuardedDictation } from "./guarded-dictation";
import { Shimmer } from "./ai-elements/shimmer";
import { createReadAloud } from "./read-aloud";
import { clearActiveChat, readActiveChat, writeActiveChat } from "./active-chat";
import { completedAttempt, createAttemptGuard } from "./cancel-attempt";
import type { ProjectMemory } from "./guide-form";
import { ProjectMemoryPanel } from "./project-memory-panel";
import { guideDisabled, diagnosticDisabled, messagePayload, messageQuestion, type MessageInput } from "./guide-input";

type Citation = { id: string; title: string; sourceUrl: string; quote: string; sectionPath: string[]; capturedAt: string } | VendorCitation;
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; citations: Citation[]; toolCards?: {toolId:ToolActivity['toolId'];state:'complete'|'unknown'}[] };
type Chat = { id: string; title: string; updatedAt: string; status: "idle" | "pending" | "blocked" };
type Detail = { thread: Chat; messages: ChatMessage[]; projectMemory?: ProjectMemory | null };
const activityLabels: Record<Stage, string> = { routing_question: "Understanding your question", resolving_product: "Resolving product", reading_sources: "Reading sources", searching_sources: "Searching sources", searching_web: "Searching the web with Tavily", selecting_evidence: "Selecting evidence", checking_citations: "Checking citations", saving_answer: "Saving answer" };
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4 * 1024 * 1024) throw new Error("Response too large"); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
const MIN_WIDTH = 220, MAX_WIDTH = 360;
const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
const convertMessage = (message: ChatMessage): ThreadMessageLike => ({ id: message.id, role: message.role, content: [{ type: "text", text: message.text }], createdAt: new Date(message.createdAt) });
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia("(max-width: 760px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
const subscribeVoiceSupport = () => () => {};
const speechSupported = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
const suggestions = ["What is the Cytron Maker UNO?", "Tell me about the xC5 board", "What does the WS2812B ring listing say?"];
function tabStorage(): Storage | null { try { return window.sessionStorage; } catch { return null; } }

export function PandaAgentWorkspace({ plainLlm = false, nativeAssistant = false, previewReadOnly = false, guidesEnabled = false, diagnosticsEnabled = false, agenticEnabled = false, canManageSkills = false }: { plainLlm?: boolean; nativeAssistant?: boolean; previewReadOnly?: boolean; guidesEnabled?: boolean; diagnosticsEnabled?: boolean; agenticEnabled?: boolean; canManageSkills?: boolean }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return <p className={styles.loading}>Loading account…</p>;
  return <Workspace key={user.id} user={user} plainLlm={plainLlm} nativeAssistant={nativeAssistant} previewReadOnly={previewReadOnly} guidesEnabled={guidesEnabled} diagnosticsEnabled={diagnosticsEnabled} agenticEnabled={agenticEnabled} canManageSkills={canManageSkills} />;
}

function Workspace({ user, plainLlm, nativeAssistant, previewReadOnly, guidesEnabled, diagnosticsEnabled, agenticEnabled, canManageSkills }: { user: NonNullable<ReturnType<typeof useUser>["user"]>; plainLlm: boolean; nativeAssistant: boolean; previewReadOnly: boolean; guidesEnabled: boolean; diagnosticsEnabled: boolean; agenticEnabled:boolean; canManageSkills: boolean }) {
  const { signOut } = useClerk();
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => true);
  const [sidebarOverride, setSidebarOpen] = useState<boolean | null>(null);
  const sidebarOpen = sidebarOverride ?? !mobile;
  const [width, setWidth] = useState(260);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [threads, setThreads] = useState<Chat[]>([]);
  const [archived, setArchived] = useState(false);
  const [selectedArchived, setSelectedArchived] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selected, setSelected] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projectMemory, setProjectMemory] = useState<ProjectMemory | null>(null);
  const [view, setView] = useState<"chat" | "memory">("chat");
  const viewTitle = useRef<HTMLHeadingElement>(null);
  const [toolActivity,setToolActivity]=useState<ToolActivity[]>([]);
  const [activity, setActivity] = useState<Stage[]>([]);
  const [restoreDraft, setRestoreDraft] = useState<{ text: string; id: number } | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const attempts = useRef(createAttemptGuard());
  const currentAttempt = useRef<ReturnType<ReturnType<typeof createAttemptGuard>["begin"]> | null>(null);
  const cancelBusy = useRef(false);
  const chatLoading = useRef(false);
  const attemptQuestion = useRef("");
  const attemptIsGuide = useRef(false);
  const statusButton = useRef<HTMLButtonElement>(null);
  const [context, setContext] = useState<ContextSummary | null>(null);
  const [activityComplete, setActivityComplete] = useState(false);
  const [query, setQuery] = useState("");
  const [composerEpoch, setComposerEpoch] = useState(0);
  const dictation = useMemo(() => createGuardedDictation(), []);
  useEffect(() => () => dictation.cancel(), [dictation]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speechAvailable = useSyncExternalStore(subscribeVoiceSupport, speechSupported, () => false);
  const speech = useMemo(() => speechAvailable ? createReadAloud(window.speechSynthesis, text => new SpeechSynthesisUtterance(text), setSpeaking) : null, [speechAvailable]);
  useEffect(() => () => speech?.stop(), [speech]);
  const [busy, setBusy] = useState(false);
  // Workspace is keyed by user.id, so local queued text is discarded on account change.
  const [queue, setQueue] = useState<QueuedPrompt[]>([]);
  const [queueText, setQueueText] = useState("");
  const [queuePaused, setQueuePaused] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/panda-agent/capabilities", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? parseCapabilities(await readJson(response)) : null)
      .then(result => { if (!controller.signal.aborted) setCapabilities(result); })
      .catch(() => { if (!controller.signal.aborted) setCapabilities(null); });
    return () => controller.abort();
  }, [busy]);

  const [webSearch, setWebSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { if (!busy && uncertain) statusButton.current?.focus(); }, [busy, uncertain]);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const active = useRef(true);
  const resumeAttempted = useRef(false);
  const resumeChat = useEffectEvent((id: string) => loadChat(id));

  useEffect(() => {
    active.current = true;
    const generationRef = generation;
    return () => { active.current = false; generationRef.current++; requestController.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let loadingChat = false;
    fetch(`/api/panda-agent/chats${archived ? "?archived=true" : ""}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await readJson(response) as { threads: Chat[] };
      if (!active.current || controller.signal.aborted) return;
      setThreads(data.threads);
      if (!archived && !resumeAttempted.current) {
        resumeAttempted.current = true;
        const id = readActiveChat(tabStorage(), user.id);
        if (id && data.threads.some(thread => thread.id === id)) { loadingChat = true; await resumeChat(id); }
      }
    }).catch(() => { if (active.current && !controller.signal.aborted) setHistoryError("Could not load your chats. Please try again."); }).finally(() => { if (!loadingChat && active.current && !controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [archived, user.id]);

  async function loadChat(id: string) {
    if (busyRef.current || cancelBusy.current || chatLoading.current) return;
    chatLoading.current = true;
    if (selected?.id !== id) { if (queue.length) setQueuePaused(true); setRestoreDraft(null); currentAttempt.current = null; setProjectMemory(null); }
    const queried = currentAttempt.current?.threadId === id ? currentAttempt.current : null;
    speech?.stop();
    dictation.cancel();
    const ticket = ++generation.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(id)}${queried ? `?requestId=${encodeURIComponent(queried.requestId)}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await readJson(response) as Detail & { attemptStatus?: unknown };
      if (data?.thread?.id !== id || !Array.isArray(data.messages)) throw new Error("Invalid chat");
      if (queried && (typeof data.attemptStatus !== "string" || !["complete", "pending", "absent"].includes(data.attemptStatus))) throw new Error("Invalid attempt status");
      if (!active.current || ticket !== generation.current) return;
      if (queried && completedAttempt(currentAttempt.current, queried, data.attemptStatus)) currentAttempt.current = null;
      writeActiveChat(tabStorage(), user.id, data.thread.id);
      setProjectMemory(data.projectMemory ?? null);
      setComposerEpoch(previous => previous + 1); setSelected(data.thread); setSelectedArchived(archived); setMessages(data.messages); setActivity([]); setContext(null); setActivityComplete(false); setUncertain(Boolean(currentAttempt.current)); setWebSearch(false);
      setThreads(previous => previous.map(thread => thread.id === id ? data.thread : thread));
    } catch { if (active.current && ticket === generation.current) setError("Could not load this chat. Please try again."); }
    finally { chatLoading.current = false; if (active.current && ticket === generation.current) setLoading(false); }
  }

  async function onNew(message: AppendMessage) {
    const question = message.content.filter(part => part.type === "text").map(part => part.text).join("\n").trim();
    await sendMessage({ question, webSearch });
  }
  async function sendMessage(input: MessageInput) {
    if (("guide" in input && !guidesEnabled)||("diagnostic" in input&&!diagnosticsEnabled)||('agentic' in input&&!agenticEnabled)) return;
    const question = messageQuestion(input);
    if (!question || previewReadOnly || (nativeAssistant && (capabilities?.mode !== "native_assistant" || capabilities.status !== "ready")) || busyRef.current || loading || mutating || selectedArchived || uncertain || (selected && selected.status !== "idle")) return;
    if (question.length > 2000) { setError("Messages must be 2,000 characters or fewer. Shorten your message and try again."); return; }
    if ("question" in input && input.webSearch && question.length > 400) { setError("Web search accepts up to 400 characters. Shorten your public question or turn Web search off."); return; }
    if (!queue.length && !cancelBusy.current) setQueuePaused(false);
    const optimisticId = crypto.randomUUID();
    busyRef.current = true; setBusy(true); setMessages(previous => [...previous, { id: optimisticId, role: "user", text: question, createdAt: new Date().toISOString(), citations: [] }]); setActivity([]); setToolActivity([]); setContext(null); setActivityComplete(false); setError("");
    const controller = new AbortController(); requestController.current = controller;
    const requestId = crypto.randomUUID();
    attemptQuestion.current = question;
    attemptIsGuide.current = !("question" in input);
    let thread = selected;
    let attempt: ReturnType<ReturnType<typeof createAttemptGuard>["begin"]> | null = null;
    let completed = false;
    try {
      if (!thread) {
        const created = await fetch("/api/panda-agent/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}), cache: "no-store", signal: controller.signal });
        if (!created.ok) throw new Error("create");
        thread = ((await readJson(created)) as { thread: Chat }).thread;
        if (!active.current) return;
        writeActiveChat(tabStorage(), user.id, thread.id);
        setSelected(thread); setThreads(previous => [thread!, ...previous]);
      }
      if (controller.signal.aborted) throw new Error("Cancelled");
      attempt = attempts.current.begin(thread.id, requestId); currentAttempt.current = attempt;
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(thread.id)}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(messagePayload(requestId, input)), cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        if (response.status===409 && ('guide' in input || 'diagnostic' in input) && ("guide" in input ? guideDisabled(response.status,await readJson(response)) : diagnosticDisabled(response.status,await readJson(response)))) {
          if (!active.current || !attempts.current.current(attempt)) return;
          completed = true; setUncertain(false); setMessages(previous => previous.filter(message => message.id !== optimisticId));
          setError("guide" in input?"Project guides are disabled. You can continue with ordinary product chat.":"Diagnostics are disabled. Your error text is preserved; you can continue with ordinary product chat.");
          return;
        }
        throw new Error("message");
      }
      let data: Detail;
      if (response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
        if (!response.body) throw new Error("Missing stream");
        const result = await readChatStream(response.body, stage => { if (active.current && attempt && attempts.current.current(attempt)) setActivity(previous => [...previous, stage]); }, summary => { if (active.current && attempt && attempts.current.current(attempt)) setContext(summary); }, tool => {if(active.current && attempt && attempts.current.current(attempt)) setToolActivity(previous=>[...previous,tool]);});
        if (result.type !== "complete") throw new Error("Unconfirmed");
        data = result.data as Detail;
      } else data = await readJson(response) as Detail;
      if (!data?.thread || !Array.isArray(data.messages)) throw new Error("Invalid response");
      if (!active.current || !attempt || !attempts.current.current(attempt)) return;
      completed = true;
      if ("projectMemory" in data) setProjectMemory(data.projectMemory ?? null);
      setRestoreDraft(null); setSelected(data.thread); setMessages(data.messages); setActivityComplete(true); setThreads(previous => [data.thread, ...previous.filter(item => item.id !== data.thread.id)]);
    } catch {
      setQueuePaused(true);
      if (active.current && (!attempt || attempts.current.current(attempt))) {
        if (controller.signal.aborted && !attempt) {
          setMessages(previous => previous.filter(message => message.id !== optimisticId));
          if ("question" in input) setRestoreDraft({ text: question, id: Date.now() });
          setError(""); setUncertain(false); return;
        }
        if (!thread) setMessages(previous => previous.filter(message => message.id !== optimisticId));
        if ("question" in input) setRestoreDraft({ text: question, id: Date.now() }); setContext(null);
        setError(thread ? "The request could not be confirmed. Check the saved chat before sending again." : "Could not create a chat. Your message is ready to try again.");
        setUncertain(Boolean(thread));
      }
    } finally { if (!attempt || attempts.current.current(attempt)) { if (completed) currentAttempt.current = null; requestController.current = null; busyRef.current = false; if (!attempt) cancelBusy.current = false; if (active.current) setBusy(false); } }
  }
  async function cancelRequest() {
    setQueuePaused(true);
    if (cancelBusy.current || loading || chatLoading.current) return;
    const attempt = currentAttempt.current;
    if (!attempt && busyRef.current) { cancelBusy.current = true; requestController.current?.abort(); return; }
    const threadId = attempt?.threadId ?? selected?.id;
    if (!threadId) return;
    cancelBusy.current = true; setMutating(true);
    let confirmed = false;
    if (attempt) { attempts.current.invalidate(); requestController.current?.abort(); if (!attemptIsGuide.current) setRestoreDraft({ text: attemptQuestion.current, id: Date.now() }); }
    try {
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(threadId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt ? { requestId: attempt.requestId } : {}), cache: "no-store" });
      if (!response.ok) throw new Error("Unconfirmed");
      const data = await readJson(response) as Detail;
      if (data?.thread?.id !== threadId || !Array.isArray(data.messages)) throw new Error("Invalid response");
      if (!active.current) return;
      confirmed = true;
      if ("projectMemory" in data) setProjectMemory(data.projectMemory ?? null);
      setSelected(data.thread); setMessages(data.messages); setThreads(previous => [data.thread, ...previous.filter(item => item.id !== threadId)]);
      setActivity([]); setContext(null); setActivityComplete(false); setError(""); setUncertain(data.thread.status !== "idle");
    } catch {
      if (active.current) { setError("Cancellation could not be confirmed. Check status or cancel the pending request again."); setUncertain(true); }
    } finally {
      if (confirmed) currentAttempt.current = null;
      requestController.current = null; busyRef.current = false; cancelBusy.current = false;
      if (active.current) { setBusy(false); setMutating(false); }
    }
  }
  const baseDisabled = previewReadOnly || (nativeAssistant && (capabilities?.mode !== "native_assistant" || capabilities.status !== "ready")) || loading || mutating || selectedArchived || uncertain || selected?.status === "pending" || selected?.status === "blocked";
  const composerDisabled=baseDisabled;
  const dispatchQueued = useEffectEvent((item: QueuedPrompt) => {
    if (busyRef.current) return;
    setQueue(previous => previous.filter(entry => entry.id !== item.id));
    void sendMessage({ question: item.text, webSearch: false });
  });
  useEffect(() => {
    if (busy || queuePaused || baseDisabled || !selected || selected.status !== "idle") return;
    const item = nextQueuedPrompt(queue, selected.id);
    if (item) dispatchQueued(item);
  }, [busy, queuePaused, baseDisabled, selected, queue]);

  const runtime = useExternalStoreRuntime({ messages, convertMessage, onNew, isRunning: busy, isDisabled: composerDisabled, adapters: { dictation: dictation.adapter } });

  useEffect(() => {
    if (!sidebarOpen && restoreFocus.current) { restoreFocus.current = false; toggleRef.current?.focus(); }
    if (sidebarOpen && window.matchMedia("(max-width: 760px)").matches) closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!sidebarOpen || !window.matchMedia("(max-width: 760px)").matches) return;
      if (event.key === "Tab") {
        const items = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(item => {
          const closedMenu=item.closest('details:not([open])');
          return item.getClientRects().length > 0 && (!closedMenu || closedMenu.querySelector('summary')?.contains(item));
        });
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      if (event.key === "Escape" && !(event.target instanceof Element && event.target.closest("details[open]"))) { restoreFocus.current = true; setSidebarOpen(false); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);
  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next = width;
    if (event.key === "ArrowLeft") next -= 10; else if (event.key === "ArrowRight") next += 10; else if (event.key === "Home") next = MIN_WIDTH; else if (event.key === "End") next = MAX_WIDTH; else return;
    event.preventDefault(); setWidth(clampWidth(next));
  }
  function resizeWithPointer(event: PointerEvent<HTMLDivElement>) { if (event.buttons === 1) { event.currentTarget.setPointerCapture(event.pointerId); setWidth(clampWidth(event.clientX)); } }
  async function handleSignOut() { setSigningOut(true); setSignOutError(""); try { await signOut({ redirectUrl: "/" }); } catch { setSigningOut(false); setSignOutError("Could not sign you out. Please try again."); } }
  function newChat() { if (busyRef.current || loading || mutating) return; if (queue.length) setQueuePaused(true); setView("chat"); if (mobile) { restoreFocus.current = true; setSidebarOpen(false); } resumeAttempted.current = true; currentAttempt.current = null; clearActiveChat(tabStorage(), user.id); speech?.stop(); dictation.cancel(); setRestoreDraft(null); setComposerEpoch(previous => previous + 1); generation.current++; setSelected(null); setProjectMemory(null); setSelectedArchived(false); if (archived) { setThreads([]); setArchived(false); } setMessages([]); setActivity([]); setContext(null); setActivityComplete(false); setError(""); setUncertain(false); setWebSearch(false); setLoading(archived); }
  async function changeChat(thread: Chat, action: "archive" | "restore" | "delete") {
    if (busyRef.current || loading || mutating || thread.status !== "idle") return;
    if (action === "delete" && !window.confirm(`Permanently delete "${thread.title || "New chat"}"? This cannot be undone.`)) return;
    setMutating(true); setHistoryError("");
    try {
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(thread.id)}`, action === "delete"
        ? { method: "DELETE", cache: "no-store" }
        : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: action === "archive" }), cache: "no-store" });
      if (!response.ok) throw new Error();
      if (!active.current) return;
      setThreads(previous => previous.filter(item => item.id !== thread.id));
      if (selected?.id === thread.id) {
        clearActiveChat(tabStorage(), user.id);
        speech?.stop();
        dictation.cancel(); generation.current++; setRestoreDraft(null); setComposerEpoch(previous => previous + 1); setSelected(null); setProjectMemory(null); setSelectedArchived(false); setMessages([]); setActivity([]); setContext(null); setActivityComplete(false); setUncertain(false); setWebSearch(false);
      }
    } catch { if (active.current) setHistoryError(`Could not ${action} this chat. Please try again.`); }
    finally { if (active.current) setMutating(false); }
  }
  const displayName = user.fullName?.trim() || user.firstName?.trim() || "Your account";

  return <AssistantRuntimeProvider runtime={runtime}><div className={styles.workspace}>
    {sidebarOpen && <button className={styles.backdrop} type="button" aria-label="Close conversation sidebar" onClick={() => { restoreFocus.current = true; setSidebarOpen(false); }} />}
    <aside onKeyDownCapture={event => { if (event.key !== "Escape" || !(event.target instanceof Element)) return; const menu = event.target.closest("details[open]"); if (menu instanceof HTMLDetailsElement) { event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector<HTMLElement>("summary")?.focus(); } }} ref={sidebarRef} id="agent-sidebar" className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`} style={{ width }} role={mobile && sidebarOpen ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-label="Conversation sidebar">
      <div className={styles.sidebarTop}><div className={styles.sidebarHeading}><Link href="/" className={styles.brand} aria-label="PandaByte home"><span className={styles.logoSmall}><Image src="/brand/pandabyte-logo.png" alt="" width={558} height={564} /></span><span>PandaByte</span></Link><button ref={closeRef} className={styles.closeSidebar} type="button" aria-label="Close sidebar" onClick={() => { restoreFocus.current = true; setSidebarOpen(false); }}><X size={19} /></button></div>
        <button className={styles.newChat} disabled={busy || loading || mutating} type="button" onClick={newChat}><SquarePen size={18} /> New chat</button>
        <label className={styles.search}><Search size={16} aria-hidden="true"/><span className={styles.srOnly}>Search chats</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats" /></label>
        <div className={styles.historyHeading}><p className={styles.sidebarLabel}>{archived ? "Archived chats" : "Recent chats"}</p><button type="button" disabled={busy || loading || mutating} onClick={() => { setThreads([]); setLoading(true); setArchived(!archived); setQuery(""); setHistoryError(""); }}>{archived ? "Back to chats" : "Archived"}</button></div>
        {historyError && <p className={styles.error} role="alert">{historyError}</p>}
        <nav className={styles.history} aria-label={archived ? "Archived chats" : "Recent chats"}>{threads.filter(thread => thread.title.toLowerCase().includes(query.toLowerCase())).map(thread => <div className={styles.historyRow} key={thread.id}>
          <button className={styles.historySelect} type="button" disabled={busy || mutating} aria-current={selected?.id === thread.id ? "page" : undefined} onClick={() => { setView("chat"); void loadChat(thread.id); if (window.matchMedia("(max-width: 760px)").matches) { restoreFocus.current = true; setSidebarOpen(false); } }}><span className={styles.historyTitle}>{thread.title || "New chat"}</span>{thread.status !== "idle" && <span className={styles.historyStatus}>{thread.status}</span>}</button>
          <details className={styles.chatMenu} name="sidebar-menu" onKeyDown={closeMenuOnEscape}><summary className={styles.menuTrigger} aria-label={`Actions for ${thread.title || "New chat"}`}><MoreHorizontal size={18} /></summary><div className={styles.menuPanel}>
            <button type="button" aria-label={archived ? "Restore chat" : "Archive chat"} disabled={busy || loading || mutating || thread.status !== "idle"} title={thread.status !== "idle" ? "Unavailable while this chat needs review" : undefined} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeChat(thread, archived ? "restore" : "archive"); }}>{archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archived ? "Restore" : "Archive"}</button>
            <button type="button" aria-label="Delete chat" disabled={busy || loading || mutating || thread.status !== "idle"} title={thread.status !== "idle" ? "Unavailable while this chat needs review" : undefined} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeChat(thread, "delete"); }}><Trash2 size={16} />Delete</button>
          </div></details></div>)}{!loading && !historyError && !threads.length && <p>{archived ? "No archived chats." : "No saved chats yet."}</p>}{!loading && threads.length > 0 && !threads.some(thread => thread.title.toLowerCase().includes(query.toLowerCase())) && <p>No chats match your search.</p>}</nav>
      </div><div className={styles.account}><details className={styles.accountMenu} name="sidebar-menu" onKeyDown={closeMenuOnEscape}><summary className={styles.accountTrigger} aria-label="Account menu"><span className={styles.avatar} aria-hidden="true"><UserAvatar rounded /></span><span className={styles.accountName}>{displayName}</span><MoreHorizontal size={18} /></summary><div className={styles.accountPanel}><div className={styles.identity}><span className={styles.identityText}><strong>{displayName}</strong><span>{user.primaryEmailAddress?.emailAddress ?? "Signed in"}</span></span></div><nav className={styles.accountLinks} aria-label="Account and workspace"><button type="button" aria-current={view === "memory" ? "page" : undefined} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setView("memory"); if (mobile) { restoreFocus.current = false; setSidebarOpen(false); } requestAnimationFrame(() => viewTitle.current?.focus()); }}><Brain size={16} aria-hidden="true" /> Memory &amp; context</button><Link href="/account"><UserRound size={16} /> Account</Link><Link href="/account/settings"><Settings size={16} /> Account settings</Link>{canManageSkills && <><Link href="/panda-agent/skills"><Settings size={16} /> Manage agent skills</Link><Link href="/panda-agent/documentation"><FileText size={16}/> Review vendor documentation</Link></>}</nav><div className={styles.themeMenu}><span>Appearance</span><ThemeToggle /></div>{signOutError && <p className={styles.error} role="alert">{signOutError}</p>}<button className={styles.logout} type="button" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={16} />{signingOut ? "Signing out…" : "Logout"}</button></div></details></div>
    </aside>
    {sidebarOpen && <div className={styles.resizer} role="separator" aria-label="Resize conversation sidebar" aria-controls="agent-sidebar" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex={0} onKeyDown={resizeWithKeyboard} onPointerDown={resizeWithPointer} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(clampWidth(event.clientX)); }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />}
    <main id="main" tabIndex={-1} className={styles.main} inert={mobile && sidebarOpen}><header className={styles.header}><div className={styles.headerStart}><button ref={toggleRef} className={styles.menuButton} type="button" aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen} aria-controls="agent-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><div className={styles.model}><strong>Panda Agent</strong><span>{capabilities?.model ?? "Model unavailable"} · {capabilities?.status === "ready" ? "Ready" : "Unavailable"}</span></div><span className={styles.badge}>Preview</span></div></header>
      <section className={styles.memoryView} hidden={view !== "memory"} aria-labelledby="memory-title"><h1 id="memory-title" ref={viewTitle} tabIndex={-1}>Memory &amp; context</h1><p>{nativeAssistant ? "Saved chat history and project memory are separate. Neither is supplied to native requests yet. Native working context is not shown here." : "Review the project context saved with the selected conversation."}</p>{!selected ? <p>Select a saved chat to review its project context.</p> : loading ? <p role="status">Loading chat context...</p> : <ProjectMemoryPanel key={selected.id} thread={selected.id} owner={user.id} memory={projectMemory} disabled={previewReadOnly || busy || mutating || selectedArchived || uncertain || selected.status !== "idle"} onMemory={setProjectMemory} />}<button type="button" onClick={() => { setView("chat"); requestAnimationFrame(() => { const input = document.querySelector<HTMLTextAreaElement>('[aria-label="Message Panda Agent"]'); if (input && !input.disabled) input.focus(); else document.getElementById("main")?.focus(); }); }}>Back to conversation</button></section><ThreadPrimitive.Root className={styles.thread} hidden={view !== "chat"}><ThreadPrimitive.Viewport className={styles.viewport}>
        {!messages.length && !busy && <Welcome plainLlm={plainLlm || nativeAssistant} nativeAssistant={nativeAssistant} disabled={Boolean(composerDisabled)} />}
        <div className={styles.messageList}><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage: () => <AssistantMessage messages={messages} speech={speech} speaking={speaking} nativeAssistant={nativeAssistant} /> }} />{busy && toolActivity.length > 0 && <ToolProgress tools={toolActivity} />}{(busy || activity.length > 0) && <Activity stages={activity} context={context} busy={busy} complete={activityComplete} />}</div>
      </ThreadPrimitive.Viewport><div className={styles.composerArea}>{busy && <div className={styles.working} role="status"><Shimmer>Working…</Shimmer></div>}{queue.length > 0 && <section className={styles.queue} aria-label="Local prompt queue"><div className={styles.queueHeader}><strong>Queued for {threads.find(thread => thread.id === queue[0].threadId)?.title || "saved chat"} · {queue.length}/3</strong>{queuePaused && <span>Paused</span>}</div><ol>{queue.map((item, index) => <li key={item.id}><span>{item.text}</span><button type="button" aria-label={`Remove queued prompt ${index + 1}`} onClick={() => setQueue(previous => previous.filter(entry => entry.id !== item.id))}>Remove</button></li>)}</ol>{queuePaused && <button type="button" disabled={busy || baseDisabled || !selected || !nextQueuedPrompt(queue, selected.id)} onClick={() => setQueuePaused(false)}>Resume queue</button>}<p>Queued prompts are kept in this page only and are lost on reload.</p></section>}{busy && <form className={styles.queueEntry} onSubmit={event => { event.preventDefault(); if (!selected || mutating || cancelBusy.current || queuePaused || (queue.length > 0 && queue[0].threadId !== selected.id) || !queueText.trim()) return; const updated = enqueuePrompt(queue, { id: crypto.randomUUID(), threadId: selected.id, text: queueText }); if (updated !== queue) { setQueue(updated); setQueueText(""); } }}><label htmlFor="queue-prompt">Queue a follow-up</label><div><input id="queue-prompt" value={queueText} maxLength={2000} onChange={event => setQueueText(event.target.value)} placeholder={!selected ? "Waiting for chat to be created" : queue.length && queue[0].threadId !== selected.id ? "Queue belongs to another chat" : "Type a follow-up"} disabled={!selected || mutating || cancelBusy.current || queuePaused || queue.length >= 3 || (queue.length > 0 && queue[0].threadId !== selected.id)} /><button type="submit" disabled={!selected || mutating || cancelBusy.current || queuePaused || queue.length >= 3 || (queue.length > 0 && queue[0].threadId !== selected.id) || !queueText.trim()}>Add</button></div></form>}{nativeAssistant ? <div className={styles.modeNotice}><span>General assistant · Each request is independent; saved chat history is not included. No connected documentation or tools. Verify product facts.</span>{capabilities?.budget && <span>Remaining allowance: ${(capabilities.budget.remainingNanoUsd / 1000000000).toFixed(4)} of $1</span>}{capabilities?.status !== "ready" && <span role="status">{capabilities?.reason === "disabled" ? "New answers are disabled." : capabilities?.reason === "runtime_unavailable" ? "The assistant runtime is unavailable." : capabilities?.reason === "privacy_or_budget_unavailable" ? "Privacy or budget requirements are not met." : "Assistant readiness could not be confirmed."}</span>}</div> : plainLlm && <p className={styles.status} role="status">GPT-6 Luna · General chat. RAG and tools are off; product facts are unverified.</p>}{previewReadOnly && <p className={styles.status} role="status">Panda Agent is disabled. Existing chat records are preserved. New answers and web search are unavailable.</p>}{error && <p className={styles.error} role="alert">{error}</p>}{selectedArchived && <p className={styles.status} role="status">Restore this chat to continue the conversation.</p>}{selected && (uncertain || selected.status !== "idle") && <div className={styles.status} role="status"><span>{selected.status === "pending" ? "This chat has a pending request." : selected.status === "blocked" ? "This chat needs review before it can continue." : "Check this chat for the saved result. The outcome is not yet confirmed."}</span><button ref={statusButton} type="button" disabled={busy || mutating} onClick={() => void loadChat(selected.id)}>Check status</button>{(uncertain || selected.status === "pending") && <button type="button" disabled={busy || loading || mutating || previewReadOnly} onClick={() => void cancelRequest()}>Cancel pending request</button>}</div>}<ChatComposer key={composerEpoch} restoreDraft={restoreDraft} webSearch={webSearch} disabled={busy || composerDisabled} running={busy} cancelDisabled={loading || mutating} onCancel={() => void cancelRequest()} cancelDictation={dictation.cancel} /><p className={styles.disclaimer}>Responses may be limited. Verify hardware connections before applying power.</p></div></ThreadPrimitive.Root>
    </main></div></AssistantRuntimeProvider>;
}

function closeMenuOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || !event.currentTarget.open) return;
  event.preventDefault(); event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
}

function ChatComposer({ restoreDraft, webSearch, disabled, running, cancelDisabled, onCancel, cancelDictation }: { restoreDraft: { text: string; id: number } | null; webSearch: boolean; disabled: boolean; running: boolean; cancelDisabled: boolean; onCancel: () => void; cancelDictation: () => void }) {
  const text = useAuiState(state => state.composer.text);
  const listening = useAuiState(state => state.composer.dictation != null);
  const aui = useAui();
  const voiceSupported = useSyncExternalStore(subscribeVoiceSupport, WebSpeechDictationAdapter.isSupported, () => false);
  useEffect(() => { if (restoreDraft) aui.thread.composer().setText(restoreDraft.text); }, [aui, restoreDraft]);
  useEffect(() => { if (disabled) cancelDictation(); }, [disabled, cancelDictation]);
  const tooLong = text.trim().length > 2000;
  const invalidSearch = webSearch && (text.trim().length > 400 || /[\r\n]/.test(text.trim()));
  return <ComposerPrimitive.Root className={styles.composer} onSubmit={event => { if (invalidSearch || tooLong) event.preventDefault(); else cancelDictation(); }}>
    <ComposerPrimitive.Input autoFocus={Boolean(restoreDraft) && !disabled} aria-label="Message Panda Agent" aria-describedby="composer-notice" aria-invalid={invalidSearch || tooLong || undefined} placeholder={webSearch ? "Ask a public web question…" : "Ask anything…"} maxLength={webSearch ? 400 : 2000} rows={2} onKeyDown={event => { if ((invalidSearch || tooLong) && event.key === "Enter" && !event.shiftKey) event.preventDefault(); }} />
    <div className={styles.composerActions}><div className={styles.actionGroup}></div><div className={styles.actionGroup}>{listening ? <ComposerPrimitive.StopDictation className={styles.iconAction} aria-label="Stop dictation" aria-describedby="voice-notice" disabled={disabled}><MicOff size={18}/></ComposerPrimitive.StopDictation> : voiceSupported ? <ComposerPrimitive.Dictate className={styles.iconAction} aria-label="Start voice dictation" aria-describedby="voice-notice" disabled={disabled}><Mic size={18}/></ComposerPrimitive.Dictate> : <button className={styles.iconAction} type="button" aria-label="Voice dictation unavailable" aria-describedby="voice-notice" disabled><Mic size={18}/></button>}{running ? <button className={styles.sendButton} type="button" aria-label="Stop request" title="Stop request" disabled={cancelDisabled} onClick={onCancel}><Square size={17} aria-hidden="true" /></button> : <ComposerPrimitive.Send className={styles.sendButton} aria-label="Send message" disabled={disabled || invalidSearch || tooLong}><ArrowUp size={19} /></ComposerPrimitive.Send>}</div></div>
    <p className={styles.searchNotice} id="composer-notice" role="status">{tooLong ? "Messages must be 2,000 characters or fewer. Shorten your message to send." : invalidSearch ? "Use one public question, on one line, up to 400 characters. Shorten it or turn Search off." : ""}</p>
    <details className={styles.voiceDisclosure}><summary>Voice privacy</summary><p id="voice-notice">{voiceSupported ? listening ? "Listening. Stop dictation before editing if needed. Speech may use an online browser service." : "Voice dictation may use an online browser service. If it stops, check microphone permission." : "Voice dictation is unavailable in this browser. Type your message instead."}</p></details>
  </ComposerPrimitive.Root>;
}

function Welcome({ disabled, plainLlm, nativeAssistant }: { disabled: boolean; plainLlm: boolean; nativeAssistant: boolean }) { const aui = useAui(); return <section className={styles.intro} aria-labelledby="panda-agent-title"><span className={styles.logo}><Image src="/brand/pandabyte-logo.png" alt="PandaByte" width={558} height={564} /></span><h1 id="panda-agent-title">What are you working on?</h1><p>{plainLlm ? "Ask a general question. Product documentation is not connected in this mode." : "Ask about PandaByte products and their approved documentation."}</p><div className={styles.suggestions}>{(nativeAssistant ? ["Explain how an I2C bus works.", "Help me plan an embedded sensor project.", "Draft a bill of materials with unknown quantities clearly marked."] : plainLlm ? ["Explain what a microcontroller does in two sentences.", "Help me outline a simple electronics project.", "What can you help me with?"] : suggestions).map(text => <button type="button" disabled={disabled} key={text} onClick={() => { aui.thread.composer().setText(text); }}>{text}</button>)}</div></section>; }
function UserMessage() { return <MessagePrimitive.Root className={styles.userMessage}><MessagePrimitive.Parts /></MessagePrimitive.Root>; }
const toolNames:Record<ToolActivity['toolId'],string>={panda_scoped_rag:'Approved sources',fetch_public_docs_mcp:'Official documentation',convert_units:'Unit conversion',format_bom:'Component outline'};
function ToolProgress({tools}:{tools:ToolActivity[]}) {
 const latest=tools[tools.length-1];
 return <p className={styles.status} role="status">{toolNames[latest.toolId]}: {latest.state==='running'?'Working':latest.state==='unknown'?'Outcome unknown':latest.origin==='recorded'?'Previously recorded result':'Complete'}</p>;
}
function SavedToolCards({cards}:{cards:NonNullable<ChatMessage['toolCards']>}) {
 return <div className={styles.sources}><strong>Observed tools</strong>{cards.map((card,index)=><div className={styles.savedTool} key={index}>{toolNames[card.toolId]} · {card.state==='complete'?'Complete':'Outcome unknown'}</div>)}</div>;
}
const externalReferenceUrl='https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html';
function ExternalReference({text}:{text:string}) {
 const match=text.match(/Unreviewed external reference: GPIO & RTC GPIO \(([^)]+)\) https:\/\/docs\.espressif\.com\/projects\/esp-idf\/en\/v5\.5\.1\/esp32\/api-reference\/peripherals\/gpio\.html/);
 if(!match || !Number.isFinite(Date.parse(match[1]))) return null;
 return <details className={styles.sourceCard}><summary>External reference · ESP-IDF 5.5.1 <ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.sourceContent}><strong>GPIO &amp; RTC GPIO</strong><small>docs.espressif.com · retrieved {match[1]}</small><p>This reference does not establish board applicability or wiring.</p><a href={externalReferenceUrl} target="_blank" rel="noopener noreferrer">Open reference <ExternalLink size={13} aria-hidden="true" /></a></div></details>;
}
function AssistantMessage({ messages, speech, speaking, nativeAssistant }: { messages: ChatMessage[]; speech: ReturnType<typeof createReadAloud> | null; speaking: string | null; nativeAssistant: boolean }) {
  const id = useAuiState(state => state.message.id);
  const item = messages.find(message => message.id === id);
  const [copied, setCopied] = useState(false);
  return <MessagePrimitive.Root className={styles.assistantMessage}><div className={styles.messageLabel}>Panda Agent</div><div className={styles.messageText}><MessagePrimitive.Parts components={{ Text: item?.citations.length ? () => <CitedMarkdown messageId={item.id} citationIds={item.citations.map(citation => citation.id)} /> : MarkdownText }} /></div>{!!item?.toolCards?.length && <SavedToolCards cards={item.toolCards} />}{!!item?.citations.length && <div className={styles.sources}><strong>Sources</strong>{item.citations.map(citation => <SourceCitation key={citation.id} citation={citation} messageId={item.id} />)}</div>}{item && !nativeAssistant && <ExternalReference text={item.text} />}{item && <div className={styles.messageActions}><button className={styles.copy} type="button" onClick={() => { void navigator.clipboard.writeText(item.text).then(() => setCopied(true)).catch(() => setCopied(false)); }}><Copy size={15} /> {copied ? "Copied" : "Copy"}</button><button className={styles.copy} type="button" disabled={!speech} title={speech ? undefined : "Read aloud is unavailable in this browser"} onClick={() => speaking === item.id ? speech?.stop() : speech?.play(item.id, item.text)}>{speaking === item.id ? <Square size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />} {speaking === item.id ? "Stop reading" : speech ? "Read aloud" : "Read aloud unavailable"}</button></div>}</MessagePrimitive.Root>;
}

function SourceCitation({ citation, messageId }: { citation: Citation; messageId: string }) {
  const webExcerpt = citation.sectionPath.length === 1 && citation.sectionPath[0] === webSearchSection;
  const vendor="kind" in citation?(parseVendorCitation(citation)??parseCompositeVendorCitation(citation)):null;
  const href = ("kind" in citation?!!vendor:publicSearchCitationUrl(citation.sourceUrl)) ? citation.sourceUrl : undefined;
  const domain = href ? new URL(href).hostname : "Link unavailable";
  return <details className={styles.sourceCard} id={`source-${messageId}-${citation.id}`}>
    <summary><span className={styles.sourceSummary}><span className={styles.sourceId}>{citation.id}</span><span><strong>{citation.title}</strong><small>{domain}</small></span></span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className={styles.sourceContent}>
      {webExcerpt && <strong className={styles.sourceKind}>Web search excerpt</strong>}{vendor&&<strong className={styles.sourceKind}>Espressif · {vendor.chip.toUpperCase()} · ESP-IDF {vendor.frameworkVersion} · reviewed API reference</strong>}
      <blockquote>{citation.quote}</blockquote>
      <small>{webExcerpt ? "Tavily search excerpt; full page and manufacturer claims not verified" : citation.sectionPath.join(" / ")} · {webExcerpt ? "retrieved" : "captured"} {citation.capturedAt}</small>
      {href && <a href={href} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={13} aria-hidden="true" /></a>}
    </div>
  </details>;
}

function Activity({ stages, context, busy, complete }: { stages: Stage[]; context: ContextSummary | null; busy: boolean; complete: boolean }) {
  const label = complete ? "Answer saved" : busy ? stages.length ? activityLabels[stages[stages.length - 1]] : "Sending…" : "Activity interrupted";
  return <div className={styles.activity}><p className={styles.activityStatus} role="status"><span className={busy ? styles.activityPulse : styles.activityMark} aria-hidden="true">{complete ? <Check size={13} /> : null}</span>{busy ? <Shimmer>{label}</Shimmer> : <span>{label}</span>}</p>{busy && <div className={styles.activitySkeleton} aria-hidden="true"><span /><span /></div>}{stages.length > 0 && <details className={styles.activityDetails}><summary>View activity <ChevronDown size={15} aria-hidden="true" /></summary><ol>{stages.map((stage, index) => <li key={index}>{activityLabels[stage]}</li>)}</ol>{context && <p className={styles.contextSummary}>Supplied context: {context.fragments} {context.fragments === 1 ? "fragment" : "fragments"}, {context.characters.toLocaleString()} characters{context.duplicatesRemoved > 0 ? ` · ${context.duplicatesRemoved} duplicate ${context.duplicatesRemoved === 1 ? "fragment" : "fragments"} removed` : ""} (limit {context.limitCharacters.toLocaleString()} characters).</p>}</details>}</div>;
}
