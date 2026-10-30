"use client";

import Image from "next/image";
import Link from "next/link";
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessage } from "@assistant-ui/react";
import { ArrowUp, ImagePlus, Info, MessageSquareDashed, Paperclip, SquarePen, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./workspace.module.css";

const messages: readonly ThreadMessage[] = [];

export function PandaAgentWorkspace() {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages,
    isDisabled: true,
    isSendDisabled: true,
    isRunning: false,
    onNew: async () => { throw new Error("Panda Agent is disconnected"); },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Conversation sidebar">
          <div className={styles.sidebarTop}>
            <button className={styles.newChat} disabled type="button">
              <span className={styles.logoSmall}><Image src="/brand/pandabyte-logo.png" alt="" width={28} height={28} /></span>
              <span>New chat</span><SquarePen size={16} aria-hidden="true" />
            </button>
            <p className={styles.sidebarLabel}>History</p>
            <div className={styles.history}><MessageSquareDashed size={22} aria-hidden="true" /><span>History unavailable while disconnected</span></div>
          </div>
          <Link href="/account" className={styles.account}><UserRound size={17} aria-hidden="true" /> Account</Link>
        </aside>
        <main id="main" tabIndex={-1} className={styles.main}>
          <header className={styles.header}>
            <div>Panda Agent <span className={styles.badge}>Preview</span></div>
            <ThemeToggle />
          </header>
          <ThreadPrimitive.Root className={styles.thread}>
            <ThreadPrimitive.Viewport className={styles.viewport}>
              <section className={styles.intro} aria-labelledby="panda-agent-title">
                <span className={styles.logo}><Image src="/brand/pandabyte-logo.png" alt="PandaByte" width={64} height={64} /></span>
                <h1 id="panda-agent-title">How can I help with your IoT project?</h1>
                <p>Explore questions about hardware, code, and documentation with Panda Agent.</p>
                <div className={styles.notice} role="status">
                  <Info size={19} aria-hidden="true" />
                  <div><strong>Design preview</strong><p>Panda Agent is currently disconnected. Chat, conversation history, and attachments are unavailable.</p></div>
                </div>
              </section>
            </ThreadPrimitive.Viewport>
            <div className={styles.composerArea}>
              <ComposerPrimitive.Root className={styles.composer}>
                <label className={styles.srOnly} htmlFor="panda-agent-message">Message Panda Agent</label>
                <ComposerPrimitive.Input id="panda-agent-message" placeholder="Ask about hardware, code, or documentation..." disabled />
                <div className={styles.composerActions}>
                  <div><button type="button" disabled aria-label="Attach file (unavailable)"><Paperclip size={18} aria-hidden="true" /></button><button type="button" disabled aria-label="Upload image (unavailable)"><ImagePlus size={18} aria-hidden="true" /></button></div>
                  <ComposerPrimitive.Send aria-label="Send message (unavailable)" disabled><ArrowUp size={18} aria-hidden="true" /></ComposerPrimitive.Send>
                </div>
              </ComposerPrimitive.Root>
              <p className={styles.disclaimer}>Verify hardware connections before applying power.</p>
            </div>
          </ThreadPrimitive.Root>
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
