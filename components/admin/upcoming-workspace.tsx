import {
  IconBuildingCommunity,
  IconMessageCircle,
  IconPlus,
  IconSend,
  IconSparkles,
} from "@tabler/icons-react";
import styles from "./upcoming-workspace.module.css";

type PreviewPage = "workspaces" | "chat" | "ai-chat";

const pageDetails: Record<PreviewPage, { title: string; description: string }> = {
  workspaces: { title: "Workspaces", description: "A focused place to manage the PandaByte admin workspace." },
  chat: { title: "Team chat", description: "A shared space for future team conversations." },
  "ai-chat": { title: "AI chat", description: "A design preview for future admin assistance." },
};

export function UpcomingWorkspace({ page }: { page: PreviewPage }) {
  const { title, description } = pageDetails[page];
  const PageIcon = page === "workspaces" ? IconBuildingCommunity : page === "chat" ? IconMessageCircle : IconSparkles;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><h1>{title}</h1><p>{description}</p></div>
        <span className={styles.status}>Coming soon</span>
      </header>

      {page === "workspaces" && <section className={styles.workspacePreview} aria-labelledby="workspace-preview-title">
        <div className={styles.previewHeading}>
          <span className={styles.iconFrame}><PageIcon aria-hidden="true" size={19} stroke={1.8} /></span>
          <div><h2 id="workspace-preview-title">PandaByte admin workspace</h2><p>This view represents the current PandaByte admin workspace.</p></div>
        </div>
        <div className={styles.workspaceRow}>
          <span className={styles.iconFrame}><IconBuildingCommunity aria-hidden="true" size={18} stroke={1.8} /></span>
          <div><strong>PandaByte.in</strong><span>Current workspace view</span></div>
          <span className={styles.currentTag}>Current</span>
        </div>
        <div className={styles.notice}>
          <IconBuildingCommunity aria-hidden="true" size={18} stroke={1.8} />
          <p>Workspace switching and organization management are not connected.</p>
        </div>
      </section>}

      {page === "chat" && <section className={styles.chatLayout} aria-label="Team chat design preview">
        <aside className={styles.threadPanel} aria-labelledby="threads-title">
          <div className={styles.threadHeading}>
            <h2 id="threads-title">Conversations</h2>
            <button className={styles.iconButton} type="button" aria-label="New conversation coming soon" disabled>
              <IconPlus aria-hidden="true" size={17} stroke={1.8} />
            </button>
          </div>
          <p className={styles.emptyThread}>No conversations yet.</p>
        </aside>
        <section className={styles.conversation} aria-labelledby="conversation-title">
          <header className={styles.conversationHeading}>
            <div className={styles.conversationIdentity}>
              <span className={styles.iconFrame}><PageIcon aria-hidden="true" size={18} stroke={1.8} /></span>
              <div><h2 id="conversation-title">Team conversation</h2><p>Conversation tools are not connected.</p></div>
            </div>
            <span className={styles.currentTag}>Preview</span>
          </header>
          <div className={styles.conversationEmpty} role="status">
            <IconMessageCircle aria-hidden="true" size={25} stroke={1.6} />
            <h3>Team chat is coming soon</h3>
            <p>Messages and conversation history are not available here.</p>
          </div>
          <div className={styles.composer}>
            <label htmlFor="team-message">Message</label>
            <div className={styles.composerRow}>
              <textarea id="team-message" rows={2} disabled aria-describedby="team-message-help" />
              <button className={styles.sendButton} type="button" disabled aria-label="Send message">
                <IconSend aria-hidden="true" size={17} stroke={1.8} />
              </button>
            </div>
            <p id="team-message-help">Messaging is not connected.</p>
          </div>
        </section>
      </section>}

      {page === "ai-chat" && <section className={styles.aiPreview} aria-labelledby="ai-preview-title">
        <div className={styles.aiHeading}>
          <span className={styles.iconFrame}><PageIcon aria-hidden="true" size={19} stroke={1.8} /></span>
          <div><h2 id="ai-preview-title">Assistant design preview</h2><p>No assistant provider, messages, or conversation history are connected.</p></div>
        </div>
        <div className={styles.aiEmpty} role="status">
          <IconSparkles aria-hidden="true" size={24} stroke={1.6} />
          <h3>AI chat is not active</h3>
          <p>Suggested prompts below are design examples only. They are not implemented.</p>
        </div>
        <div className={styles.promptSection}>
          <h3>Planned prompt examples</h3>
          <ul className={styles.promptList}>
            <li><button type="button" disabled>Summarize recent inquiries</button></li>
            <li><button type="button" disabled>Find products with incomplete details</button></li>
            <li><button type="button" disabled>Draft a support response</button></li>
          </ul>
        </div>
        <div className={styles.composer}>
          <label htmlFor="ai-message">Ask a question</label>
          <div className={styles.composerRow}>
            <textarea id="ai-message" rows={2} disabled aria-describedby="ai-message-help" />
            <button className={styles.sendButton} type="button" disabled aria-label="Send question">
              <IconSend aria-hidden="true" size={17} stroke={1.8} />
            </button>
          </div>
          <p id="ai-message-help">Assistant responses are not connected.</p>
        </div>
      </section>}
    </div>
  );
}
