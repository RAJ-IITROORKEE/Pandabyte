"use client";

import { Cpu, Eraser, Play, Send, Square, Upload, Usb, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BAUD_RATES, MAX_FIRMWARE_BYTES, agentLogMessage, appendSerial, firmwareProblem, imageChipId, parseFlashAddress, type ConnectedChip } from "./device";
import styles from "./device-panel.module.css";

// The subset of Web Serial this panel uses (Chrome and Edge on a computer; the project has no Web Serial type package).
type Port = { open(options: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null };
type Serial = { requestPort(): Promise<Port>; addEventListener(type: "disconnect", listener: (event: Event) => void): void; removeEventListener(type: "disconnect", listener: (event: Event) => void): void };
const serialApi = () => (navigator as Navigator & { serial?: Serial }).serial;
type Chip = ConnectedChip & { description: string; mac: string };
type Firmware = { name: string; data: Uint8Array };
const message = (e: unknown) => e instanceof Error ? e.message.slice(0, 200) : "Unknown error";
const sizeText = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.ceil(n / 1024)} KB`;

/** Admin device panel (phase 6): connect an ESP32 board over USB, identify it, watch its serial output, ask the agent about
 *  that output, and flash a .bin the user picks — only after a confirmation that names the chip, file, size and address. */
export function DevicePanel({ onClose, onAsk, askDisabled, firmware: fromAgent }: { onClose: () => void; onAsk: (text: string) => void; askDisabled: boolean; firmware?: { name: string; data: Uint8Array; address: number } | null }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [port, setPort] = useState<Port | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const [baud, setBaud] = useState<number>(115200);
  const [log, setLog] = useState<{ lines: string[]; partial: string }>({ lines: [], partial: "" });
  const [monitoring, setMonitoring] = useState(false);
  const [working, setWorking] = useState<"" | "identify" | "flash">("");
  const [status, setStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [firmware, setFirmware] = useState<Firmware | null>(null);
  const [address, setAddress] = useState("0x10000");
  const [progress, setProgress] = useState<number | null>(null);
  const [flashLog, setFlashLog] = useState<string[]>([]);
  const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const portRef = useRef<Port | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { queueMicrotask(() => setSupported(typeof navigator !== "undefined" && !!serialApi())); }, []);
  useEffect(() => { portRef.current = port; }, [port]);
  // A firmware the agent built arrives as the chosen file; identifying the board and the confirmation dialog still apply.
  useEffect(() => {
    if (!fromAgent) return;
    queueMicrotask(() => { setFirmware({ name: fromAgent.name, data: fromAgent.data }); setAddress(`0x${fromAgent.address.toString(16)}`); setStatus("Firmware from the agent is ready to flash. Identify the board, then review and flash."); });
  }, [fromAgent]);
  // Unplugging the board, or closing the panel, ends the session cleanly.
  useEffect(() => {
    const serial = typeof navigator === "undefined" ? undefined : serialApi();
    const onDisconnect = (event: Event) => { if (event.target === portRef.current) { reader.current = null; setPort(null); setChip(null); setMonitoring(false); setStatus("The board was unplugged."); } };
    serial?.addEventListener("disconnect", onDisconnect);
    return () => { serial?.removeEventListener("disconnect", onDisconnect); void stopMonitor(); };
  }, []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log.lines.length]);

  async function connect() {
    try { const p = await serialApi()!.requestPort(); setPort(p); setChip(null); setStatus("Board selected. Identify it or start the monitor."); }
    catch (e) { if (!(e instanceof DOMException && e.name === "NotFoundError")) setStatus(`Could not open the port: ${message(e)}`); }
  }
  async function stopMonitor() {
    const r = reader.current; reader.current = null;
    if (r) { try { await r.cancel(); } catch { /* already closed */ } }
    const p = portRef.current;
    if (p) { try { await p.close(); } catch { /* not open */ } }
    setMonitoring(false);
  }
  async function startMonitor() {
    if (!port || working) return;
    try { await port.open({ baudRate: baud }); }
    catch (e) { setStatus(`Could not open the port: ${message(e)}. Close other apps using it (Arduino IDE serial monitor).`); return; }
    const r = port.readable?.getReader();
    if (!r) { await port.close().catch(() => {}); return; }
    reader.current = r; setMonitoring(true); setStatus(`Monitoring at ${baud} baud.`);
    const decoder = new TextDecoder();
    try {
      for (;;) { const { value, done } = await r.read(); if (done) break; const text = decoder.decode(value, { stream: true }); setLog(prev => appendSerial(prev.lines, prev.partial, text)); }
    } catch (e) { if (reader.current === r) setStatus(`Monitor stopped: ${message(e)}`); }
    finally { try { r.releaseLock(); } catch { /* released */ } if (reader.current === r) { reader.current = null; await port.close().catch(() => {}); setMonitoring(false); } }
  }

  /** One esptool-js session: connect (this resets the board into its bootloader), run `work`, then reset it to run normally. */
  async function withLoader<T>(baudrate: number, work: (loader: import("esptool-js").ESPLoader) => Promise<T>): Promise<T> {
    if (!port) throw new Error("No board selected.");
    await stopMonitor();
    const { ESPLoader, Transport } = await import("esptool-js");
    const transport = new Transport(port as never, false);
    const terminal = { clean: () => setFlashLog([]), writeLine: (d: string) => setFlashLog(prev => [...prev, d].slice(-12)), write: (d: string) => setFlashLog(prev => [...prev, d].slice(-12)) };
    const loader = new ESPLoader({ transport, baudrate, romBaudrate: 115200, terminal });
    try { await loader.main(); const result = await work(loader); await loader.after("hard_reset"); return result; }
    finally { try { await transport.disconnect(); } catch { /* already closed */ } }
  }
  async function identify() {
    if (!port || working) return;
    setWorking("identify"); setStatus("Identifying the board (it restarts)…");
    try {
      const found = await withLoader(115200, async loader => {
        const size = await loader.detectFlashSize();
        return { name: loader.chip.CHIP_NAME, imageChipId: loader.chip.IMAGE_CHIP_ID ?? null, description: await loader.chip.getChipDescription(loader),
          mac: await loader.chip.readMac(loader), flashBytes: size ? loader.flashSizeBytes(size as never) : null } satisfies Chip;
      });
      setChip(found); setStatus(`Found ${found.description}.`);
    } catch (e) { setStatus(`Could not identify the board: ${message(e)}. Hold BOOT, tap RESET, then try again.`); }
    finally { setWorking(""); }
  }

  async function pickFirmware(file: File | undefined) {
    setFirmware(null); setProgress(null);
    if (!file) return;
    if (!/\.bin$/i.test(file.name) || file.size > MAX_FIRMWARE_BYTES) { setStatus("Choose a .bin firmware file of 16 MB or less."); return; }
    const data = new Uint8Array(await file.arrayBuffer());
    setFirmware({ name: file.name, data });
    // Arduino IDE exports: <sketch>.ino.bin is the app (0x10000); <sketch>.ino.merged.bin is the whole image (0x0).
    setAddress(/merged|factory/i.test(file.name) ? "0x0" : "0x10000");
    setStatus("");
  }
  const flashAddress = parseFlashAddress(address);
  const problem = firmware && chip && flashAddress !== null ? firmwareProblem(firmware.data, flashAddress, chip) : null;
  const canReview = !!(port && chip && firmware && flashAddress !== null && !problem && !working);
  async function flash() {
    confirmRef.current?.close();
    if (!canReview || !firmware || !chip || flashAddress === null) return;
    setWorking("flash"); setProgress(0); setStatus(`Flashing ${firmware.name}…`);
    try {
      await withLoader(460800, async loader => {
        // The board must still be the one the user confirmed.
        if (loader.chip.CHIP_NAME !== chip.name) throw new Error(`a ${loader.chip.CHIP_NAME} is connected now, not the ${chip.name} you confirmed`);
        await loader.writeFlash({ fileArray: [{ data: firmware.data, address: flashAddress }], flashMode: "keep", flashFreq: "keep", flashSize: "keep", eraseAll: false, compress: true,
          reportProgress: (_file, written, total) => setProgress(total ? written / total : 0) });
      });
      setProgress(1); setStatus(`Flashed ${firmware.name} at 0x${flashAddress.toString(16)}. The board restarted; start the monitor to see its output.`);
    } catch (e) { setProgress(null); setStatus(`Flashing failed: ${message(e)}. The board may need BOOT held while you tap RESET.`); }
    finally { setWorking(""); }
  }

  const header = <div className={styles.top}><strong><Usb size={15} aria-hidden="true" /> Device</strong><button type="button" className={styles.close} aria-label="Close device panel" onClick={onClose}><X size={15} /></button></div>;
  if (supported === false) return <aside className={styles.panel} aria-label="Device">{header}
    <p className={styles.note}>This browser cannot open USB serial ports (Web Serial). Use Chrome or Edge on a computer to connect a board.</p></aside>;
  const image = firmware ? imageChipId(firmware.data) : null;
  return <aside className={styles.panel} aria-label="Device">
    {header}
    <p className={styles.status} role="status" aria-live="polite">{status || (port ? "Board selected." : "Connect an ESP32 board with a USB data cable.")}</p>
    <section aria-labelledby="device-board">
      <h3 id="device-board"><Cpu size={14} aria-hidden="true" /> Board</h3>
      {chip ? <dl className={styles.facts}><div><dt>Chip</dt><dd>{chip.description}</dd></div><div><dt>MAC</dt><dd>{chip.mac}</dd></div>{chip.flashBytes !== null && <div><dt>Flash</dt><dd>{chip.flashBytes / 1048576} MB</dd></div>}</dl> : null}
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={() => void connect()} disabled={!!working || monitoring}><Usb size={14} aria-hidden="true" /> {port ? "Choose another board" : "Connect board"}</button>
        <button type="button" className={styles.button} onClick={() => void identify()} disabled={!port || !!working}>{working === "identify" ? "Identifying…" : "Identify"}</button>
      </div>
    </section>
    <section aria-labelledby="device-monitor">
      <h3 id="device-monitor">Serial monitor</h3>
      <div className={styles.row}>
        <label className={styles.inline}>Baud <select value={baud} onChange={e => setBaud(Number(e.target.value))} disabled={monitoring}>{BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
        {monitoring ? <button type="button" className={styles.button} onClick={() => void stopMonitor().then(() => setStatus("Monitor stopped."))}><Square size={13} aria-hidden="true" /> Stop</button>
          : <button type="button" className={styles.button} onClick={() => void startMonitor()} disabled={!port || !!working}><Play size={13} aria-hidden="true" /> Start</button>}
        <button type="button" className={styles.iconButton} aria-label="Clear the log" onClick={() => setLog({ lines: [], partial: "" })} disabled={!log.lines.length && !log.partial}><Eraser size={14} /></button>
      </div>
      <pre ref={logRef} className={styles.log} tabIndex={0} aria-label="Serial output">{log.lines.length || log.partial ? [...log.lines, log.partial].join("\n") : "Output shows here."}</pre>
      <div className={styles.ask}>
        <label htmlFor="device-question" className={styles.srOnly}>Question about the output</label>
        <input id="device-question" className={styles.input} placeholder="Question (optional)" maxLength={300} value={question} onChange={e => setQuestion(e.target.value)} />
        <button type="button" className={styles.button} disabled={askDisabled || !log.lines.length} onClick={() => onAsk(agentLogMessage(log.lines, chip?.name ?? null, baud, question))}><Send size={13} aria-hidden="true" /> Ask the agent</button>
      </div>
    </section>
    <section aria-labelledby="device-flash">
      <h3 id="device-flash"><Upload size={14} aria-hidden="true" /> Flash firmware</h3>
      {!chip && <p className={styles.note}>Identify the board first, so the firmware can be checked against its chip.</p>}
      <label className={styles.field}>Firmware (.bin)<input type="file" accept=".bin,application/octet-stream" onChange={e => void pickFirmware(e.target.files?.[0])} disabled={!!working} /></label>
      <label className={styles.field}>Flash address<input className={styles.input} value={address} onChange={e => setAddress(e.target.value)} aria-invalid={flashAddress === null || undefined} aria-describedby="device-address-hint" disabled={!!working} /></label>
      <p id="device-address-hint" className={styles.hint}>Arduino: <code>.ino.bin</code> goes at 0x10000, <code>.ino.merged.bin</code> at 0x0.{flashAddress === null ? " Use a 4 KB-aligned address such as 0x10000." : ""}</p>
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {progress !== null && <progress className={styles.progress} value={progress} max={1} aria-label="Flashing progress" />}
      <button type="button" className={styles.primary} disabled={!canReview} onClick={() => confirmRef.current?.showModal()}>Review and flash…</button>
      {flashLog.length > 0 && <details className={styles.flashLog}><summary>Flasher log</summary><pre>{flashLog.join("\n")}</pre></details>}
    </section>
    <dialog ref={confirmRef} className={styles.dialog} aria-labelledby="device-confirm-title">
      <h2 id="device-confirm-title">Flash this firmware?</h2>
      {firmware && chip && flashAddress !== null && <dl className={styles.facts}>
        <div><dt>Board</dt><dd>{chip.description}</dd></div><div><dt>File</dt><dd>{firmware.name} ({sizeText(firmware.data.length)})</dd></div>
        <div><dt>Address</dt><dd>0x{flashAddress.toString(16)}</dd></div>
        <div><dt>Image</dt><dd>{image === null ? "No firmware header found (raw data)" : `Built for this chip (id ${image})`}</dd></div></dl>}
      <p className={styles.warning}>This overwrites the flash from that address, replacing the program on the board. Keep the cable connected until it finishes.</p>
      <div className={styles.row}><button type="button" className={styles.button} onClick={() => confirmRef.current?.close()} autoFocus>Cancel</button><button type="button" className={styles.danger} onClick={() => void flash()}>Flash</button></div>
    </dialog>
  </aside>;
}
