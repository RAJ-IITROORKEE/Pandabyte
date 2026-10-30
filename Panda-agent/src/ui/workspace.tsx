"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessage } from "@assistant-ui/react";
import { ArrowUp, ImagePlus, Info, LogOut, Menu, MessageSquareDashed, Paperclip, Settings, SquarePen, UserRound, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./workspace.module.css";

const messages: readonly ThreadMessage[] = [];
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;
const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

export function PandaAgentWorkspace() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [width, setWidth] = useState(260);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages,
    isDisabled: true,
    isSendDisabled: true,
    isRunning: false,
    onNew: async () => { throw new Error("Panda Agent is disconnected"); },
  });

  useEffect(() => {
    const mobileOpen = sidebarOpen && window.matchMedia("(max-width: 700px)").matches;
    if (mobileOpen) closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!sidebarOpen || !window.matchMedia("(max-width: 700px)").matches) return;
      if (event.key === "Tab") {
        const items = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next = width;
    if (event.key === "ArrowLeft") next -= 10;
    else if (event.key === "ArrowRight") next += 10;
    else if (event.key === "Home") next = MIN_WIDTH;
    else if (event.key === "End") next = MAX_WIDTH;
    else return;
    event.preventDefault();
    setWidth(clampWidth(next));
  }

  function resizeWithPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setWidth(clampWidth(event.clientX));
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try { await signOut({ redirectUrl: "/" }); }
    catch { setSigningOut(false); setSignOutError("Could not sign you out. Please try again."); }
  }

  const displayName = user?.fullName?.trim() || user?.firstName?.trim() || "Your account";

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={styles.workspace}>
        {sidebarOpen && <button className={styles.backdrop} type="button" aria-label="Close conversation sidebar" onClick={() => { setSidebarOpen(false); toggleRef.current?.focus(); }} />}
        <aside ref={sidebarRef} id="agent-sidebar" className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`} style={{ width }} aria-label="Conversation sidebar">
          <div className={styles.sidebarTop}>
            <div className={styles.sidebarHeading}>
              <Link href="/" className={styles.brand} aria-label="PandaByte home"><span className={styles.logoSmall}><Image src="/brand/pandabyte-logo.png" alt="" width={32} height={32} /></span><span>PandaByte</span></Link>
              <button ref={closeRef} className={styles.closeSidebar} type="button" aria-label="Close sidebar" onClick={() => { setSidebarOpen(false); toggleRef.current?.focus(); }}><X size={19} aria-hidden="true" /></button>
            </div>
            <button className={styles.newChat} disabled type="button"><SquarePen size={18} aria-hidden="true" /><span>New chat</span><span className={styles.unavailable}>Unavailable</span></button>
            <p className={styles.sidebarLabel}>History</p>
            <div className={styles.history}><MessageSquareDashed size={20} aria-hidden="true" /><span>Conversation history is unavailable while disconnected.</span></div>
          </div>
          <div className={styles.account}>
            {isLoaded && user ? <>
              <div className={styles.identity}><span className={styles.avatar} aria-hidden="true"><UserAvatar rounded /></span><span className={styles.identityText}><strong>{displayName}</strong><span>{user.primaryEmailAddress?.emailAddress ?? "Signed in"}</span></span></div>
              <nav className={styles.accountLinks} aria-label="Account"><Link href="/account"><UserRound size={16} aria-hidden="true" /> Account</Link><Link href="/account/settings"><Settings size={16} aria-hidden="true" /> Settings</Link></nav>
              {signOutError && <p className={styles.error} role="alert">{signOutError}</p>}
              <button className={styles.logout} type="button" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Logout"}</button>
            </> : <p className={styles.loading}>{isLoaded ? "Account unavailable" : "Loading account…"}</p>}
          </div>
        </aside>
        {sidebarOpen && <div className={styles.resizer} role="separator" aria-label="Resize conversation sidebar" aria-controls="agent-sidebar" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex={0} onKeyDown={resizeWithKeyboard} onPointerDown={resizeWithPointer} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(clampWidth(event.clientX)); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} />}
        <main id="main" tabIndex={-1} className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerStart}><button ref={toggleRef} className={styles.menuButton} type="button" aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen} aria-controls="agent-sidebar" onClick={() => setSidebarOpen((open) => !open)}><Menu size={20} aria-hidden="true" /></button><div className={styles.model}><label htmlFor="agent-model">Panda Agent</label><select id="agent-model" disabled aria-label="Model selection unavailable"><option>GPT-6 Luna</option></select></div><span className={styles.badge}>Preview</span></div>
            <ThemeToggle />
          </header>
          <ThreadPrimitive.Root className={styles.thread}>
            <ThreadPrimitive.Viewport className={styles.viewport}>
              <section className={styles.intro} aria-labelledby="panda-agent-title">
                <span className={styles.logo}><Image src="/brand/pandabyte-logo.png" alt="PandaByte" width={64} height={64} /></span>
                <h1 id="panda-agent-title">How can I help with your IoT project?</h1>
                <p>Explore questions about hardware, code, and documentation with Panda Agent.</p>
                <div className={styles.notice} role="status"><Info size={19} aria-hidden="true" /><div><strong>Design preview</strong><p>Panda Agent is currently disconnected. Chat, model selection, conversation history, and attachments are unavailable.</p></div></div>
              </section>
            </ThreadPrimitive.Viewport>
            <div className={styles.composerArea}>
              <ComposerPrimitive.Root className={styles.composer}>
                <label className={styles.srOnly} htmlFor="panda-agent-message">Message Panda Agent</label>
                <ComposerPrimitive.Input id="panda-agent-message" placeholder="Ask about hardware, code, or documentation..." disabled />
                <div className={styles.composerActions}><div><button type="button" disabled aria-label="Attach file (unavailable)"><Paperclip size={18} aria-hidden="true" /></button><button type="button" disabled aria-label="Upload image (unavailable)"><ImagePlus size={18} aria-hidden="true" /></button></div><ComposerPrimitive.Send aria-label="Send message (unavailable)" disabled><ArrowUp size={18} aria-hidden="true" /></ComposerPrimitive.Send></div>
              </ComposerPrimitive.Root>
              <p className={styles.disclaimer}>Verify hardware connections before applying power.</p>
            </div>
          </ThreadPrimitive.Root>
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
