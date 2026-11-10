type ComposerState = {
  previewReadOnly: boolean;
  selectedArchived: boolean;
  modelUnavailable: boolean;
  capabilityLoading: boolean;
  loading: boolean;
  mutating: boolean;
  uncertain: boolean;
  status?: "idle" | "pending" | "blocked";
  running: boolean;
};

export function composerGates(state: ComposerState) {
  const draftDisabled = state.previewReadOnly || state.selectedArchived;
  const reason = state.uncertain || state.status === "pending" || state.status === "blocked"
    ? "You can draft a message. Check status or cancel the pending request before sending, or start a new chat."
    : state.loading ? "You can draft while this chat loads. Sending will be available when it finishes."
    : state.mutating ? "You can draft while the chat is updated. Sending is paused."
    : state.capabilityLoading ? "You can draft while model availability is checked. Sending is paused."
    : state.modelUnavailable ? "You can draft, but the selected model is unavailable. Sending is paused until it is ready."
    : null;
  return { draftDisabled, sendDisabled: draftDisabled || state.running || reason !== null, reason };
}

// A failed/cancelled request must not replace a follow-up the user has already typed.
export function recoveredDraft(current: string, previous: string | null, newIdentity = false) {
  if (previous === null) return newIdentity ? "" : current;
  return current.length ? current : previous;
}
