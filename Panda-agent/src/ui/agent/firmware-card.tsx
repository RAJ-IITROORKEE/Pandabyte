"use client";

import { Download, HardDriveUpload } from "lucide-react";
import { useState } from "react";
import type { Firmware } from "../../agent-loop/turn-events";
import { decodeFirmware, firmwareFileName } from "./firmware";
import styles from "./firmware-card.module.css";

const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.ceil(n / 1024)} KB`);

/** A compiled firmware image from the agent. Flashing only opens the Device panel; the user confirms there. */
export function FirmwareCard({ firmware, canFlash, onFlash }: { firmware: Firmware; canFlash: boolean; onFlash: (fw: Firmware) => void }) {
  const [error, setError] = useState("");

  async function download() {
    try {
      const bytes = await decodeFirmware(firmware);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = firmwareFileName(firmware);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the file.");
    }
  }

  return (
    <section className={styles.card} aria-label="Compiled firmware">
      <h3 className={styles.title}>Firmware ready</h3>
      <dl className={styles.facts}>
        <div><dt>Board</dt><dd>{firmware.board}</dd></div>
        <div><dt>Size</dt><dd>{sizeText(firmware.size)}</dd></div>
        <div><dt>Built in</dt><dd>{(firmware.durationMs / 1000).toFixed(1)}s</dd></div>
        <div><dt>SHA-256</dt><dd>{firmware.sha256.slice(0, 8)}</dd></div>
        <div><dt>Address</dt><dd>0x{firmware.address.toString(16)}</dd></div>
      </dl>
      <div className={styles.actions}>
        {canFlash ? (
          <button type="button" className={styles.primary} onClick={() => onFlash(firmware)}>
            <HardDriveUpload size={14} aria-hidden="true" /> Flash to board
          </button>
        ) : null}
        <button type="button" className={styles.button} onClick={() => void download()}>
          <Download size={14} aria-hidden="true" /> Download .bin
        </button>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.note}>Flashing replaces the program on the board. You confirm the details in the Device panel first.</p>
    </section>
  );
}
