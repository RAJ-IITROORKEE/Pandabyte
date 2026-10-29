"use client";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, CreditCard, Package, ShoppingBag, Truck, User } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { CustomerAddress } from "@/lib/account/addresses";
import { parseBillingProfile, type BillingProfile } from "@/lib/account/billing-profile";
import type { CartInputLine, CartQuote, CartQuoteLine } from "@/lib/cart/validation";
import { cardImageIds } from "@/components/catalog/card-image-selection";
import { cartErrorMessage, loadCustomerCart, quoteCart } from "./cart-api";
import { clearBuyNowSelection, getBuyNowSelection, getBuyNowServerSnapshot, subscribeBuyNowSelection } from "./buy-now-store";
import { emptyAddress, validateStep, type Address, type CheckoutDraft } from "./checkout-validation";
import { formatPaise, includedDiscount } from "./checkout-money";
import { clearDraft, readDraft, saveDraft } from "./checkout-draft";
import { publishCustomerCart } from "./customer-cart-store";
import { sameCartItems } from "./cart-utils";
import { readPending, savePending, clearPending, forgetPending } from "./simulation-pending";
import styles from "./checkout-review.module.css";
import { RazorpayTest, markerKey } from "./razorpay-test-payment";
const steps = [{ label: "Information", icon: User }, { label: "Shipping", icon: Truck }, { label: "Payment", icon: CreditCard }, { label: "Review", icon: Package }];
function checkoutAddress(a: CustomerAddress): Address {
  return { recipientName: a.recipientName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country === "IN" ? "India" : a.country };
}
function addressEmpty(a: Address) {
  return !a.recipientName && !a.phone && !a.line1 && !a.line2 && !a.city && !a.state && !a.postalCode && (!a.country || a.country === "India");
}

function initializeAddresses(current: CheckoutDraft, addresses: CustomerAddress[], touched: { shipping: boolean; billing: boolean; sameBilling: boolean }): CheckoutDraft {
  const shipping = addresses.find(a => a.isDefaultShipping);
  const billing = addresses.find(a => a.isDefaultBilling);
  const applyShipping = !!shipping && !touched.shipping && addressEmpty(current.shipping);
  const applyBilling = !!billing && !touched.billing && addressEmpty(current.billing);
  const nextShipping = applyShipping ? checkoutAddress(shipping) : current.shipping;
  const nextBilling = applyBilling ? checkoutAddress(billing) : current.billing;
  const addressesMatch = Object.entries(nextBilling).every(([key, value]) => nextShipping[key as keyof Address] === value);
  return { ...current,
    shipping: nextShipping,
    billing: nextBilling,
    sameBilling: !touched.sameBilling && applyBilling && !addressesMatch ? false : current.sameBilling,
  };
}
function initializeBilling(current: CheckoutDraft, profile: BillingProfile, touched: { business: boolean; gstin: boolean }): CheckoutDraft {
  return { ...current,
    business: !touched.business && !current.business ? profile.businessName : current.business,
    gstin: !touched.gstin && !current.gstin ? profile.gstin : current.gstin,
  };
}
export function CheckoutReview({ buyNow = false }: { buyNow?: boolean }) {
  const { user, isLoaded } = useUser();
  const [completed, setCompleted] = useState<{ userId: string; reference: string; totalPaise: number } | null>(null);
  const [recovery, setRecovery] = useState<{ userId: string; pending: boolean; raw: string | null; marker: string | null; error: boolean } | null>(null);
  const [testPending, setTestPending] = useState<{ userId: string; marker: string | null; initialRequest?: string; error?: boolean } | null>(null);
  const storedSelection = useSyncExternalStore(subscribeBuyNowSelection, getBuyNowSelection, getBuyNowServerSnapshot);
  const selection = buyNow ? storedSelection : null;
  useEffect(() => { if (isLoaded && !user) { clearDraft(); forgetPending(); } }, [isLoaded, user]);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.resolve().then(() => {
      try { const marker = sessionStorage.getItem(markerKey(userId)); if (active) setTestPending({ userId, marker }); } catch { if (active) setTestPending({ userId, marker: null, error: true }); }
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.resolve().then(() => {
      try { const value = readPending(sessionStorage, userId); if (active) setRecovery({ userId, ...value, error: false }); }
      catch { if (active) setRecovery({ userId, pending: true, raw: null, marker: null, error: true }); }
    });
    return () => { active = false; };
  }, [userId, buyNow, selection]);
  if (!isLoaded) return <p role="status">Loading your checkout review…</p>;
  if (!user) { return <section className={styles.panel}><p>Your session has changed. Sign in to review your cart.</p><Link className="shell-button" href={`/sign-in?redirect_url=${encodeURIComponent(buyNow ? "/checkout?mode=buy-now" : "/checkout")}`}>Sign in</Link></section>; }
  if (testPending?.userId !== user.id) return <p role="status">Checking for a pending test payment...</p>;
  if (testPending.error) return <section className={styles.panel}><p role="alert">Saved test payment details cannot be checked. Check your orders before attempting another payment.</p><Link href="/account#orders">View orders</Link></section>;
  if (testPending.marker) return <RazorpayTest key={`${user.id}:${testPending.marker}`} userId={user.id} marker={testPending.marker} initialRequest={testPending.initialRequest} onContinue={() => setTestPending({ userId: user.id, marker: null })} />;
  if (completed?.userId === user.id) return <section className={styles.panel}><h2>Simulated order created</h2><p>Reference: {completed.reference}</p><p>Simulated total: {formatPaise(completed.totalPaise)}. No real payment was collected.</p><p><Link className="shell-button inline-flex" href={`/checkout/confirmation/${encodeURIComponent(completed.reference)}`}>View simulated order</Link></p></section>;
  if (recovery?.userId !== user.id) return <p role="status">Checking for a pending simulation...</p>;
  if (recovery.error) return <section className={styles.panel}><p role="alert">Saved simulation details cannot be checked. Check your orders before attempting another simulation.</p><Link className="shell-button inline-flex" href="/account#orders">View orders</Link></section>;
  if (recovery.pending && recovery.marker) return <SimulationRecovery key={`${user.id}:${recovery.marker}`} userId={user.id} marker={recovery.marker} onCompleted={result => setCompleted({ ...result, userId: user.id })} onContinue={() => setRecovery({ userId: user.id, pending: false, raw: null, marker: null, error: false })} />;
  if (buyNow && !selection) return <section className={styles.panel}><p>Your Buy Now selection is no longer available. Return to the product or review your cart.</p><Link className="shell-button" href="/cart">Open cart</Link></section>;
  const key = `${user.id}:${JSON.stringify(selection)}`;
  return <CheckoutSession key={key} draftKey={key} userId={user.id} onTestPending={(marker, initialRequest) => setTestPending({ userId: user.id, marker, initialRequest })} onPending={marker => setRecovery({ userId: user.id, pending: true, raw: null, marker, error: false })} onCompleted={result => setCompleted({ ...result, userId: user.id })} selection={selection} email={user.primaryEmailAddress?.emailAddress ?? ""} name={user.fullName ?? ""} />;
}
function CheckoutSession({ draftKey, userId, onPending, onTestPending, onCompleted, selection, email, name }: { draftKey: string; userId: string; onTestPending: (marker: string, initialRequest: string) => void; onPending: (marker: string) => void; onCompleted: (result: { reference: string; totalPaise: number }) => void; selection: CartInputLine[] | null; email: string; name: string }) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [error, setError] = useState("");
  const [cartVersion, setCartVersion] = useState<number | null>(null);
  const [capability, setCapability] = useState<{ shipping: number; tax: number } | null>(null);
  const [testCapability, setTestCapability] = useState<{ shipping: number; tax: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const pendingRequest = useRef<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [attempt, setAttempt] = useState(0);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [accountError, setAccountError] = useState("");
  const [billingError, setBillingError] = useState(false);
  const [step, setStep] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasSavedDraft] = useState(() => !!readDraft(draftKey));
  const [draft, setDraft] = useState<CheckoutDraft>(() => {
    const saved = readDraft(draftKey);
    if (saved) return saved;
    const [firstName = "", ...rest] = name.trim().split(/\s+/);
    return { email, firstName, lastName: rest.join(" "), phone: "", news: false, shipping: emptyAddress(), billing: emptyAddress(), sameBilling: true, business: "", gstin: "" };
  });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [billingTouched, setBillingTouched] = useState({ business: false, gstin: false });
  const [addressTouched, setAddressTouched] = useState({ shipping: false, billing: false, sameBilling: hasSavedDraft });
  const defaultsLoaded = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const changedStep = useRef(false);
  useEffect(() => { if (changedStep.current) heading.current?.focus(); }, [step]);
  useEffect(() => {
    const controller = new AbortController();
    const request = selection ? quoteCart(selection, controller.signal) : loadCustomerCart(controller.signal).then(cart => { if (!controller.signal.aborted) setCartVersion(cart.version); return cart.quote; });
    request.then(value => { if (!controller.signal.aborted) setQuote(value); }).catch(cause => { if (!controller.signal.aborted) setError(cartErrorMessage(cause, selection ? "quote" : "read")); });
    return () => controller.abort();
  }, [attempt, selection]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/checkout/capabilities", { cache: "no-store", signal: controller.signal }).then(response => response.ok ? response.json() : null).then(body => {
      if (!controller.signal.aborted && body?.simulationAvailable === true && Number.isSafeInteger(body.fictionalShippingPaise) && body.fictionalShippingPaise >= 0 && Number.isSafeInteger(body.fictionalTaxPaise) && body.fictionalTaxPaise >= 0) setCapability({ shipping: body.fictionalShippingPaise, tax: body.fictionalTaxPaise });
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/checkout/razorpay-test/capabilities", { cache: "no-store", signal: controller.signal, headers: { "x-account-owner": userId } }).then(response => response.ok ? response.json() : null).then(body => {
      if (!controller.signal.aborted && body?.razorpayTestAvailable === true && Number.isSafeInteger(body.fictionalShippingPaise) && body.fictionalShippingPaise >= 0 && Number.isSafeInteger(body.fictionalTaxPaise) && body.fictionalTaxPaise >= 0) setTestCapability({ shipping: body.fictionalShippingPaise, tax: body.fictionalTaxPaise });
    }).catch(() => {});
    return () => controller.abort();
  }, [userId]);
  useEffect(() => {
    const controller = new AbortController();
    async function loadAccount() {
      try {
        const [a, p] = await Promise.all([fetch("/api/account/addresses", { cache: "no-store", signal: controller.signal }), fetch("/api/account/profile", { cache: "no-store", signal: controller.signal })]);
        if (!a.ok || !p.ok) throw new Error();
        const addressBody = await a.json(); const profileBody = await p.json();
        if (!Array.isArray(addressBody.addresses) || !addressBody.addresses.every((address: CustomerAddress) => address && typeof address.id === "string" && typeof address.label === "string" && typeof address.recipientName === "string" && typeof address.phone === "string" && typeof address.line1 === "string" && typeof address.line2 === "string" && typeof address.country === "string" && typeof address.isDefaultShipping === "boolean" && typeof address.isDefaultBilling === "boolean" && typeof address.city === "string" && typeof address.state === "string" && typeof address.postalCode === "string") || (profileBody.profile !== null && (typeof profileBody.profile !== "object" || typeof profileBody.profile.phone !== "string"))) throw new Error();
        if (controller.signal.aborted) return;
        setAddresses(addressBody.addresses);
        setAccountError("");
        const initializeDefaults = !defaultsLoaded.current;
        defaultsLoaded.current = true;
        setDraft(current => {
          const next = initializeDefaults ? initializeAddresses(current, addressBody.addresses, addressTouched) : current;
          return { ...next, phone: phoneTouched || current.phone ? current.phone : profileBody.profile?.phone ?? "" };
        });
      } catch { if (!controller.signal.aborted) setAccountError("Saved details could not be loaded. You can enter them below."); }
    }
    void loadAccount(); return () => controller.abort();
  }, [phoneTouched, addressTouched]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/billing-profile", { cache: "no-store", signal: controller.signal, headers: { "x-account-owner": userId } }).then(async response => {
      if (!response.ok) throw new Error();
      const body = await response.json();
      const profile = parseBillingProfile(body?.billingProfile);
      if (!profile) throw new Error();
      if (!controller.signal.aborted) { setBillingError(false); setDraft(current => initializeBilling(current, profile, billingTouched)); }
    }).catch(() => { if (!controller.signal.aborted) setBillingError(true); });
    return () => controller.abort();
  }, [userId, billingTouched]);
  const update = (next: CheckoutDraft) => { setDraft(next); saveDraft(draftKey, next); };
  const go = (next: number) => { setErrors({}); changedStep.current = true; setStep(next); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateStep(draft, step); setErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) { requestAnimationFrame(() => document.getElementById(`checkout-${first}`)?.focus()); return; }
    if (step < 3) go(step + 1);
  };
  const simulate = async () => {
    if (submitting.current || !quote || quote.subtotalPaise === null || !capability || (!selection && cartVersion === null)) return;
    submitting.current = true;
    if (!pendingRequest.current) pendingRequest.current = JSON.stringify({ idempotencyKey: crypto.randomUUID(), mode: selection ? "buy-now" : "cart", expectedCartVersion: selection ? null : cartVersion, expectedSubtotalPaise: quote.subtotalPaise, items: quote.lines.map(({ variantId, quantity }) => ({ variantId, quantity })), contact: { email: draft.email, firstName: draft.firstName, lastName: draft.lastName, phone: draft.phone }, shipping: draft.shipping, billing: draft.sameBilling ? draft.shipping : draft.billing, business: draft.business, gstin: draft.gstin });
    try { savePending(sessionStorage, userId, pendingRequest.current); }
    catch { submitting.current = false; pendingRequest.current = null; setSimulationError("This browser could not save the simulation marker. No order was submitted."); return; }
    setLocked(true); setSending(true); setSimulationError("");
    try {
      const response = await fetch("/api/checkout/simulate", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", "x-account-owner": userId }, body: pendingRequest.current });
      const body = await response.json().catch(() => null);
      if (!response.ok || !/^SIM-[0-9a-f-]{36}$/i.test(body?.reference ?? "") || body?.environment !== "simulation" || body?.paymentState !== "simulated" || !Number.isSafeInteger(body?.totalPaise) || body.totalPaise < 0) throw new Error();
      if (!mounted.current) return;
      const marker = JSON.parse(pendingRequest.current!).idempotencyKey as string;
      if (!clearPending(sessionStorage, userId, marker)) throw new Error();
      clearDraft();
      if (selection && sameCartItems(getBuyNowSelection() ?? [], selection)) clearBuyNowSelection();
      else if (!selection) { const cart = await loadCustomerCart().catch(() => null); if (!mounted.current) return; if (cart) publishCustomerCart(userId, cart); }
      onCompleted({ reference: body.reference, totalPaise: body.totalPaise });
    } catch { if (mounted.current && pendingRequest.current) onPending(JSON.parse(pendingRequest.current).idempotencyKey); }
    finally { submitting.current = false; setSending(false); }
  };
  const startTest = () => {
    if (submitting.current || !testCapability || !quote || quote.subtotalPaise === null || (!selection && cartVersion === null)) return;
    const marker = crypto.randomUUID();
    try {
      if (sessionStorage.getItem(markerKey(userId))) throw new Error();
      sessionStorage.setItem(markerKey(userId), marker);
    } catch { setSimulationError("This browser could not save the test payment marker. No order was submitted."); return; }
    submitting.current = true;
    const request = JSON.stringify({ idempotencyKey: marker, mode: selection ? "buy-now" : "cart", expectedCartVersion: selection ? null : cartVersion, expectedSubtotalPaise: quote.subtotalPaise, items: quote.lines.map(({ variantId, quantity }) => ({ variantId, quantity })), contact: { email: draft.email, firstName: draft.firstName, lastName: draft.lastName, phone: draft.phone }, shipping: draft.shipping, billing: draft.sameBilling ? draft.shipping : draft.billing, business: draft.business, gstin: draft.gstin });
    onTestPending(marker, request);
  };
  if (error) return <section className={styles.panel} aria-label="Checkout could not load"><p role="alert">{error}</p><button className="shell-button" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button><Link className={styles.link} href="/cart">Return to cart</Link></section>;
  if (!quote) return <p role="status">Loading your checkout review…</p>;
  if (!quote.lines.length) return <section className={styles.panel}><ShoppingBag aria-hidden="true" /><h2>Your selection is empty</h2><p>Add a product to review it here.</p><Link className="shell-button" href="/cart" onClick={clearBuyNowSelection}>Open cart</Link></section>;
  const field = (key: string, label: string, value: string, change: (value: string) => void, options: { optional?: boolean; type?: string; autoComplete?: string; placeholder?: string; full?: boolean; maxLength?: number; inputMode?: "numeric" } = {}) => <label className={options.full ? styles.full : undefined} htmlFor={`checkout-${key}`}>{label}{options.optional ? " (optional)" : " *"}<input id={`checkout-${key}`} value={value} type={options.type ?? "text"} autoComplete={options.autoComplete} placeholder={options.placeholder} maxLength={options.maxLength ?? 200} inputMode={options.inputMode} required={!options.optional} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} onChange={event => change(event.target.value)} />{errors[key] && <small id={`error-${key}`} className={styles.error}>{errors[key]}</small>}</label>;
  const addressFields = (prefix: "shipping" | "billing") => {
    const a = draft[prefix]; const set = (key: keyof Address, value: string) => { setAddressTouched(current => current[prefix] ? current : { ...current, [prefix]: true }); update({ ...draft, [prefix]: { ...a, [key]: value } }); };
    return <div className={styles.fields}>{field(`${prefix}.recipientName`, "Recipient name", a.recipientName, value => set("recipientName", value), { full: true, autoComplete: `${prefix} name` })}{field(`${prefix}.phone`, "Contact phone", a.phone, value => set("phone", value), { full: true, type: "tel", autoComplete: `${prefix} tel`, placeholder: "+91 98765 43210" })}{field(`${prefix}.line1`, "Address line 1", a.line1, value => set("line1", value), { full: true, autoComplete: `${prefix} address-line1` })}{field(`${prefix}.line2`, "Address line 2", a.line2, value => set("line2", value), { full: true, optional: true, autoComplete: `${prefix} address-line2` })}{field(`${prefix}.city`, "City", a.city, value => set("city", value), { autoComplete: `${prefix} address-level2` })}{field(`${prefix}.state`, "State", a.state, value => set("state", value), { autoComplete: `${prefix} address-level1` })}{field(`${prefix}.postalCode`, "PIN code", a.postalCode, value => set("postalCode", value), { maxLength: 6, inputMode: "numeric", autoComplete: `${prefix} postal-code` })}{field(`${prefix}.country`, "Country", a.country, value => set("country", value), { autoComplete: `${prefix} country-name` })}</div>;
  };
  const savedAddressSelect = (prefix: "shipping" | "billing") => addresses.length > 0 && <label className={styles.select}>Saved {prefix} address<select value={addresses.find(a => Object.entries(checkoutAddress(a)).every(([key, value]) => draft[prefix][key as keyof Address] === value))?.id ?? ""} onChange={event => { const a = addresses.find(item => item.id === event.target.value); if (a) { setAddressTouched(current => current[prefix] ? current : { ...current, [prefix]: true }); update({ ...draft, [prefix]: checkoutAddress(a) }); } }}><option value="">Enter an address</option>{addresses.map(a => <option key={a.id} value={a.id}>{a.label} — {a.recipientName}, {a.city}</option>)}</select></label>;
  const addressText = (a: Address) => [a.recipientName, a.line1, a.line2, a.city, a.state, a.postalCode, a.country, a.phone].filter(Boolean).join(", ");
  const Icon = steps[step].icon;
  return <div className={styles.layout}>
    <div className={styles.left}>
      <ol className={styles.stepper} aria-label="Checkout progress">{steps.map((item, index) => { const StepIcon = item.icon; return <li key={item.label} aria-current={index === step ? "step" : undefined} className={index === step ? styles.active : index < step ? styles.completed : ""}><button type="button" disabled={index > step || sending || locked} onClick={() => go(index)} aria-label={`Go to ${item.label}${index < step ? ", completed" : ""}`}><span className={styles.circle}><StepIcon size={19} aria-hidden="true" /></span><span>{item.label}{index < step && <span className={styles.sr}> completed</span>}</span>{index === step && <span className={styles.sr}> current step</span>}</button></li>; })}</ol>
      <form className={styles.panel} onSubmit={submit} noValidate>
        <h2 ref={heading} tabIndex={-1}><Icon size={19} aria-hidden="true" /> {steps[step].label}</h2>
        {accountError && step < 2 && <p role="status">{accountError}</p>}
        {billingError && step === 1 && <p role="status">Saved billing details could not be loaded. You can enter them below.</p>}
        {step === 0 && <><div className={styles.fields}>{field("email", "Email address", draft.email, value => update({ ...draft, email: value }), { full: true, type: "email", autoComplete: "email" })}{field("firstName", "First name", draft.firstName, value => update({ ...draft, firstName: value }), { autoComplete: "given-name" })}{field("lastName", "Last name", draft.lastName, value => update({ ...draft, lastName: value }), { autoComplete: "family-name" })}{field("phone", "Phone number", draft.phone, value => { setPhoneTouched(true); update({ ...draft, phone: value }); }, { full: true, type: "tel", autoComplete: "tel", placeholder: "+91 98765 43210" })}</div><label className={styles.check}><input type="checkbox" checked={draft.news} onChange={event => update({ ...draft, news: event.target.checked })} /> Email me with news and offers</label><p>Details are for this review and are not saved to your account.</p></>}
        {step === 1 && <>{savedAddressSelect("shipping")}{addressFields("shipping")}<Link className={styles.link} href="/account#addresses">Manage saved addresses</Link><p>Shipping methods, delivery estimates and charges have not yet been calculated.</p><label className={styles.check}><input type="checkbox" checked={draft.sameBilling} onChange={event => { setAddressTouched(current => current.sameBilling ? current : { ...current, sameBilling: true }); update({ ...draft, sameBilling: event.target.checked }); }} /> Billing address is the same as shipping address</label>{!draft.sameBilling && <><h3>Billing address</h3>{savedAddressSelect("billing")}{addressFields("billing")}</>}<div className={styles.fields}>{field("business", "Business name", draft.business, value => { setBillingTouched(current => current.business ? current : { ...current, business: true }); update({ ...draft, business: value }); }, { optional: true, autoComplete: "organization" })}{field("gstin", "GSTIN", draft.gstin, value => { setBillingTouched(current => current.gstin ? current : { ...current, gstin: true }); update({ ...draft, gstin: value.toUpperCase() }); }, { optional: true, maxLength: 15 })}</div><p>GSTIN format is checked; registration is not verified.</p></>}
        {step === 2 && <><label className={styles.paymentChoice}><input type="radio" name="payment" checked readOnly /> <span><strong>{testCapability ? "Razorpay test mode" : capability ? "Development simulation" : "Razorpay"}</strong><br />{testCapability ? "Test payment only; no real charge." : capability ? "No real payment will be collected." : "Payment will be completed through Razorpay when integration is enabled."}</span></label><p>{testCapability ? "Continue to review the test order." : capability ? "Continue to review the simulated order." : "Online payment is not enabled yet. You can continue to review your details."}</p><h3>Billing address</h3><p>{addressText(draft.sameBilling ? draft.shipping : draft.billing)}</p></>}
        {step === 3 && <div className={styles.review}><p>This is a review, not an order confirmation.</p><section><h3>Contact <button type="button" disabled={sending || locked} onClick={() => go(0)}>Edit</button></h3><p>{draft.firstName} {draft.lastName}<br />{draft.email}<br />{draft.phone}</p></section><section><h3>Shipping <button type="button" disabled={sending || locked} onClick={() => go(1)}>Edit</button></h3><p>{addressText(draft.shipping)}</p></section><section><h3>Billing <button type="button" disabled={sending || locked} onClick={() => go(1)}>Edit</button></h3><p>{addressText(draft.sameBilling ? draft.shipping : draft.billing)}{draft.business && ` · ${draft.business}`}{draft.gstin && ` · GSTIN ${draft.gstin}`}</p></section><section><h3>Payment <button type="button" disabled={sending || locked} onClick={() => go(2)}>Edit</button></h3><p>{testCapability ? "Razorpay test mode - no real charge." : capability ? "Development simulation - no real payment." : "Razorpay - online payment is not enabled yet."}</p></section>{testCapability && quote.subtotalPaise !== null ? <><p>Razorpay test mode. Fictional shipping: {formatPaise(testCapability.shipping)}; fictional tax: {formatPaise(testCapability.tax)}. Test total: {formatPaise(quote.subtotalPaise + testCapability.shipping + testCapability.tax)}.</p>{simulationError && <p role="alert">{simulationError}</p>}<button type="button" className={styles.primary} disabled={sending || (!selection && cartVersion === null)} onClick={startTest}>Prepare test payment</button></> : capability && quote.subtotalPaise !== null ? <><p>Development simulation - no real payment. Fictional shipping: {formatPaise(capability.shipping)}; fictional tax: {formatPaise(capability.tax)}. Simulated total: {formatPaise(quote.subtotalPaise + capability.shipping + capability.tax)}.</p>{simulationError && <p role="alert">{simulationError}</p>}<button type="button" className={styles.primary} disabled={sending || (!selection && cartVersion === null)} onClick={() => void simulate()}>{sending ? "Creating simulated order..." : locked ? "Retry simulated order" : "Create simulated order"}</button></> : <><p>Shipping, GST and final total are pending. No stock is reserved and no order is placed.</p><button type="button" className={styles.disabled} disabled>Payment unavailable</button><p>Payment will be available when checkout integration is enabled.</p></>}</div>}
        <div className={styles.navigation}><button type="button" disabled={step === 0 || sending || locked} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Previous</button>{step < 3 && <button type="submit" className={styles.primary}>{step === 2 ? "Continue to review" : "Continue"} <ArrowRight size={16} aria-hidden="true" /></button>}</div>
      </form>
    </div>
    <aside className={`${styles.panel} ${styles.summary}`} aria-label="Order summary"><h2 className={styles.summaryHeading}>Order Summary</h2><button type="button" className={styles.summaryToggle} aria-expanded={summaryOpen} aria-controls="checkout-summary-items" onClick={() => setSummaryOpen(value => !value)}><span>Order Summary {summaryOpen ? "−" : "+"}</span><strong>Estimated subtotal: {formatPaise(quote.subtotalPaise)}</strong></button><div id="checkout-summary-items" className={summaryOpen ? styles.summaryBody : `${styles.summaryBody} ${styles.collapsed}`}><Summary quote={quote} selection={selection} capability={testCapability ?? capability} testMode={!!testCapability} /></div></aside>
  </div>;
}
function SimulationRecovery({ userId, marker, onCompleted, onContinue }: { userId: string; marker: string; onCompleted: (result: { reference: string; totalPaise: number }) => void; onContinue: () => void }) {
  const [status, setStatus] = useState<"checking" | "error" | "missing">("checking");
  const controller = useRef<AbortController | null>(null);
  const check = async () => {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch("/api/checkout/simulate/recover", { method: "POST", cache: "no-store", signal: request.signal, headers: { "Content-Type": "application/json", Accept: "application/json", "x-account-owner": userId }, body: JSON.stringify({ idempotencyKey: marker }) });
      const body = await response.json().catch(() => null);
      if (request.signal.aborted) return;
      const order = body?.order;
      if (!response.ok || (body?.state !== "not_created" && (body?.state !== "created" || !/^SIM-[0-9a-f-]{36}$/i.test(order?.reference ?? "") || order?.environment !== "simulation" || order?.paymentState !== "simulated" || !Number.isSafeInteger(order?.totalPaise) || order.totalPaise < 0 || !["cart", "buy-now"].includes(order?.snapshot?.mode) || !Array.isArray(order?.snapshot?.quote?.lines)))) throw new Error();
      if (body.state === "not_created") { if (!clearPending(sessionStorage, userId, marker)) throw new Error(); setStatus("missing"); return; }
      if (order.snapshot.mode === "cart") {
        const cart = await loadCustomerCart(request.signal).catch(() => null);
        if (request.signal.aborted) return;
        if (cart) publishCustomerCart(userId, cart);
      }
      if (!clearPending(sessionStorage, userId, marker)) throw new Error();
      if (order.snapshot.mode === "buy-now") {
        const selection = getBuyNowSelection();
        if (selection && sameCartItems(selection, order.snapshot.quote.lines)) clearBuyNowSelection();
      }
      onCompleted({ reference: order.reference, totalPaise: order.totalPaise });
    } catch { if (!request.signal.aborted) setStatus("error"); }
    finally { if (controller.current === request) controller.current = null; }
  };
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void check(); }); return () => { active = false; controller.current?.abort(); controller.current = null; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className={styles.panel}><h2>Pending simulation</h2>{status === "missing" ? <><p>No simulated order was created.</p><button className="shell-button" type="button" onClick={onContinue}>Continue review</button></> : <><p>The result of an earlier simulation is uncertain. Checking will not create an order.</p>{status === "error" && <p role="alert">The result could not be checked. Please check again.</p>}<button className="shell-button" type="button" disabled={status === "checking"} onClick={() => { setStatus("checking"); void check(); }}>{status === "checking" ? "Checking simulation..." : "Check again"}</button><Link className={styles.link} href="/account#orders">View orders</Link></>}</section>;
}
function Summary({ quote, selection, capability, testMode = false }: { quote: CartQuote; selection: CartInputLine[] | null; capability: { shipping: number; tax: number } | null; testMode?: boolean }) {
  const discount = includedDiscount(quote.lines);
  return <><ul className={styles.items}>{quote.lines.map(line => <SummaryLine key={`${line.variantId}:${line.productId}:${line.revisionId}`} line={line} />)}</ul><dl className={styles.totals}><div><dt>Subtotal</dt><dd>{formatPaise(quote.subtotalPaise)}</dd></div>{discount > 0 && <div><dt>Discount included</dt><dd>{formatPaise(discount)}</dd></div>}<div><dt>{capability ? "Fictional shipping" : "Shipping"}</dt><dd>{capability ? formatPaise(capability.shipping) : "Not calculated"}</dd></div><div><dt>{capability ? "Fictional tax" : "GST"}</dt><dd>{capability ? formatPaise(capability.tax) : "Not calculated"}</dd></div><div><dt>Total</dt><dd>{capability && quote.subtotalPaise !== null ? formatPaise(quote.subtotalPaise + capability.shipping + capability.tax) : "Not calculated"}</dd></div></dl><p>{testMode ? "Test payment only; no real charge." : capability ? "Simulation only; no real payment." : "Final total is not yet available."}</p>{!quote.readyForCheckout && <p>{quote.lines.every(line => line.issue === null || (line.issue === "quantity_unavailable" && line.variant?.cartEligible === true)) ? "Stock is unverified for one or more items." : "Some items need attention. Return to the cart to review availability and pricing."}</p>}{selection ? <div><p>Buy Now selection; your saved cart is unchanged.</p><Link className={styles.link} href="/checkout" onClick={clearBuyNowSelection}>Use my cart instead</Link></div> : <Link className={styles.link} href="/cart">Edit cart</Link>}</>;
}
function SummaryLine({ line }: { line: CartQuoteLine }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => { if (!line.slug || !line.productId || !line.revisionId) return; const controller = new AbortController(); void fetch(`/api/published/products/${encodeURIComponent(line.slug)}`, { signal: controller.signal, cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { const record = data?.record; if (controller.signal.aborted || record?.id !== line.productId || record?.revisionId !== line.revisionId || !Array.isArray(record.document?.mediaIds)) return; const ids = record.document.mediaIds.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)); setImage(cardImageIds(line.productId!, ids)[0] ?? null); }).catch(() => {}); return () => controller.abort(); }, [line.slug, line.productId, line.revisionId]);
  return <li><div className={styles.thumbnail}>{image ? <Image src={`/api/media/${encodeURIComponent(image)}?w=96`} alt="" width={48} height={48} unoptimized onError={() => setImage(null)} /> : <span>No image</span>}<span className={styles.badge} aria-label={`Quantity ${line.quantity}`}>{line.quantity}</span></div><div className={styles.itemName}><strong>{line.title ?? "Unavailable item"}</strong>{line.variant?.label !== line.title && <span>{line.variant?.label}</span>}<span>{formatPaise(line.variant?.effectivePricePaise)} each</span>{line.issue && <span>{line.issue === "quantity_unavailable" && line.variant?.cartEligible ? "Stock unverified" : "Item needs attention"}</span>}</div><strong>{formatPaise(line.lineTotalPaise)}</strong></li>;
}
