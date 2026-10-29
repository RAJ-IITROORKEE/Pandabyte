"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type AccountFile = {
  id: string;
  filename: string;
  byte_size: number;
  created_at: string;
};

type ApiError = { error?: { message?: unknown } };

function responseMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return fallback;
}

async function readApiBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchAccountFiles(): Promise<AccountFile[]> {
  const response = await fetch("/api/account/files", { cache: "no-store" });
  const body = await readApiBody(response);

  if (!response.ok) {
    throw new Error(responseMessage(body as ApiError, "Your files could not be loaded."));
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("data" in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error("Your files could not be loaded.");
  }

  return body.data as AccountFile[];
}

export function AccountFiles() {
  const [files, setFiles] = useState<AccountFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const uploadErrorRef = useRef<HTMLParagraphElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const firstDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterDeleteRef = useRef(false);

  useEffect(() => {
    if (uploadError) uploadErrorRef.current?.focus();
  }, [uploadError]);

  useEffect(() => {
    if (focusAfterDeleteRef.current && !deletingId) {
      focusAfterDeleteRef.current = false;
      (firstDeleteButtonRef.current ?? uploadInputRef.current)?.focus();
    }
  }, [deletingId, files]);

  async function loadFiles() {
    try {
      setFiles(await fetchAccountFiles());
      setError("");
    } catch {
      setError("Your files could not be loaded. Please refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void fetchAccountFiles()
      .then((nextFiles) => {
        if (active) {
          setFiles(nextFiles);
          setError("");
        }
      })
      .catch(() => {
        if (active) {
          setError("Your files could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setUploadError("");
    setMessage("");

    try {
      const response = await fetch("/api/account/files", {
        method: "POST",
        body: new FormData(form),
      });
      const body = await readApiBody(response);

      if (!response.ok) {
        setUploadError(responseMessage(body as ApiError, "The file could not be uploaded."));
        return;
      }

      form.reset();
      setMessage("File uploaded.");
      await loadFiles();
    } catch {
      setUploadError("The file could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: AccountFile) {
    setDeletingId(file.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/account/files/${file.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await readApiBody(response);
        setError(responseMessage(body as ApiError, "The file could not be deleted."));
        return;
      }

      focusAfterDeleteRef.current = true;
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setMessage("File deleted.");
    } catch {
      setError("The file could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section
      className="status-panel"
      aria-labelledby="account-files-title"
      style={{ width: "100%", marginTop: 32 }}
    >
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Private files</p>
          <h2 id="account-files-title">Your text documents</h2>
        </div>
      </div>

      <form
        onSubmit={upload}
        aria-busy={busy}
        aria-describedby={uploadError ? "account-file-upload-error" : undefined}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, paddingBottom: 20 }}
      >
        <div style={{ display: "grid", gap: 6, minWidth: 0, maxWidth: "100%" }}>
          <label htmlFor="account-file">Choose a .txt file</label>
          <input
            ref={uploadInputRef}
            id="account-file"
            name="file"
            type="file"
            style={{ minWidth: 0, maxWidth: "100%" }}
            accept=".txt,text/plain"
            required
            disabled={busy}
            aria-describedby={uploadError ? "account-file-help account-file-upload-error" : "account-file-help"}
            onChange={() => setUploadError("")}
          />
        </div>
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Uploading…" : "Upload file"}
        </button>
      </form>
      {uploadError ? <p id="account-file-upload-error" ref={uploadErrorRef} role="alert" tabIndex={-1} className="availability-note">{uploadError}</p> : null}
      <p id="account-file-help" className="availability-note" style={{ marginTop: 0, paddingBottom: 20 }}>
        Plain-text UTF-8 files up to 64 KiB. The list shows the 50 newest files.
      </p>

      {error ? <p role="alert" className="availability-note">{error}</p> : null}
      {message ? <p role="status" className="availability-note">{message}</p> : null}
      {loading ? <p className="availability-note" role="status">Loading files…</p> : null}
      {!loading && !error && files.length === 0 ? (
        <p className="availability-note">You have no uploaded files yet.</p>
      ) : null}

      {!loading && files.length > 0 ? (
        <ul className="status-list" aria-label="Your uploaded files">
          {files.map((file, index) => (
            <li key={file.id} className="status-item">
              <div className="status-copy" style={{ minWidth: 0 }}>
                <h3 style={{ overflowWrap: "anywhere" }}>{file.filename}</h3>
                <p>{file.byte_size.toLocaleString()} bytes</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                <a className="site-link" href={`/api/account/files/${file.id}`}>
                  Download
                </a>
                <button
                  ref={index === 0 ? firstDeleteButtonRef : undefined}
                  type="button"
                  disabled={deletingId !== null || busy}
                  aria-label={`Delete ${file.filename}`}
                  onClick={() => void remove(file)}
                  style={buttonStyle}
                >
                  {deletingId === file.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const buttonStyle = {
  padding: "8px 12px",
  color: "var(--accent-ink)",
  background: "var(--status-soft)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};
