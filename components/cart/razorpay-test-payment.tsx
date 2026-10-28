"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadCustomerCart } from "./cart-api";
import { publishCustomerCart } from "./customer-cart-store";
import { clearBuyNowSelection, getBuyNowSelection } from "./buy-now-store";
import { sameCartItems } from "./cart-utils";
import { formatPaise } from "./checkout-money";
import styles from "./checkout-review.module.css";

type Item = { variantId: string; quantity: number };
type Result = { state: string; reference: string; totalPaise: number; mode: "cart" | "buy-now"; items: Item[]; providerOrderId?: string; key?: string };
type Modal = { open(): void; close(): void; on(event: string, callback: () => void): void };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => Modal } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const markerKey = (userId: string) => `pandabyte:razorpay-test-pending:${userId}`;
export function validResult(value: Result): boolean {
  return !!value && ["creating", "ready", "verified", "paid", "failed", "cancelled", "unknown", "review"].includes(value.state) && /^TST-[0-9a-f-]{36}$/i.test(value.reference) && Number.isSafeInteger(value.totalPaise) && value.totalPaise >= 0 && ["cart", "buy-now"].includes(value.mode) && Array.isArray(value.items) && value.items.length > 0 && value.items.every(item => !!item && uuid.test(item.variantId) && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99) && (value.state !== "ready" || (/^order_[A-Za-z0-9]+$/.test(value.providerOrderId ?? "") && /^rzp_test_[A-Za-z0-9]+$/.test(value.key ?? "")));
}
let scriptPromise: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
    const fail = () => { script.remove(); reject(new Error("Payment script unavailable")); };
    script.onload = () => window.Razorpay ? resolve() : fail();
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}
export function RazorpayTest({ userId, marker, initialRequest, onContinue }: { userId: string; marker: string; initialRequest?: string; onContinue: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const prepared = useRef(false);
  const modalOpen = useRef(false);
  const modalInstance = useRef<Modal | null>(null);
  async function request(path: string, body: unknown): Promise<Result | { state: "not_created" }> {
    const signal = abort.current?.signal;
    const response = await fetch(`/api/checkout/razorpay-test/${path}`, { method: "POST", cache: "no-store", signal, headers: { "Content-Type": "application/json", Accept: "application/json", "x-account-owner": userId }, body: typeof body === "string" ? body : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (signal?.aborted || !response.ok || !(data?.state === "not_created" || validResult(data))) throw new Error();
    return data;
  }
  function clearMarker() {
    if (sessionStorage.getItem(markerKey(userId)) !== marker) throw new Error();
    sessionStorage.removeItem(markerKey(userId));
  }
  async function apply(data: Result | { state: "not_created" }) {
    if (!active.current) return;
    if (data.state === "not_created") { clearMarker(); setResult(null); setMissing(true); setError("No test order was created. You can return to review."); return; }
    const order = data as Result;
    setResult(order);
    if (order.state === "paid") {
      if (order.mode === "cart") { const cart = await loadCustomerCart(abort.current?.signal).catch(() => null); if (!active.current) return; if (cart) publishCustomerCart(userId, cart); }
      else { const selection = getBuyNowSelection(); if (selection && sameCartItems(selection, order.items)) clearBuyNowSelection(); }
      clearMarker();
    }
  }
  async function check() {
    const controller = abort.current;
    const current = () => active.current && abort.current === controller && !controller?.signal.aborted;
    setBusy(true); setError("");
    try { await apply(await request("recover", { requestKey: marker })); }
    catch { if (current()) setError("The test payment status could not be checked. Check again before starting another attempt."); }
    finally { if (current()) setBusy(false); }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    abort.current = controller;
    void (async () => {
      if (!uuid.test(marker)) { setError("The saved test payment marker is invalid. Check your orders before continuing."); setBusy(false); return; }
      if (initialRequest) {
        await Promise.resolve();
        if (controller.signal.aborted) return;
      }
      if (!initialRequest || prepared.current) { await check(); return; }
      prepared.current = true;
      try { await apply(await request("prepare", initialRequest)); }
      catch { if (!controller.signal.aborted && active.current) setError("The test order result is uncertain. Check again; this will not create another order."); }
      finally { if (!controller.signal.aborted && active.current) setBusy(false); }
    })();
    return () => { active.current = false; controller.abort(); modalInstance.current?.close(); modalInstance.current = null; };
    // A mounted instance represents one owner and one attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function openPayment() {
    if (!result || result.state !== "ready" || busy || modalOpen.current) return;
    modalOpen.current = true;
    let opened = false;
    setBusy(true); setError("");
    try {
      await loadRazorpay();
      if (!active.current || !window.Razorpay) return;
      let callbackStarted = false;
      const modal = new window.Razorpay({ key: result.key, order_id: result.providerOrderId, amount: result.totalPaise, currency: "INR", name: "PandaByte", description: "Test payment", handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        if (!active.current) return;
        callbackStarted = true;
        setError(""); setBusy(true);
        try {
          const verified = await request("verify", { requestKey: marker, orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
          await apply(verified);
          for (let i = 0; i < 10 && active.current && verified.state !== "paid"; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (!active.current) return;
            const next = await request("recover", { requestKey: marker });
            await apply(next);
            if (next.state === "paid" || next.state === "failed" || next.state === "cancelled") break;
          }
        } catch { if (active.current) setError("Payment confirmation is pending. Check again to see the latest status."); }
        finally { modalOpen.current = false; if (active.current) setBusy(false); }
      }, modal: { ondismiss: async () => { if (!active.current || callbackStarted) return; setBusy(true); try { const cancelled = await request("cancel", { requestKey: marker }); if (!callbackStarted) await apply(cancelled); } catch { if (active.current && !callbackStarted) setError("The payment result is uncertain. Check again."); } finally { if (!callbackStarted) { modalOpen.current = false; if (active.current) setBusy(false); } } } } });
      modal.on("payment.failed", () => { if (active.current && !callbackStarted) setError("The test payment failed in Razorpay. Check the order status before another attempt."); });
      modalInstance.current = modal;
      modal.open();
      opened = true;
    } catch { if (active.current) setError("The test payment window could not be opened. Try again."); }
    finally { if (!opened) { modalOpen.current = false; if (active.current) setBusy(false); } }
  }
  return <section className={styles.panel}><h2>Razorpay test payment</h2>{result && <><p>Reference: {result.reference} · Test total: {formatPaise(result.totalPaise)}</p><p role="status">{result.state === "paid" ? "Test payment confirmed." : result.state === "verified" ? "Payment verified; awaiting confirmation." : `Test payment status: ${result.state}.`}</p></>}{error && <p role="alert">{error}</p>}{result && ["failed", "cancelled"].includes(result.state) && <p>Razorpay may still report a late result. Check again before retrying.</p>}{result?.state === "ready" && <button className="shell-button" type="button" disabled={busy} onClick={() => void openPayment()}>Continue test payment</button>}{result?.state !== "paid" && <button className="shell-button" type="button" disabled={busy} onClick={() => void check()}>{busy ? "Checking…" : "Check again"}</button>}{missing && <button type="button" className="shell-button" onClick={onContinue}>Continue review</button>}<p><Link href="/account#orders">View orders</Link></p></section>;
}
