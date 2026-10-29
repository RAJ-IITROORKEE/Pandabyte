"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { MapPin, Plus, Trash2 } from "lucide-react";
import type { CustomerAddress as Address } from "@/lib/account/addresses";
import styles from "@/components/account.module.css";

type AddressFields = Omit<Address, "id" | "version">;
type EditingAddress =
  | { id: null; fields: AddressFields }
  | { id: string; version: number; fields: AddressFields };

const blankAddress = (): AddressFields => ({
  label: "",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "IN",
  isDefaultShipping: false,
  isDefaultBilling: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAddress(value: unknown): Address | null {
  if (!isRecord(value)) return null;
  const stringFields = ["id", "label", "recipientName", "phone", "line1", "line2", "city", "state", "postalCode", "country"] as const;
  if (!stringFields.every((field) => typeof value[field] === "string")) return null;
  if (typeof value.isDefaultShipping !== "boolean" || typeof value.isDefaultBilling !== "boolean") return null;
  if (typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1) return null;

  return {
    id: value.id as string,
    label: value.label as string,
    recipientName: value.recipientName as string,
    phone: value.phone as string,
    line1: value.line1 as string,
    line2: value.line2 as string,
    city: value.city as string,
    state: value.state as string,
    postalCode: value.postalCode as string,
    country: value.country as string,
    isDefaultShipping: value.isDefaultShipping,
    isDefaultBilling: value.isDefaultBilling,
    version: value.version,
  };
}

function parseAddressList(value: unknown): Address[] | null {
  if (!isRecord(value) || !Array.isArray(value.addresses)) return null;
  const parsed = value.addresses.map(parseAddress);
  return parsed.every((address) => address !== null) ? (parsed as Address[]) : null;
}

async function apiError(response: Response, action: "load" | "save" | "delete"): Promise<string> {
  if (response.status === 401) return "Your session has expired. Refresh the page and sign in again.";
  if (response.status === 409) {
    try {
      const body: unknown = await response.clone().json();
      if (isRecord(body) && isRecord(body.error) && body.error.code === "too_many_addresses") {
        return "You have reached the 20-address limit. Remove a saved address before adding another.";
      }
      if (isRecord(body) && isRecord(body.error) && body.error.code === "account_changed") {
        return "Your active account changed. Reload your address book before trying again.";
      }
    } catch {
      // Keep the generic conflict recovery message when the response has no readable error code.
    }
    return "This address changed elsewhere. Reload your address book before trying again.";
  }
  if (response.status === 404 && action !== "load") return "This address is no longer available. Reload your address book.";
  if (response.status === 400) return "Some address details need attention. Check the fields and try again.";
  if (action === "load") return "Your addresses could not be loaded. Please try again.";
  if (action === "delete") return "This address could not be deleted. Please try again.";
  return "This address could not be saved. Please try again.";
}

function formatAddress(address: Address): string {
  return [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function AddressSummary({ address, hasSaved }: { address: Address | null; hasSaved: boolean }) {
  if (!address) {
    return <p>{hasSaved ? "Choose one of your saved addresses below." : "No address selected yet. Add an address and mark it as the default for this use."}</p>;
  }

  return (
    <>
      <p className={styles.defaultRecipient}>{address.recipientName}</p>
      <p>{formatAddress(address)}</p>
      {address.phone && <p>Delivery contact: {address.phone}</p>}
    </>
  );
}

export function AccountAddresses() {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Loading your address access…</p>;
  if (!user) return <p role="alert">Sign in to manage your addresses.</p>;
  return <AddressSession key={user.id} userId={user.id} />;
}

function AddressSession({ userId }: { userId: string }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingAddress | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const addAddressRef = useRef<HTMLButtonElement>(null);
  const addressLabelRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterCloseRef = useRef<HTMLElement | null>(null);
  const focusAddAfterDeleteRef = useRef(false);
  const focusSaveErrorRef = useRef(false);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const sessionController = useRef<AbortController | null>(null);

  const loadAddresses = useCallback(async (signal = sessionController.current?.signal) => {
    if (signal?.aborted) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/addresses", { cache: "no-store", signal });
      if (!response.ok) throw new Error(await apiError(response, "load"));
      const body: unknown = await response.json();
      const loaded = parseAddressList(body);
      if (!loaded) throw new Error("Your addresses could not be loaded. Please try again.");
      if (signal?.aborted) return;
      setAddresses(loaded);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Your addresses could not be loaded. Please try again.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    sessionController.current = controller;
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadAddresses(controller.signal);
    });
    return () => controller.abort();
  }, [loadAddresses]);

  useEffect(() => {
    if (loading || saving) return;
    if (focusAddAfterDeleteRef.current) {
      focusAddAfterDeleteRef.current = false;
      (addAddressRef.current ?? addressLabelRef.current)?.focus();
      return;
    }
    const target = focusAfterCloseRef.current;
    if (!target) return;
    focusAfterCloseRef.current = null;
    if (target.isConnected) target.focus();
    else (addAddressRef.current ?? addressLabelRef.current)?.focus();
  }, [confirmDeleteId, editing, loading, saving]);

  useEffect(() => {
    if (focusSaveErrorRef.current && error) {
      focusSaveErrorRef.current = false;
      formErrorRef.current?.focus();
    }
  }, [error]);

  const editingId = editing?.id;
  useEffect(() => {
    if (editingId !== undefined) addressLabelRef.current?.focus();
  }, [editingId]);

  function startNewAddress(trigger: HTMLButtonElement) {
    editorTriggerRef.current = trigger;
    setError("");
    setStatus("");
    const first = addresses.length === 0;
    setEditing({
      id: null,
      fields: { ...blankAddress(), isDefaultShipping: first, isDefaultBilling: first },
    });
  }

  function startEdit(address: Address, trigger: HTMLButtonElement) {
    editorTriggerRef.current = trigger;
    setError("");
    setStatus("");
    const fields: AddressFields = {
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefaultShipping: address.isDefaultShipping,
      isDefaultBilling: address.isDefaultBilling,
    };
    setEditing({ id: address.id, version: address.version, fields });
    setConfirmDeleteId(null);
  }

  function closeEditor() {
    focusAfterCloseRef.current = editorTriggerRef.current;
    editorTriggerRef.current = null;
    setEditing(null);
  }

  function updateField<K extends keyof AddressFields>(field: K, value: AddressFields[K]) {
    setEditing((current) => current ? { ...current, fields: { ...current.fields, [field]: value } } : current);
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    const signal = sessionController.current?.signal;
    if (!signal || signal.aborted) return;

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(
        editing.id ? `/api/account/addresses/${encodeURIComponent(editing.id)}` : "/api/account/addresses",
        {
          method: editing.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", "x-account-owner": userId },
          signal,
          body: JSON.stringify(editing.id
            ? { ...editing.fields, expectedVersion: editing.version }
            : editing.fields),
        },
      );
      if (!response.ok) throw new Error(await apiError(response, "save"));
      const body: unknown = await response.json();
      const address = isRecord(body) ? parseAddress(body.address) : null;
      if (!address) throw new Error("The saved address could not be confirmed. Reload your address book.");
      if (signal.aborted) return;

      setAddresses((currentAddresses) => editing.id
        ? currentAddresses.map((item) => item.id === address.id ? address : item)
        : [...currentAddresses, address]);
      closeEditor();
      setStatus("Address saved.");
      await loadAddresses();
    } catch (cause) {
      if (signal.aborted) return;
      focusSaveErrorRef.current = true;
      setError(cause instanceof Error ? cause.message : "This address could not be saved. Please try again.");
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }

  async function deleteAddress(address: Address) {
    if (saving) return;
    const signal = sessionController.current?.signal;
    if (!signal || signal.aborted) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/addresses/${encodeURIComponent(address.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-account-owner": userId },
        signal,
        body: JSON.stringify({ expectedVersion: address.version }),
      });
      if (!response.ok) throw new Error(await apiError(response, "delete"));
      const body: unknown = await response.json();
      if (!isRecord(body) || body.deleted !== true) throw new Error("The address could not be confirmed as deleted.");
      if (signal.aborted) return;
      setAddresses((current) => current.filter((item) => item.id !== address.id));
      setConfirmDeleteId(null);
      focusAddAfterDeleteRef.current = true;
      deleteTriggerRef.current = null;
      setStatus("Address deleted.");
    } catch (cause) {
      if (signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "This address could not be deleted. Please try again.");
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }

  const defaultShipping = addresses.find((address) => address.isDefaultShipping) ?? null;
  const defaultBilling = addresses.find((address) => address.isDefaultBilling) ?? null;

  return (
    <section className={styles.section} aria-labelledby="addresses-heading">
      <div className={styles.sectionHeading}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionIcon}><MapPin aria-hidden="true" size={19} /></span>
          <div>
            <h2 id="addresses-heading">Addresses</h2>
            <p>Save delivery details and choose separate shipping and billing defaults.</p>
          </div>
        </div>
        {!editing && (
          <button ref={addAddressRef} className={styles.primaryAction} type="button" onClick={(event) => startNewAddress(event.currentTarget)} disabled={loading || saving}>
            <Plus aria-hidden="true" size={17} /> Add address
          </button>
        )}
      </div>

      <div className={styles.defaultGrid}>
        <article className={styles.defaultCard}>
          <h3>Default shipping address</h3>
          <AddressSummary address={defaultShipping} hasSaved={addresses.length > 0} />
        </article>
        <article className={styles.defaultCard}>
          <h3>Default billing address</h3>
          <AddressSummary address={defaultBilling} hasSaved={addresses.length > 0} />
        </article>
      </div>

      {loading ? (
        <p className={styles.loadingState} role="status">Loading your saved addresses…</p>
      ) : error && addresses.length === 0 ? (
        <div className={styles.errorState} role="alert">
          <p>{error}</p>
          <button className={styles.secondaryAction} type="button" onClick={() => void loadAddresses()}>
            Try again
          </button>
        </div>
      ) : addresses.length === 0 ? (
        <p className={styles.emptyState}>No saved addresses yet. Add one when you are ready to set up delivery details.</p>
      ) : (
        <div className={styles.addressList} aria-label="Saved addresses">
          {addresses.map((address) => (
            <article key={address.id} className={styles.addressCard}>
              <div className={styles.addressCardHeader}>
                <div>
                  <h3>{address.label}</h3>
                  <div className={styles.addressBadges}>
                    {address.isDefaultShipping && <span className={styles.addressBadge}>Shipping default</span>}
                    {address.isDefaultBilling && <span className={styles.addressBadge}>Billing default</span>}
                  </div>
                </div>
                <div className={styles.addressCardActions}>
                  <button className={styles.textAction} type="button" aria-label={`Edit ${address.label} address`} onClick={(event) => startEdit(address, event.currentTarget)} disabled={saving}>
                    Edit
                  </button>
                  <button
                    className={styles.textAction}
                    type="button"
                    onClick={(event) => {
                      deleteTriggerRef.current = event.currentTarget;
                      setError("");
                      setConfirmDeleteId(address.id);
                    }}
                    disabled={saving}
                    aria-label={`Delete ${address.label} address`}
                  >
                    <Trash2 aria-hidden="true" size={15} /> Delete
                  </button>
                </div>
              </div>
              <p className={styles.defaultRecipient}>{address.recipientName}</p>
              <p>{formatAddress(address)}</p>
              {address.phone && <p>Delivery contact: {address.phone}</p>}

              {confirmDeleteId === address.id && (
                <div className={styles.deleteConfirm} role="group" aria-label={`Confirm deletion of ${address.label} address`}>
                  <p>Delete this saved address?</p>
                  <div className={styles.deleteConfirmActions}>
                    <button className={styles.dangerAction} type="button" onClick={() => void deleteAddress(address)} disabled={saving}>
                      {saving ? "Deleting…" : "Delete address"}
                    </button>
                    <button className={styles.secondaryAction} type="button" onClick={() => {
                      focusAfterCloseRef.current = deleteTriggerRef.current;
                      deleteTriggerRef.current = null;
                      setConfirmDeleteId(null);
                    }} disabled={saving}>
                      Keep address
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className={styles.formPanel}>
          <h3 id="address-form-heading">{editing.id ? "Edit address" : "Add an address"}</h3>
          <form className={styles.addressForm} onSubmit={saveAddress} aria-labelledby="address-form-heading" aria-describedby={error ? "address-form-error" : undefined} aria-busy={saving}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="address-label">Address label</label>
                <input ref={addressLabelRef} id="address-label" name="label" autoComplete="off" required maxLength={40} value={editing.fields.label} onChange={(event) => updateField("label", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="address-recipient">Recipient name</label>
                <input id="address-recipient" name="recipientName" autoComplete="name" required maxLength={120} value={editing.fields.recipientName} onChange={(event) => updateField("recipientName", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="address-phone">Phone for delivery</label>
                <input id="address-phone" name="phone" type="tel" autoComplete="tel" maxLength={48} value={editing.fields.phone} onChange={(event) => updateField("phone", event.target.value)} />
                <small>For delivery contact only; this number is not verified here.</small>
              </div>
              <div className={styles.field}>
                <label htmlFor="address-country">Country code</label>
                <input id="address-country" name="country" autoComplete="country" inputMode="text" pattern="[A-Za-z]{2}" title="Enter a two-letter country code, such as IN." required maxLength={2} value={editing.fields.country} onChange={(event) => updateField("country", event.target.value.toUpperCase().slice(0, 2))} />
                <small>Two-letter ISO code. India is IN.</small>
              </div>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label htmlFor="address-line1">Address line 1</label>
                <input id="address-line1" name="line1" autoComplete="address-line1" required maxLength={200} value={editing.fields.line1} onChange={(event) => updateField("line1", event.target.value)} />
              </div>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label htmlFor="address-line2">Address line 2 <span>(optional)</span></label>
                <input id="address-line2" name="line2" autoComplete="address-line2" maxLength={200} value={editing.fields.line2} onChange={(event) => updateField("line2", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="address-city">City</label>
                <input id="address-city" name="city" autoComplete="address-level2" required maxLength={100} value={editing.fields.city} onChange={(event) => updateField("city", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="address-state">State or region</label>
                <input id="address-state" name="state" autoComplete="address-level1" required maxLength={100} value={editing.fields.state} onChange={(event) => updateField("state", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="address-postal">Postal code</label>
                <input id="address-postal" name="postalCode" autoComplete="postal-code" required maxLength={24} value={editing.fields.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} />
              </div>
            </div>

            <fieldset className={styles.defaults}>
              <legend>Use this address as</legend>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={editing.fields.isDefaultShipping} onChange={(event) => updateField("isDefaultShipping", event.target.checked)} />
                Default shipping address
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={editing.fields.isDefaultBilling} onChange={(event) => updateField("isDefaultBilling", event.target.checked)} />
                Default billing address
              </label>
            </fieldset>

            <div className={styles.formActions}>
              <button className={styles.secondaryAction} type="button" onClick={closeEditor} disabled={saving}>
                Cancel
              </button>
              <button className={styles.primaryAction} type="submit" disabled={saving}>
                {saving ? "Saving…" : editing.id ? "Save address" : "Add address"}
              </button>
            </div>
            {error && <div id="address-form-error" ref={formErrorRef} className={styles.errorState} role="alert" tabIndex={-1}>
              <p>{error}</p>
              {editing.id && (
                <button
                  className={styles.secondaryAction}
                  type="button"
                  onClick={() => {
                    closeEditor();
                    setConfirmDeleteId(null);
                    setStatus("");
                    void loadAddresses();
                  }}
                  disabled={saving}
                >
                  Discard edits and reload address book
                </button>
              )}
            </div>}
          </form>
        </div>
      )}

      {!editing && status && <p className={styles.liveStatus} role="status" aria-live="polite">{status}</p>}
      {!editing && error && addresses.length > 0 && (
        <div className={styles.errorState} role="alert">
          <p>{error}</p>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => void loadAddresses()}
            disabled={saving}
          >
            Reload address book
          </button>
        </div>
      )}
    </section>
  );
}
