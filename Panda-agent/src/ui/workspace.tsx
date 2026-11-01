"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useExternalStoreRuntime, WebSpeechDictationAdapter, type AppendMessage, type ThreadMessageLike } from "@assistant-ui/react";
import { Archive, ArchiveRestore, ArrowUp, Check, ChevronDown, Copy, ExternalLink, Globe, LogOut, Menu, MoreHorizontal, Search, Settings, SquarePen, Trash2, UserRound, X, Plus, Mic, MicOff, FileText, Volume2, Square } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./workspace.module.css";
import { readChatStream, type ContextSummary, type Stage, type ToolActivity } from "./chat-stream";
import { publicSearchCitationUrl, webSearchSection } from "../search/citation-url";
import { MarkdownText } from "./markdown-text";
import { CitedMarkdown } from "./cited-markdown";
import { validateLocalFiles } from "./composer-helpers";
import { createGuardedDictation } from "./guarded-dictation";
import { Shimmer } from "./ai-elements/shimmer";
import { createReadAloud } from "./read-aloud";

type Citation = { id: string; title: string; sourceUrl: string; quote: string; sectionPath: string[]; capturedAt: string };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; citations: Citation[]; provisional?: boolean };
type Chat = { id: string; title: string; updatedAt: string; status: "idle" | "pending" | "blocked" };
type Detail = { thread: Chat; messages: ChatMessage[] };
const activityLabels: Record<Stage, string> = { routing_question: "Understanding your question", resolving_product: "Resolving product", reading_sources: "Reading sources", searching_sources: "Searching sources", searching_web: "Searching the web with Tavily", opencode_queued: "Queued for OpenCode", opencode_working: "OpenCode is working", checking_citations: "Checking citations", saving_answer: "Saving answer" };
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
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia("(max-width: 700px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
const subscribeVoiceSupport = () => () => {};
const speechSupported = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const isMobile = () => window.matchMedia("(max-width: 700px)").matches;
const suggestions = ["What is the Cytron Maker UNO?", "Tell me about the xC5 board", "What does the WS2812B ring listing say?"];

export function PandaAgentWorkspace({ previewReadOnly = false }: { previewReadOnly?: boolean }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return <p className={styles.loading}>Loading account…</p>;
  return <Workspace key={user.id} user={user} previewReadOnly={previewReadOnly} />;
}

function Workspace({ user, previewReadOnly }: { user: NonNullable<ReturnType<typeof useUser>["user"]>; previewReadOnly: boolean }) {
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
  const [activity, setActivity] = useState<Stage[]>([]);
  const [draft, setDraft] = useState("");
  const [tools, setTools] = useState<ToolActivity[]>([]);
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
  const [webSearch, setWebSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    const generationRef = generation;
    return () => { active.current = false; generationRef.current++; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/panda-agent/chats${archived ? "?archived=true" : ""}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await readJson(response) as { threads: Chat[] };
      if (active.current && !controller.signal.aborted) setThreads(data.threads);
    }).catch(() => { if (active.current && !controller.signal.aborted) setHistoryError("Could not load your chats. Please try again."); }).finally(() => { if (active.current && !controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [archived]);

  async function loadChat(id: string) {
    if (busyRef.current) return;
    speech?.stop();
    dictation.cancel();
    const ticket = ++generation.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await readJson(response) as Detail;
      if (!active.current || ticket !== generation.current) return;
      setComposerEpoch(previous => previous + 1); setSelected(data.thread); setSelectedArchived(archived); setMessages(data.messages); setActivity([]); setDraft(""); setTools([]); setContext(null); setActivityComplete(false); setUncertain(false); setWebSearch(false);
      setThreads(previous => previous.map(thread => thread.id === id ? data.thread : thread));
    } catch { if (active.current && ticket === generation.current) setError("Could not load this chat. Please try again."); }
    finally { if (active.current && ticket === generation.current) setLoading(false); }
  }

  async function onNew(message: AppendMessage) {
    const question = message.content.filter(part => part.type === "text").map(part => part.text).join("\n").trim();
    if (!question || previewReadOnly || busyRef.current || loading || mutating || selectedArchived || uncertain || (selected && selected.status !== "idle")) return;
    if (question.length > 2000) { setError("Messages must be 2,000 characters or fewer. Shorten your message and try again."); return; }
    if (webSearch && question.length > 400) { setError("Web search accepts up to 400 characters. Shorten your public question or turn Web search off."); return; }
    busyRef.current = true; setBusy(true); setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "user", text: question, createdAt: new Date().toISOString(), citations: [] }]); setActivity([]); setDraft(""); setTools([]); setContext(null); setActivityComplete(false); setError("");
    let thread = selected;
    try {
      if (!thread) {
        const created = await fetch("/api/panda-agent/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}), cache: "no-store" });
        if (!created.ok) throw new Error("create");
        thread = ((await readJson(created)) as { thread: Chat }).thread;
        if (!active.current) return;
        setSelected(thread); setThreads(previous => [thread!, ...previous]);
      }
      const response = await fetch(`/api/panda-agent/chats/${encodeURIComponent(thread.id)}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ requestId: crypto.randomUUID(), question, ...(webSearch ? { webSearch: true } : {}) }), cache: "no-store" });
      if (!response.ok) throw new Error("message");
      let data: Detail;
      if (response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
        if (!response.body) throw new Error("Missing stream");
        const result = await readChatStream(response.body, stage => { if (active.current) setActivity(previous => [...previous, stage]); }, summary => { if (active.current) setContext(summary); }, {
          onText: delta => { if (active.current) setDraft(previous => previous + delta); },
          onReset: () => { if (active.current) setDraft(""); },
          onTool: event => { if (active.current) setTools(previous => [...previous, event]); },
        });
        if (result.type !== "complete") throw new Error("Unconfirmed");
        data = result.data as Detail;
      } else data = await readJson(response) as Detail;
      if (!data?.thread || !Array.isArray(data.messages)) throw new Error("Invalid response");
      if (!active.current) return;
      setDraft(""); setSelected(data.thread); setMessages(data.messages); setActivityComplete(true); setThreads(previous => [data.thread, ...previous.filter(item => item.id !== data.thread.id)]);
    } catch {
      if (active.current) {
        setDraft(""); setContext(null);
        setError(thread ? "The request could not be confirmed. Check the saved chat before sending again." : "Could not create a chat. Refresh the page before trying again.");
        setUncertain(true);
      }
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  const composerDisabled = previewReadOnly || loading || mutating || selectedArchived || uncertain || selected?.status === "pending" || selected?.status === "blocked";
  const presentedMessages: ChatMessage[] = draft ? [...messages, { id: "panda-provisional-draft", role: "assistant", text: draft, createdAt: new Date().toISOString(), citations: [], provisional: true }] : messages;
  const runtime = useExternalStoreRuntime({ messages: presentedMessages, convertMessage, onNew, isRunning: busy, isDisabled: composerDisabled, adapters: { dictation: dictation.adapter } });

  useEffect(() => {
    if (!sidebarOpen && restoreFocus.current) { restoreFocus.current = false; toggleRef.current?.focus(); }
    if (sidebarOpen && window.matchMedia("(max-width: 700px)").matches) closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!sidebarOpen || !window.matchMedia("(max-width: 700px)").matches) return;
      if (event.key === "Tab") {
        const items = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(item => item.getClientRects().length > 0);
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
  function newChat() { if (busyRef.current || mutating) return; speech?.stop(); dictation.cancel(); setComposerEpoch(previous => previous + 1); generation.current++; setSelected(null); setSelectedArchived(false); if (archived) { setThreads([]); setArchived(false); } setMessages([]); setActivity([]); setDraft(""); setTools([]); setContext(null); setActivityComplete(false); setError(""); setUncertain(false); setWebSearch(false); setLoading(archived); }
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
        speech?.stop();
        dictation.cancel(); generation.current++; setComposerEpoch(previous => previous + 1); setSelected(null); setSelectedArchived(false); setMessages([]); setActivity([]); setDraft(""); setTools([]); setContext(null); setActivityComplete(false); setUncertain(false); setWebSearch(false);
      }
    } catch { if (active.current) setHistoryError(`Could not ${action} this chat. Please try again.`); }
    finally { if (active.current) setMutating(false); }
  }
  const displayName = user.fullName?.trim() || user.firstName?.trim() || "Your account";

  return <AssistantRuntimeProvider runtime={runtime}><div className={styles.workspace}>
    {sidebarOpen && <button className={styles.backdrop} type="button" aria-label="Close conversation sidebar" onClick={() => { restoreFocus.current = true; setSidebarOpen(false); }} />}
    <aside onKeyDownCapture={event => { if (event.key !== "Escape" || !(event.target instanceof Element)) return; const menu = event.target.closest("details[open]"); if (menu instanceof HTMLDetailsElement) { event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector<HTMLElement>("summary")?.focus(); } }} ref={sidebarRef} id="agent-sidebar" className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`} style={{ width }} role={mobile && sidebarOpen ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-label="Conversation sidebar">
      <div className={styles.sidebarTop}><div className={styles.sidebarHeading}><Link href="/" className={styles.brand} aria-label="PandaByte home"><span className={styles.logoSmall}><Image src="/brand/pandabyte-logo.png" alt="" width={558} height={564} /></span><span>PandaByte</span></Link><button ref={closeRef} className={styles.closeSidebar} type="button" aria-label="Close sidebar" onClick={() => { restoreFocus.current = true; setSidebarOpen(false); }}><X size={19} /></button></div>
        <button className={styles.newChat} disabled={busy} type="button" onClick={newChat}><SquarePen size={18} /> New chat</button>
        <label className={styles.search}><Search size={16} aria-hidden="true"/><span className={styles.srOnly}>Search chats</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats" /></label>
        <div className={styles.historyHeading}><p className={styles.sidebarLabel}>{archived ? "Archived chats" : "Recent chats"}</p><button type="button" disabled={busy || loading || mutating} onClick={() => { setThreads([]); setLoading(true); setArchived(!archived); setQuery(""); setHistoryError(""); }}>{archived ? "Back to chats" : "Archived"}</button></div>
        {historyError && <p className={styles.error} role="alert">{historyError}</p>}
        <nav className={styles.history} aria-label={archived ? "Archived chats" : "Recent chats"}>{threads.filter(thread => thread.title.toLowerCase().includes(query.toLowerCase())).map(thread => <div className={styles.historyRow} key={thread.id}>
          <button className={styles.historySelect} type="button" disabled={busy || mutating} aria-current={selected?.id === thread.id ? "page" : undefined} onClick={() => { void loadChat(thread.id); if (window.matchMedia("(max-width: 700px)").matches) { restoreFocus.current = true; setSidebarOpen(false); } }}><span className={styles.historyTitle}>{thread.title || "New chat"}</span>{thread.status !== "idle" && <span className={styles.historyStatus}>{thread.status}</span>}</button>
          <details className={styles.chatMenu} name="sidebar-menu" onKeyDown={closeMenuOnEscape}><summary className={styles.menuTrigger} aria-label={`Actions for ${thread.title || "New chat"}`}><MoreHorizontal size={18} /></summary><div className={styles.menuPanel}>
            <button type="button" aria-label={archived ? "Restore chat" : "Archive chat"} disabled={busy || loading || mutating || thread.status !== "idle"} title={thread.status !== "idle" ? "Unavailable while this chat needs review" : undefined} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeChat(thread, archived ? "restore" : "archive"); }}>{archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archived ? "Restore" : "Archive"}</button>
            <button type="button" aria-label="Delete chat" disabled={busy || loading || mutating || thread.status !== "idle"} title={thread.status !== "idle" ? "Unavailable while this chat needs review" : undefined} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeChat(thread, "delete"); }}><Trash2 size={16} />Delete</button>
          </div></details></div>)}{!loading && !threads.length && <p>{archived ? "No archived chats." : "No saved chats yet."}</p>}{!loading && threads.length > 0 && !threads.some(thread => thread.title.toLowerCase().includes(query.toLowerCase())) && <p>No chats match your search.</p>}</nav>
      </div><div className={styles.account}><details className={styles.accountMenu} name="sidebar-menu" onKeyDown={closeMenuOnEscape}><summary className={styles.accountTrigger} aria-label="Account menu"><span className={styles.avatar} aria-hidden="true"><UserAvatar rounded /></span><span className={styles.accountName}>{displayName}</span><MoreHorizontal size={18} /></summary><div className={styles.accountPanel}><div className={styles.identity}><span className={styles.identityText}><strong>{displayName}</strong><span>{user.primaryEmailAddress?.emailAddress ?? "Signed in"}</span></span></div><nav className={styles.accountLinks} aria-label="Account"><Link href="/account"><UserRound size={16} /> Account</Link><Link href="/account/settings"><Settings size={16} /> Settings</Link></nav>{signOutError && <p className={styles.error} role="alert">{signOutError}</p>}<button className={styles.logout} type="button" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={16} />{signingOut ? "Signing out…" : "Logout"}</button></div></details></div>
    </aside>
    {sidebarOpen && <div className={styles.resizer} role="separator" aria-label="Resize conversation sidebar" aria-controls="agent-sidebar" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex={0} onKeyDown={resizeWithKeyboard} onPointerDown={resizeWithPointer} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(clampWidth(event.clientX)); }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />}
    <main id="main" tabIndex={-1} className={styles.main} inert={mobile && sidebarOpen}><header className={styles.header}><div className={styles.headerStart}><button ref={toggleRef} className={styles.menuButton} type="button" aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen} aria-controls="agent-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><div className={styles.model}><strong>Panda Agent</strong><span>GPT-6 Luna</span></div><span className={styles.badge}>Preview</span></div><ThemeToggle /></header>
      <ThreadPrimitive.Root className={styles.thread}><ThreadPrimitive.Viewport className={styles.viewport}>
        {!messages.length && !busy && <Welcome disabled={previewReadOnly} />}
        <div className={styles.messageList}><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage: () => <AssistantMessage messages={presentedMessages} speech={speech} speaking={speaking} /> }} />{(busy || activity.length > 0 || tools.length > 0) && <Activity stages={activity} tools={tools} context={context} busy={busy} complete={activityComplete} />}</div>
      </ThreadPrimitive.Viewport><div className={styles.composerArea}>{previewReadOnly && <p className={styles.status} role="status">Preview only: saved chats are available. Read aloud depends on your browser. New answers and web search are not connected yet.</p>}{error && <p className={styles.error} role="alert">{error}</p>}{selectedArchived && <p className={styles.status} role="status">Restore this chat to continue the conversation.</p>}{selected && (uncertain || selected.status !== "idle") && <div className={styles.status} role="status"><span>{selected.status === "pending" ? "This chat has a pending request." : selected.status === "blocked" ? "This chat needs review before it can continue." : "Check this chat for the saved result."}</span><button type="button" disabled={busy} onClick={() => void loadChat(selected.id)}>Check status</button></div>}<ChatComposer key={composerEpoch} webSearch={webSearch} disabled={busy || composerDisabled} setWebSearch={setWebSearch} cancelDictation={dictation.cancel} /><p className={styles.disclaimer}>Verify hardware connections before applying power.</p></div></ThreadPrimitive.Root>
    </main></div></AssistantRuntimeProvider>;
}

function closeMenuOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || !event.currentTarget.open) return;
  event.preventDefault(); event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
}

function ChatComposer({ webSearch, disabled, setWebSearch, cancelDictation }: { webSearch: boolean; disabled: boolean; setWebSearch: (enabled: boolean) => void; cancelDictation: () => void }) {
  const text = useAuiState(state => state.composer.text);
  const listening = useAuiState(state => state.composer.dictation != null);
  const aui = useAui();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const voiceSupported = useSyncExternalStore(subscribeVoiceSupport, WebSpeechDictationAdapter.isSupported, () => false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { aui.thread.composer().setText(""); }, [aui]);
  useEffect(() => { if (disabled) cancelDictation(); }, [disabled, cancelDictation]);
  const tooLong = text.trim().length > 2000;
  const invalidSearch = webSearch && (text.trim().length > 400 || /[\r\n]/.test(text.trim()));
  function selectFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    if (!validateLocalFiles(files.length, incoming)) {
      setFileError("Choose up to 3 PNG, JPEG, WebP or text files, each 5 MB or less."); return;
    }
    setFiles(previous => [...previous, ...incoming]); setFileError("");
  }
  return <ComposerPrimitive.Root className={styles.composer} onSubmit={event => { if (invalidSearch || tooLong || files.length) event.preventDefault(); else cancelDictation(); }}>
    {files.length > 0 && <div className={styles.attachments} aria-label="Selected files">{files.map((file, index) => <span className={styles.attachment} key={`${file.name}-${file.lastModified}-${index}`}><FileText size={16} aria-hidden="true"/><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, i) => i !== index))}><X size={14}/></button></span>)}</div>}
    <ComposerPrimitive.Input aria-label="Message Panda Agent" aria-describedby="composer-notice" aria-invalid={invalidSearch || tooLong || undefined} placeholder={webSearch ? "Ask a public web question…" : "Ask anything…"} maxLength={webSearch ? 400 : 2000} rows={2} onKeyDown={event => { if ((invalidSearch || tooLong || files.length > 0) && event.key === "Enter" && !event.shiftKey) event.preventDefault(); }} />
    <div className={styles.composerActions}><div className={styles.actionGroup}><input ref={fileInput} className={styles.srOnly} tabIndex={-1} aria-hidden="true" type="file" accept="image/png,image/jpeg,image/webp,text/plain" multiple onChange={event => { selectFiles(event.target.files); event.target.value = ""; }} /><button className={styles.iconAction} type="button" aria-label="Add files" title="Add files" disabled={disabled} onClick={() => fileInput.current?.click()}><Plus size={19}/></button><button className={styles.webSearchToggle} type="button" aria-pressed={webSearch} aria-describedby="composer-notice" disabled={disabled} onClick={() => setWebSearch(!webSearch)}><Globe size={16} aria-hidden="true" /> Search</button></div><div className={styles.actionGroup}>{listening ? <ComposerPrimitive.StopDictation className={styles.iconAction} aria-label="Stop dictation" aria-describedby="voice-notice" disabled={disabled}><MicOff size={18}/></ComposerPrimitive.StopDictation> : voiceSupported ? <ComposerPrimitive.Dictate className={styles.iconAction} aria-label="Start voice dictation" aria-describedby="voice-notice" disabled={disabled}><Mic size={18}/></ComposerPrimitive.Dictate> : <button className={styles.iconAction} type="button" aria-label="Voice dictation unavailable" aria-describedby="voice-notice" disabled><Mic size={18}/></button>}<ComposerPrimitive.Send className={styles.sendButton} aria-label="Send message" disabled={disabled || invalidSearch || tooLong || files.length > 0}><ArrowUp size={19} /></ComposerPrimitive.Send></div></div>
    <p className={styles.searchNotice} id="composer-notice" role="status">{fileError || (tooLong ? "Messages must be 2,000 characters or fewer. Shorten your message to send." : files.length ? "Files stay on this device. File messages are not supported yet; remove them to send." : invalidSearch ? "Use one public question, on one line, up to 400 characters. Shorten it or turn Search off." : webSearch ? "Your next public question goes to Tavily. No personal details or secrets; one line, up to 400 characters." : "Files stay local and cannot be sent yet.")}</p>
    <p className={styles.searchNotice} id="voice-notice" role="status">{voiceSupported ? listening ? "Listening. Stop dictation before editing if needed. Speech may use an online browser service." : "Voice dictation may use an online browser service. If it stops, check microphone permission." : "Voice dictation is unavailable in this browser. Type your message instead."}</p>
  </ComposerPrimitive.Root>;
}

function Welcome({ disabled }: { disabled: boolean }) { const aui = useAui(); return <section className={styles.intro} aria-labelledby="panda-agent-title"><span className={styles.logo}><Image src="/brand/pandabyte-logo.png" alt="PandaByte" width={558} height={564} /></span><h1 id="panda-agent-title">How can I help you today?</h1><p>Ask about your ideas, projects or PandaByte products.</p><div className={styles.suggestions}>{suggestions.map(text => <button type="button" disabled={disabled} key={text} onClick={() => { aui.thread.composer().setText(text); }}>{text}</button>)}</div></section>; }
function UserMessage() { return <MessagePrimitive.Root className={styles.userMessage}><MessagePrimitive.Parts /></MessagePrimitive.Root>; }
function AssistantMessage({ messages, speech, speaking }: { messages: ChatMessage[]; speech: ReturnType<typeof createReadAloud> | null; speaking: string | null }) {
  const id = useAuiState(state => state.message.id);
  const item = messages.find(message => message.id === id);
  const [copied, setCopied] = useState(false);
  return <MessagePrimitive.Root className={styles.assistantMessage}><div className={styles.messageLabel}>Panda Agent {item?.provisional && <span className={styles.draftLabel}>Draft · not saved</span>}</div><div className={styles.messageText}><MessagePrimitive.Parts components={{ Text: item?.citations.length ? () => <CitedMarkdown messageId={item.id} citationIds={item.citations.map(citation => citation.id)} /> : MarkdownText }} /></div>{!!item?.citations.length && <div className={styles.sources}><strong>Sources</strong>{item.citations.map(citation => <SourceCitation key={citation.id} citation={citation} messageId={item.id} />)}</div>}{item && !item.provisional && <div className={styles.messageActions}><button className={styles.copy} type="button" onClick={() => { void navigator.clipboard.writeText(item.text).then(() => setCopied(true)).catch(() => setCopied(false)); }}><Copy size={15} /> {copied ? "Copied" : "Copy"}</button><button className={styles.copy} type="button" disabled={!speech} title={speech ? undefined : "Read aloud is unavailable in this browser"} onClick={() => speaking === item.id ? speech?.stop() : speech?.play(item.id, item.text)}>{speaking === item.id ? <Square size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />} {speaking === item.id ? "Stop reading" : speech ? "Read aloud" : "Read aloud unavailable"}</button></div>}</MessagePrimitive.Root>;
}

function SourceCitation({ citation, messageId }: { citation: Citation; messageId: string }) {
  const webExcerpt = citation.sectionPath.length === 1 && citation.sectionPath[0] === webSearchSection;
  const href = publicSearchCitationUrl(citation.sourceUrl) ? citation.sourceUrl : undefined;
  const domain = href ? new URL(href).hostname : "Link unavailable";
  return <details className={styles.sourceCard} id={`source-${messageId}-${citation.id}`}>
    <summary><span className={styles.sourceSummary}><span className={styles.sourceId}>{citation.id}</span><span><strong>{citation.title}</strong><small>{domain}</small></span></span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className={styles.sourceContent}>
      {webExcerpt && <strong className={styles.sourceKind}>Web search excerpt</strong>}
      <blockquote>{citation.quote}</blockquote>
      <small>{webExcerpt ? "Tavily search excerpt; full page and manufacturer claims not verified" : citation.sectionPath.join(" / ")} · {webExcerpt ? "retrieved" : "captured"} {citation.capturedAt}</small>
      {href && <a href={href} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={13} aria-hidden="true" /></a>}
    </div>
  </details>;
}

function Activity({ stages, tools, context, busy, complete }: { stages: Stage[]; tools: ToolActivity[]; context: ContextSummary | null; busy: boolean; complete: boolean }) {
  const names: Record<ToolActivity["tool"], string> = { rag_search: "PandaByte sources", web_search: "Web search", espressif_docs: "Espressif documentation" };
  const states: Record<ToolActivity["status"], string> = { started: "Started", completed: "Completed", failed: "Failed" };
  const label = complete ? "Answer saved" : busy ? stages.length ? activityLabels[stages[stages.length - 1]] : "Sending…" : "Activity interrupted";
  return <div className={styles.activity}><p className={styles.activityStatus} role="status"><span className={busy ? styles.activityPulse : styles.activityMark} aria-hidden="true">{complete ? <Check size={13} /> : null}</span>{busy ? <Shimmer>{label}</Shimmer> : <span>{label}</span>}</p>{busy && <div className={styles.activitySkeleton} aria-hidden="true"><span /><span /></div>}{tools.length > 0 && <ul className={styles.toolCards} aria-label="Tool activity">{tools.map((tool, index) => <li key={index}><span>{names[tool.tool]}</span><strong>{states[tool.status]}</strong></li>)}</ul>}{stages.length > 0 && <details className={styles.activityDetails}><summary>View activity <ChevronDown size={15} aria-hidden="true" /></summary><ol>{stages.map((stage, index) => <li key={index}>{activityLabels[stage]}</li>)}</ol>{context && <p className={styles.contextSummary}>Supplied context: {context.fragments} {context.fragments === 1 ? "fragment" : "fragments"}, {context.characters.toLocaleString()} characters{context.duplicatesRemoved > 0 ? ` · ${context.duplicatesRemoved} duplicate ${context.duplicatesRemoved === 1 ? "fragment" : "fragments"} removed` : ""} (limit {context.limitCharacters.toLocaleString()} characters).</p>}</details>}</div>;
}
