"use client";

import {
  IconArrowLeft as ArrowLeft,
  IconArrowRight as ArrowRight,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconDeviceFloppy as Save,
  IconEye as Eye,
  IconPlus as Plus,
  IconRefresh as RefreshCw,
  IconSearch as Search,
  IconTrash as Trash2,
  IconX as X,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { ProductRichContentView } from "@/components/catalog/product-rich-content";
import { ProductDocumentPreview } from "@/components/catalog/product-document-preview";
import { legacyBlocksToRichContent, type ProductRichContent } from "@/lib/admin/product-content";
import { productSlugFromTitle } from "./product-editor-utils";
import { ProductDocumentEditor } from "./product-document-editor";
import { ProductPricingEditor, type ProductPricingState } from "./product-pricing-editor";
import { CategoryImageEditor } from "./category-image-editor";
import galleryStyles from "./product-gallery-editor.module.css";
import confirmationStyles from "./products-table.module.css";
import {
  ADMIN_MODULES,
  parseDocument,
  type AdminDocument,
  type AdminModule,
  type ContentBlock,
  type ProductModel3d,
} from "@/lib/admin/validation";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { ProductModelViewer } from "@/components/catalog/product-model-viewer";
import { PublishedDocument } from "@/components/published-document";
import styles from "./admin-ui.module.css";

const ProductRichTextEditor = dynamic(
  () => import("./product-rich-text-editor").then((module) => module.ProductRichTextEditor),
  { ssr: false, loading: () => <section className={styles.panel} aria-label="Product description"><p className={styles.loadingState} role="status">Loading description editor…</p></section> },
);

type RecordListItem = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  version: number;
  publishedRevisionId: string | null;
  archived: boolean;
  updatedAt: string;
};

type Revision = {
  id: string;
  revisionNumber: number;
  title: string;
  slug: string;
  publishedAt: string;
  publishedBySubject: string | null;
  sourceRevisionId: string | null;
};

type AdminRecord = RecordListItem & {
  document: AdminDocument;
  revisions?: Revision[];
};

type ApiError = { error?: { code?: string; message?: string; fields?: { field: string; message: string }[] } };
type Option = { id: string; label: string };
type ValidationIssue = { field: string; message: string };
type ModuleMeta = { title: string; description: string; singular: string };

const FIELD_LABELS: Record<string, string> = {
  title: "Title", slug: "Slug", summary: "Summary", seoTitle: "SEO title", seoDescription: "SEO description",
  categoryIds: "Categories", modelNumbers: "Model numbers", model3d: "3D model", posterId: "Poster image", variants: "Variants", sku: "SKU", label: "Label",
  specifications: "Specifications", name: "Name", value: "Value", compatibility: "Compatibility", kitContents: "Kit contents",
  resources: "Resources", mediaIds: "Media assets", sourceObservation: "Source observation", sourceReview: "Source review",
  priceText: "Observed price", prices: "Prices", capturedAt: "Capture time", sourceUrl: "Source URL", author: "Author", tags: "Tags",
  answer: "Answer", topic: "Topic", placements: "Placements", parentId: "Parent category", position: "Position",
  role: "Role", bio: "Biography", links: "Links", href: "Destination URL", group: "Navigation location", visible: "Visibility",
  email: "Email", phone: "Phone", address: "Address", hours: "Hours", timezone: "Time zone", url: "URL",
  supportTitle: "Support heading", supportText: "Support description", footerTagline: "Footer tagline", copyrightName: "Copyright name",
  collection: "Collection", richContent: "Description", text: "Text", type: "Content type", level: "Heading level", items: "List items",
  headers: "Table headings", rows: "Table rows", code: "Code", language: "Language", mediaId: "Media asset", alt: "Alternative text",
  quantity: "Quantity", productId: "Product",
};

const ROW_LABELS: Record<string, string> = {
  categoryIds: "Category", modelNumbers: "Model number", variants: "Variant", specifications: "Specification",
  kitContents: "Kit item", resources: "Resource", mediaIds: "Media asset", links: "Link", blocks: "Content block",
  tags: "Tag", items: "List item", headers: "Table heading", rows: "Table row",
};

const FAQ_PLACEMENTS = [
  { value: "home", label: "Home", note: "Currently displayed on Home." },
  { value: "about", label: "About", note: "Not connected to a public section yet." },
  { value: "contact", label: "Contact", note: "Not connected to a public section yet." },
  { value: "help", label: "Help", note: "Currently displayed on Help." },
  { value: "product", label: "Product details", note: "Not connected to a public section yet." },
  { value: "solutions", label: "Solutions", note: "Not connected to a public section yet." },
] as const;

function validationFieldLabel(field: string): string {
  const parts = field.split(".").filter((part) => part && part !== "document");
  const index = parts.findIndex((part) => /^\d+$/.test(part));
  if (index < 0) return FIELD_LABELS[parts[parts.length - 1]] ?? "Record";

  const collection = parts[index - 1];
  const row = Number(parts[index]) + 1;
  const key = parts[index + 1];
  const rowLabel = ROW_LABELS[collection] ?? "Record";
  if (!key || /^\d+$/.test(key)) return `${rowLabel} ${row}`;
  const label = FIELD_LABELS[key];
  return label ? `${rowLabel} ${row} · ${label}` : `${rowLabel} ${row}`;
}

const META: Record<AdminModule, ModuleMeta> = {
  products: { title: "Products", singular: "product", description: "Manage product descriptions, categories, and specifications.", },
  categories: { title: "Categories", singular: "category", description: "Organize the catalog with clear, searchable category records.", },
  blog: { title: "Blog", singular: "article", description: "Edit sourced editorial content and its publication status.", },
  pages: { title: "Pages", singular: "page", description: "Manage published site pages with structured content blocks.", },
  faqs: { title: "FAQs", singular: "FAQ", description: "Maintain approved answers and their placement on the site.", },
  team: { title: "Team", singular: "team member", description: "Manage team profiles using owner-approved information.", },
  navigation: { title: "Navigation", singular: "navigation set", description: "Edit the visible header and footer links.", },
  contact: { title: "Contact", singular: "contact record", description: "Maintain public contact details, support copy and footer brand text.", },
  solutions: { title: "Solutions", singular: "solution", description: "Manage solution pages and their structured content.", },
  learn: { title: "Learn resources", singular: "resource", description: "Manage learning links and the products they support.", },
  videos: { title: "Videos", singular: "video", description: "Manage approved YouTube videos and related products.", },
};

function freshDocument(module: AdminModule): AdminDocument {
  const common = { title: "", slug: "", summary: "", blocks: [] as ContentBlock[], seoTitle: "", seoDescription: "" };
  switch (module) {
    case "products": return { ...common, categoryIds: [], modelNumbers: [], variants: [], specifications: [], compatibility: [], kitContents: [], resources: [], mediaIds: [], tags: [] };
    case "categories": return { ...common, parentId: null, position: 0, mediaIds: [] };
    case "blog": return { ...common, author: "", tags: [], mediaIds: [] };
    case "pages": case "solutions": return common;
    case "faqs": return { ...common, answer: "", topic: "", placements: [], position: 0 };
    case "team": return { ...common, name: "", role: "", bio: "", mediaIds: [], links: [], position: 0 };
    case "navigation": return { ...common, links: [] };
    case "contact": return { ...common, email: "", phone: "", address: "", hours: "", timezone: "", socialLinks: [] };
    case "learn": return { ...common, url: "", productIds: [], position: 0, collection: "embedded-systems" };
    case "videos": return { ...common, url: "", productIds: [], position: 0 };
  }
}

function readJson<T>(value: unknown, fallback: T): T {
  return value === null || value === undefined ? fallback : value as T;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as T | ApiError | null;
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
    const message = error?.message || (response.status === 409 ? "This record changed. Reload the latest version before saving." : "The request could not be completed. Try again.");
    throw Object.assign(new Error(message), { status: response.status, fields: error?.fields });
  }
  return body as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : value;
}

export function RecordListScreen({ module }: { module: AdminModule }) {
  const meta = META[module];
  const capability = ADMIN_MODULES[module].editCapability;
  const capabilities = useAdminCapabilities();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RecordListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 20;

  const load = useCallback(async (nextOffset = 0, search = submittedQuery) => {
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) });
      if (search.trim()) params.set("q", search.trim());
      const result = await api<{ items: RecordListItem[]; total: number }>(`/api/admin/${module}?${params}`);
      setItems(result.items);
      setTotal(result.total);
      setOffset(nextOffset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Records could not be loaded.");
      setItems([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [module, submittedQuery]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: String(pageSize), offset: "0" });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    void api<{ items: RecordListItem[]; total: number }>(`/api/admin/${module}?${params}`)
      .then((result) => { if (active) { setItems(result.items); setTotal(result.total); setOffset(0); } })
      .catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : "Records could not be loaded."); setItems([]); setTotal(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [module, submittedQuery, reloadKey]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOffset(0);
    setSubmittedQuery(query.trim());
    setReloadKey((value) => value + 1);
  }

  if (!capabilities.includes(capability)) return <AdminAccessDeniedScreen title={meta.title} />;

  return (
    <div className={styles.screen}>
      <div className={styles.pageHeading}>
        <div>
          <h1>{meta.title}</h1>
          <p className={styles.lede}>{meta.description}</p>
        </div>
        {capabilities.includes(capability) && <Link className={styles.primaryButton} href={`/admin/${module}/new`}><Plus aria-hidden="true" size={17} /> New {meta.singular}</Link>}
      </div>

      <form className={styles.toolbar} onSubmit={search} role="search">
        <label className={styles.searchBox}>
          <Search aria-hidden="true" size={17} />
          <span className={styles.visuallyHidden}>Search {meta.title.toLowerCase()}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or slug" />
        </label>
        <button className={styles.secondaryButton} type="submit">Search</button>
        <span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading records…" : total === null ? "" : `${total} ${total === 1 ? "record" : "records"}`}</span>
      </form>

      {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} onClick={() => { setLoading(true); setError(""); void load(offset); }} type="button"><RefreshCw size={15} aria-hidden="true" /> Try again</button></div>}
      <div className={styles.tableFrame} role="region" aria-label={`${meta.title} records`} tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Title</th><th scope="col">Slug</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className={styles.visuallyHidden}>Open</span></th></tr></thead>
          <tbody>
            {loading && <tr><td className={styles.tableMessage} colSpan={5}>Loading records…</td></tr>}
            {!loading && !error && items.length === 0 && <tr><td className={styles.tableMessage} colSpan={5}>{submittedQuery ? "No records match this search." : `No ${meta.title.toLowerCase()} yet. Create the first record when approved content is ready.`}</td></tr>}
            {!loading && items.map((item) => {
              const status = item.archived ? "Archived" : item.publishedRevisionId ? "Published" : "Draft";
              return <tr key={item.id}>
                <td><Link className={styles.recordTitle} href={`/admin/${module}/${item.id}`}>{item.title || `Untitled ${meta.singular}`}</Link></td>
                <td><code className={styles.slug}>{item.slug}</code></td>
                <td><span className={`${styles.statusPill} ${status === "Published" ? styles.statusPublished : status === "Archived" ? styles.statusArchived : ""}`}>{status}</span></td>
                <td className={styles.dateCell}>{formatDate(item.updatedAt)}</td>
                <td><Link className={styles.iconLink} aria-label={`Edit ${item.title || meta.singular}`} href={`/admin/${module}/${item.id}`}><ArrowRight aria-hidden="true" size={17} /></Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <nav className={styles.pagination} aria-label={`${meta.title} pages`}>
        <span>{total === null ? "" : total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span>
        <div>
          <button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(Math.max(0, offset - pageSize)); }} disabled={loading || offset === 0}><ArrowLeft aria-hidden="true" size={16} /> Previous</button>
          <button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(offset + pageSize); }} disabled={loading || total === null || offset + pageSize >= total}>Next <ArrowRight aria-hidden="true" size={16} /></button>
        </div>
      </nav>
    </div>
  );
}

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`${styles.field} ${className}`}><span className={styles.fieldLabel}>{label}</span>{children}{hint && <span className={styles.fieldHint}>{hint}</span>}</label>;
}

function TextInput({ value, onChange, placeholder, type = "text", maxLength }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string; maxLength?: number }) {
  return <input className={styles.input} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} />;
}

function TextArea({ value, onChange, rows = 4, placeholder, maxLength }: { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number }) {
  return <textarea className={styles.textarea} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} maxLength={maxLength} />;
}

function TokenInput({ label, values, onChange, hint, maxItems = Number.POSITIVE_INFINITY, maxLength = Number.POSITIVE_INFINITY }: { label: string; values: string[]; onChange: (next: string[]) => void; hint?: string; maxItems?: number; maxLength?: number }) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  function add(raw: string) {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    const overlong = parts.find((part) => Array.from(part).length > maxLength);
    const unique = [...new Set([...values, ...parts.filter((part) => Array.from(part).length <= maxLength)])];
    const overflow = unique.length > maxItems;
    setError(overlong ? `Use at most ${maxLength} characters per tag.` : overflow ? `Use at most ${maxItems} entries.` : "");
    if (parts.length && !overlong && !overflow) onChange(unique);
    setEntry("");
  }
  return <div className={styles.field}><span className={styles.fieldLabel}>{label}</span><div className={styles.tokenField}>
    {values.map((value, index) => <span className={styles.token} key={`${value}-${index}`}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((_, current) => current !== index))}><X aria-hidden="true" size={14} /></button></span>)}
    <input aria-label={`Add ${label}`} value={entry} onChange={(event) => setEntry(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(entry); } }} onBlur={() => { if (entry.trim()) add(entry); }} placeholder="Type and press Enter" disabled={values.length >= maxItems} maxLength={Number.isFinite(maxLength) ? maxLength : undefined} />
  </div>{hint && <span className={styles.fieldHint}>{hint}</span>}{error && <span className={styles.inlineError} role="alert">{error}</span>}</div>;
}

function RelationPicker({ label, module, values, onChange, reorderable = false, maxSelections = 100, canManageMedia = false, uploadOnly = false, onUploadDelta }: { label: string; module: "categories" | "products" | "media"; values: string[]; onChange: (next: string[]) => void; reorderable?: boolean; maxSelections?: number; canManageMedia?: boolean; uploadOnly?: boolean; onUploadDelta?: (change: 1 | -1) => void }) {
  const [loaded, setLoaded] = useState<{ module: string; options: Option[] }>({ module, options: [] });
  const options = loaded.module === module ? loaded.options : [];
  const [page, setPage] = useState({ module, offset: 0 });
  const offset = page.module === module ? page.offset : 0;
  const limit = module === "media" ? 50 : 100;
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [uploadedOptions, setUploadedOptions] = useState<Option[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputId = useId();
  const loadingOptions = !uploadOnly && (loading || loaded.module !== module);
  const availableOptions = [...options, ...uploadedOptions.filter((item) => !options.some((option) => option.id === item.id))];
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => {
    if (uploadOnly) return;
    let alive = true;
    async function load() {
      try {
        const result = await api<{ items: (RecordListItem & { filename?: string; published?: boolean; mimeType?: string })[]; total: number }>(`/api/admin/${module}?limit=${limit}&offset=${offset}`);
        if (alive) {
          const incoming = result.items.filter((item) => !item.archived && (module !== "media" || (item.published === true && item.mimeType === "image/webp"))).map((item) => ({ id: item.id, label: module === "media" ? item.filename || item.title : item.title }));
          setLoaded(previous => ({ module, options: [...new Map([...(offset > 0 && previous.module === module ? previous.options : []), ...incoming].map(item => [item.id, item])).values()] }));
          setHasMore(offset + result.items.length < result.total); setLoadError("");
        }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Options could not be loaded.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [module, offset, limit, retry, uploadOnly]);
  const status = uploadOnly ? "" : loadingOptions ? `Loading ${module === "media" ? "media assets" : module}…` : loadError || (!options.length ? "No selectable records are available yet." : "");
  async function uploadGalleryImage() {
    if (!uploadFile || !uploadAltText.trim() || !canManageMedia || valuesRef.current.length >= maxSelections || module !== "media") return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(uploadFile.type)) {
      setUploadError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (uploadFile.size < 1 || uploadFile.size > 4 * 1024 * 1024) {
      setUploadError("Choose an image that is 4 MB or smaller.");
      return;
    }
    setUploadError("");
    setUploading(true);
    onUploadDelta?.(1);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("altText", uploadAltText.trim());
      form.append("source", "");
      const response = await fetch("/api/admin/media", { method: "POST", cache: "no-store", body: form });
      const body = await response.json().catch(() => null) as { media?: { id?: string; filename?: string; mimeType?: string }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message || "The gallery image could not be uploaded. Try again.");
      const media = body?.media;
      if (!media || typeof media.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(media.id) || media.mimeType !== "image/webp") {
        throw new Error("The gallery image upload response was incomplete. Refresh the page before retrying.");
      }
      const latestValues = valuesRef.current;
      if (latestValues.length >= maxSelections) throw new Error("The gallery is full. Remove an image before adding another.");
      setUploadedOptions((current) => [...current.filter((item) => item.id !== media.id), { id: media.id!, label: media.filename || uploadFile.name }]);
      onChange([...latestValues, media.id]);
      setUploadFile(null);
      setUploadAltText("");
      toast.success("Gallery image uploaded.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The gallery image could not be uploaded.";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      onUploadDelta?.(-1);
    }
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }} aria-busy={loadingOptions}>
    <legend className={styles.fieldLabel}>{label}</legend>
    {status && <p className={styles.fieldHint} role="status" aria-live="polite">{status}</p>}
    {reorderable && values.length > 0 && <div className={styles.checkList} role="list" aria-label="Selected product images in display order">{values.map((id, index) => {
      const label = availableOptions.find((option) => option.id === id)?.label || `Attached image ${index + 1}`;
      return <div className={`${styles.relationRow} ${galleryStyles.selectedImage}`} role="listitem" key={`${id}-${index}`}><Image src={`/api/media/${encodeURIComponent(id)}`} alt="" width={88} height={64} unoptimized /><span>{label}</span><button className={styles.secondaryButton} type="button" aria-label={`Move ${label} earlier`} onClick={() => move(index, -1)} disabled={uploading || index === 0}>Up</button><button className={styles.secondaryButton} type="button" aria-label={`Move ${label} later`} onClick={() => move(index, 1)} disabled={uploading || index === values.length - 1}>Down</button><button className={styles.secondaryButton} type="button" aria-label={`Remove ${label}`} onClick={() => onChange(values.filter((_, current) => current !== index))} disabled={uploading}>Remove</button></div>;
    })}</div>}
    {!uploadOnly && options.length > 0 && <div className={styles.checkList}>{options.map((option) => <label key={option.id}><input type="checkbox" checked={values.includes(option.id)} disabled={uploading || (!values.includes(option.id) && values.length >= maxSelections)} onChange={(event) => onChange(event.target.checked ? [...new Set([...values, option.id])] : values.filter((id) => id !== option.id))} /><span>{option.label || (module === "media" ? "Unnamed media asset" : `Untitled ${module === "products" ? "product" : "category"}`)}</span></label>)}</div>}
    {module === "media" && maxSelections === 5 && <div className={galleryStyles.uploadPanel}>
      <div><label className={styles.field} htmlFor={uploadInputId}><span className={styles.fieldLabel}>Add a gallery image</span><input accept="image/png,image/jpeg,image/webp" className={styles.input} disabled={!canManageMedia || uploading || values.length >= maxSelections} id={uploadInputId} onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} type="file" /></label></div>
      <label className={styles.field}><span className={styles.fieldLabel}>Image alternative text</span><input className={styles.input} disabled={!canManageMedia || uploading || values.length >= maxSelections} maxLength={300} onChange={(event) => setUploadAltText(event.target.value)} value={uploadAltText} /></label>
      <button className={styles.secondaryButton} disabled={!canManageMedia || uploading || !uploadFile || !uploadAltText.trim() || values.length >= maxSelections} onClick={() => void uploadGalleryImage()} type="button">{uploading ? "Uploading image…" : `Upload image (${values.length}/${maxSelections})`}</button>
      <p className={styles.fieldHint}>{canManageMedia ? "Uploads create private draft media. Publish the image separately before publishing this product." : "Gallery image uploads require the Media manager permission."}</p>
      {uploadError && <p className={styles.inlineError} role="alert">{uploadError}</p>}
    </div>}
    {((loaded.module === module && hasMore) || loadingOptions || loadError) && <button className={styles.secondaryButton} type="button" disabled={loadingOptions} onClick={() => { setLoading(true); if (loadError) setRetry(n => n + 1); else setPage({ module, offset: offset + limit }); }}>{loadingOptions ? "Loading options…" : loadError ? "Retry loading options" : `Load more ${module === "media" ? "media assets" : module}`}</button>}
  </fieldset>;
}

function MediaPicker({ value, onChange, label = "Media asset" }: { value: string; onChange: (next: string) => void; label?: string }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("Loading media…");
  useEffect(() => {
    let alive = true;
    void api<{ items: { id: string; filename: string; mimeType: string; archived: boolean; published: boolean }[]; total: number }>(`/api/admin/media?limit=50&offset=${offset}`)
      .then((result) => { if (alive) { const available = result.items.filter((item) => item.published && !item.archived && item.mimeType === "image/webp").map(item => ({ id: item.id, label: item.filename || "Unnamed media asset" })); setOptions(previous => [...new Map([...(offset > 0 ? previous : []), ...available].map(item => [item.id, item])).values()]); setHasMore(offset + result.items.length < result.total); setLoadFailed(false); setMessage(available.length ? "Published WebP image assets loaded." : "No published WebP images found on this page."); } })
      .catch((error) => { if (alive) { setLoadFailed(true); setMessage(error instanceof Error ? error.message : "Media could not be loaded."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [offset, retry]);
  return <div className={styles.field} aria-busy={loading}><label><span className={styles.fieldLabel}>{label}</span><select className={styles.input} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select an asset</option>{value && !options.some(option => option.id === value) && <option value={value}>Current assigned asset</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>{message && <span className={styles.fieldHint} role="status" aria-live="polite">{loading ? "Loading media assets…" : message}</span>}{(hasMore || loadFailed) && <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => { setLoading(true); if (loadFailed) setRetry(n => n + 1); else setOffset(offset + 50); }}>{loading ? "Loading assets…" : loadFailed ? "Retry loading assets" : "Load more media assets"}</button>}</div>;
}

type ProductModelAssetOption = { id: string; filename: string; altText: string; mimeType: string; published: boolean; archived: boolean; publicUseAllowed: boolean | null };

function ProductModelPicker({ value, onChange, title }: { value?: ProductModel3d; onChange: (next?: ProductModel3d) => void; title: string }) {
  const [items, setItems] = useState<ProductModelAssetOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [modelId, setModelId] = useState(value?.mediaId ?? "");
  const [posterId, setPosterId] = useState(value?.posterId ?? "");
  const [alt, setAlt] = useState(value?.alt ?? "");
  useEffect(() => {
    let alive = true;
    void api<{ items: ProductModelAssetOption[]; total: number }>(`/api/admin/media?limit=50&offset=${offset}`)
      .then((result) => {
        if (!alive) return;
        const available = result.items.filter((item) => !item.archived);
        setItems((previous) => [...new Map([...(offset ? previous : []), ...available].map((item) => [item.id, item])).values()]);
        setTotal(result.total);
        setError("");
      })
      .catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : "Media assets could not be loaded."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [offset, retry]);

  const models = items.filter((item) => item.mimeType === "model/gltf-binary");
  const posters = items.filter((item) => item.mimeType === "image/webp");
  const selectedModel = models.find((item) => item.id === modelId);
  const selectedPoster = posters.find((item) => item.id === posterId);
  function commit(nextModelId: string, nextPosterId: string, nextAlt: string) {
    setModelId(nextModelId);
    setPosterId(nextPosterId);
    setAlt(nextAlt);
    onChange(nextModelId && nextPosterId ? { mediaId: nextModelId, posterId: nextPosterId, alt: nextAlt } : undefined);
  }
  function remove() {
    setModelId(""); setPosterId(""); setAlt(""); onChange(undefined);
  }

  return <section className={styles.panel} aria-label="Product 3D model">
    <div className={styles.sectionHeading}><div><h2>3D model</h2><p>Choose a GLB and a WebP poster. Private media can be selected for draft preview; publication checks media rights and status.</p></div></div>
    <div className={styles.formGrid}>
      <label className={styles.field}><span className={styles.fieldLabel}>GLB model</span><select className={styles.input} value={modelId} onChange={(event) => commit(event.target.value, posterId, alt || "3D product model")}><option value="">Select a model</option>{modelId && !selectedModel && <option value={modelId}>Current selected model</option>}{models.map((item) => <option key={item.id} value={item.id}>{item.altText || item.filename || "3D model"} · {item.publicUseAllowed ? "redistribution confirmed" : "private unless permission confirmed"} · {item.published ? "published" : "draft"}</option>)}</select></label>
      <label className={styles.field}><span className={styles.fieldLabel}>WebP poster</span><select className={styles.input} value={posterId} onChange={(event) => commit(modelId, event.target.value, alt || "3D product model")}><option value="">Select a poster</option>{posterId && !selectedPoster && <option value={posterId}>Current selected poster</option>}{posters.map((item) => <option key={item.id} value={item.id}>{item.altText || item.filename || "WebP image"} · {item.published ? "published" : "draft"}</option>)}</select></label>
      <Field label="3D alternative text" className={styles.spanTwo}><TextInput value={alt} onChange={(next) => commit(modelId, posterId, next)} maxLength={300} placeholder="Describe the model and its visible subject" /></Field>
    </div>
    {loading && <p className={styles.fieldHint} role="status">Loading model and poster choices…</p>}
    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setRetry((current) => current + 1); }}>Retry</button></div>}
    {total !== null && offset + 50 < total && <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => { setLoading(true); setOffset((current) => current + 50); }}>Load more media assets</button>}
    {value && <div className={`${styles.spanTwo} ${styles.modelPreview}`}><ProductModelViewer model={value} title={title} /></div>}
    {value && <button className={styles.secondaryButton} type="button" onClick={remove}>Remove 3D model</button>}
  </section>;
}

function ParentCategoryPicker({ value, currentId, onChange }: { value: string | null; currentId?: string; onChange: (next: string | null) => void }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [message, setMessage] = useState("Loading categories…");
  useEffect(() => {
    let alive = true;
    void api<{ items: RecordListItem[] }>("/api/admin/categories?limit=100&offset=0")
      .then((result) => { if (alive) { const available = result.items.filter((item) => !item.archived && item.id !== currentId); setOptions(available.map((item) => ({ id: item.id, label: item.title || "Untitled category" }))); setMessage(available.length ? "" : "No other categories are available."); } })
      .catch((error) => { if (alive) setMessage(error instanceof Error ? error.message : "Categories could not be loaded."); });
    return () => { alive = false; };
  }, [currentId]);
  return <label className={styles.field}><span className={styles.fieldLabel}>Parent category (optional)</span><select className={styles.input} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}><option value="">No parent</option>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select><span className={styles.fieldHint}>Group this category under a broader category, or leave it as a top-level category.</span>{message && <span className={styles.fieldHint}>{message}</span>}</label>;
}

function RowEditor({ label, rows, columns, onChange, addLabel, onFieldChange }: { label: string; rows: Record<string, unknown>[]; columns: { key: string; label: string; type?: "text" | "number" | "checkbox" | "select"; placeholder?: string; options?: { value: string; label: string }[]; immutableWhenExisting?: boolean }[]; onChange: (next: Record<string, unknown>[]) => void; addLabel: string; onFieldChange?: (key: string, previous: unknown, next: unknown) => void }) {
  function update(index: number, key: string, value: unknown) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }
  return <section className={styles.rowEditor} aria-label={label}>
    <div className={styles.rowEditorHeading}><h3>{label}</h3><button className={styles.secondaryButton} type="button" onClick={() => onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, column.type === "checkbox" ? true : column.type === "number" ? 1 : ""]))])}><Plus size={15} aria-hidden="true" /> {addLabel}</button></div>
    {rows.length === 0 && <p className={styles.fieldHint}>No entries added.</p>}
    {rows.map((row, index) => <div className={styles.relationRow} key={index}>
       {columns.map((column) => {
         const locked = Boolean(column.immutableWhenExisting && typeof row.id === "string");
          const accessibleName = `${label} row ${index + 1}: ${column.label}`;
          const fieldChange = (next: unknown) => { update(index, column.key, next); onFieldChange?.(column.key, row[column.key], next); };
          return <label className={column.type === "checkbox" ? styles.inlineCheck : styles.rowField} key={column.key}><span>{column.label}</span>{column.type === "checkbox" ? <input type="checkbox" aria-label={accessibleName} checked={Boolean(row[column.key])} onChange={(event) => fieldChange(event.target.checked)} /> : column.type === "select" ? <select className={styles.input} aria-label={accessibleName} value={String(row[column.key] ?? "header")} onChange={(event) => fieldChange(event.target.value)}>{column.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={column.type === "number" ? "number" : "text"} aria-label={accessibleName} value={String(row[column.key] ?? "")} placeholder={column.placeholder} disabled={locked} onChange={(event) => fieldChange(column.type === "number" ? Number(event.target.value) : event.target.value)} />}{locked && <span className={styles.fieldHint}>Existing SKU is locked. Add another variant to correct it.</span>}</label>;
       })}
      <button className={styles.iconButton} type="button" aria-label={`Remove ${label} row ${index + 1}`} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} aria-hidden="true" /></button>
    </div>)}
  </section>;
}

function BlockEditor({ blocks, onChange, reorderable = false, contentLabel = "Page content" }: { blocks: ContentBlock[]; onChange: (next: ContentBlock[]) => void; reorderable?: boolean; contentLabel?: "Page content" | "Article content" | "Formatted answer" }) {
  function update(index: number, patch: Record<string, unknown>) {
    onChange(blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } as ContentBlock : block));
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function add(type: ContentBlock["type"]) {
    const values: Record<ContentBlock["type"], ContentBlock> = {
      heading: { type: "heading", level: 2, text: "" }, paragraph: { type: "paragraph", text: "" },
      bulletList: { type: "bulletList", items: [""] }, orderedList: { type: "orderedList", items: [""] },
      link: { type: "link", label: "", url: "" }, image: { type: "image", mediaId: "", alt: "" },
      code: { type: "code", language: "text", code: "" }, table: { type: "table", headers: [""], rows: [[""]] },
    };
    onChange([...blocks, values[type]]);
  }
  return <section className={styles.blocks}>
    <div className={styles.sectionHeading}><div><h2>{contentLabel}</h2><p>Add blocks in the order they should appear.</p></div></div>
    {blocks.length === 0 && <p className={styles.emptyBlocks}>No content blocks yet. Add a block to build the {contentLabel === "Article content" ? "article" : contentLabel === "Formatted answer" ? "formatted answer" : "page"}.</p>}
    {blocks.map((block, index) => <fieldset className={`${styles.blockCard} ${reorderable ? styles.reorderableBlocks : ""}`} key={`${block.type}-${index}`}>
      <legend><span>Block {index + 1}: {block.type === "bulletList" || block.type === "orderedList" ? block.type === "bulletList" ? "Bullet list" : "Numbered list" : block.type[0].toUpperCase() + block.type.slice(1)}</span>{reorderable ? <span className={styles.blockActions}>
          <button className={styles.secondaryButton} type="button" aria-label={`Move block ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0}>Move up</button>
          <button className={styles.secondaryButton} type="button" aria-label={`Move block ${index + 1} down`} onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>Move down</button>
          <button className={styles.iconButton} type="button" aria-label={`Remove block ${index + 1}`} onClick={() => onChange(blocks.filter((_, current) => current !== index))}><Trash2 aria-hidden="true" size={15} /></button>
        </span> : <button className={styles.iconButton} type="button" aria-label={`Remove block ${index + 1}`} onClick={() => onChange(blocks.filter((_, current) => current !== index))}><Trash2 aria-hidden="true" size={15} /></button>}</legend>
      {block.type === "paragraph" && <Field label={`Paragraph text, block ${index + 1}`}><TextArea value={block.text} onChange={(text) => update(index, { text })} rows={4} placeholder="Write a paragraph" /></Field>}
      {block.type === "heading" && <div className={styles.headingFields}><label className={styles.field}><span className={styles.fieldLabel}>Heading level, block {index + 1}</span><select className={styles.input} value={block.level} onChange={(event) => update(index, { level: Number(event.target.value) })}><option value={1}>Heading 1</option><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select></label><Field label={`Heading text, block ${index + 1}`}><TextInput value={block.text} onChange={(text) => update(index, { text })} /></Field></div>}
      {(block.type === "bulletList" || block.type === "orderedList") && <Field label={`List items, block ${index + 1}`} hint="One item per line."><TextArea value={block.items.join("\n")} onChange={(text) => update(index, { items: text.split("\n") })} rows={Math.max(3, Math.min(8, block.items.length + 1))} /></Field>}
      {block.type === "link" && <div className={styles.headingFields}><Field label={`Link text, block ${index + 1}`}><TextInput value={block.label} onChange={(label) => update(index, { label })} /></Field><Field label={`URL, block ${index + 1}`} hint="Use a site path or HTTPS URL."><TextInput value={block.url} onChange={(url) => update(index, { url })} placeholder="/learn or https://…" /></Field></div>}
      {block.type === "image" && <div className={styles.headingFields}><MediaPicker label={`Image media asset, block ${index + 1}`} value={block.mediaId} onChange={(mediaId) => update(index, { mediaId })} /><Field label={`Alternative text, block ${index + 1}`}><TextInput value={block.alt} onChange={(alt) => update(index, { alt })} /></Field></div>}
      {block.type === "code" && <div className={styles.stackFields}><Field label={`Language, block ${index + 1}`}><TextInput value={block.language} onChange={(language) => update(index, { language })} placeholder="text" /></Field><Field label={`Code, block ${index + 1}`}><TextArea value={block.code} onChange={(code) => update(index, { code })} rows={5} /></Field></div>}
      {block.type === "table" && <div className={styles.stackFields}><Field label={`Column headings, table block ${index + 1}`} hint="One heading per line."><TextArea value={block.headers.join("\n")} onChange={(text) => update(index, { headers: text.split("\n") })} rows={Math.max(2, block.headers.length)} /></Field><Field label={`Rows and cells, table block ${index + 1}`} hint="One row per line. Separate cells with the | character."><TextArea value={block.rows.map((row) => row.join(" | ")).join("\n")} onChange={(text) => update(index, { rows: text.split("\n").map((row) => row.split("|").map((cell) => cell.trim())) })} rows={Math.max(3, block.rows.length)} /></Field></div>}
    </fieldset>)}
    <details className={styles.addBlock}>
      <summary><Plus aria-hidden="true" size={16} /> Add content block <ChevronDown aria-hidden="true" size={15} /></summary>
      <div className={styles.blockChoices}>{(["heading", "paragraph", "bulletList", "orderedList", "link", "image", "code", "table"] as const).map((type) => <button key={type} className={styles.secondaryButton} type="button" onClick={() => add(type)}>{type === "bulletList" ? "Bullet list" : type === "orderedList" ? "Numbered list" : type[0].toUpperCase() + type.slice(1)}</button>)}</div>
    </details>
  </section>;
}

function DraftPreview({ document, module }: { document: AdminDocument; module: AdminModule }) {
  const product = "modelNumbers" in document ? document : null;
  const richContent = "richContent" in document ? document.richContent : undefined;
  const previewDocument = richContent ? { ...document, blocks: [] } as AdminDocument : document;
  return <section className={styles.previewPanel} aria-label="Private draft preview" aria-describedby="draft-preview-privacy">
    <h2>{document.title || "Untitled draft"}</h2>
    {module === "pages" && <p className={styles.fieldHint}>This preview shows this page record only. The live Home, About, Help, and Policies routes also combine route-specific layouts or separately managed content such as team profiles, FAQs, and individual policy pages.</p>}
    <PublishedDocument document={previewDocument} hideTitle />
    {richContent && <section aria-label={`${module === "categories" ? "Category" : "Product"} description preview`}><h3>{module === "categories" ? "About this category" : "About this product"}</h3><ProductRichContentView content={richContent} /></section>}
    {product?.documentMediaId && <section aria-label="Product Word document preview"><h3>Word document</h3><ProductDocumentPreview mediaId={product.documentMediaId} /></section>}
    <p id="draft-preview-privacy" className={styles.previewPrivacy}>Only staff with access can view this draft preview.</p>
  </section>;
}

function DocumentFields({ module, document, setDocument, recordId, slugAuto, setSlugAuto, onPricingChange, pricingRefreshKey, canManageMedia, onRichContentValidityChange, richContentResetKey, onUploadDelta }: {
  module: AdminModule;
  document: AdminDocument;
  setDocument: Dispatch<SetStateAction<AdminDocument>>;
  recordId?: string;
  slugAuto: boolean;
  setSlugAuto: (value: boolean) => void;
  onPricingChange: (next: ProductPricingState) => void;
  pricingRefreshKey: number;
  canManageMedia: boolean;
  onRichContentValidityChange: (valid: boolean) => void;
  richContentResetKey: number;
  onUploadDelta: (change: 1 | -1) => void;
}) {
  const doc = document as unknown as Record<string, unknown>;
  const [skuEditKeys, setSkuEditKeys] = useState<Record<string, string>>({});
  const set = (key: string, value: unknown) => setDocument((current) => ({ ...current, [key]: value } as AdminDocument));
  const str = (key: string) => String(doc[key] ?? "");
  const num = (key: string) => Number(doc[key] ?? 0);
  const arr = (key: string) => readJson<string[]>(doc[key], []);
  const rows = (key: string) => readJson<Record<string, unknown>[]>(doc[key], []);
  const faqPlacements = arr("placements");
  const unlistedFaqPlacements = faqPlacements.filter((value) => !FAQ_PLACEMENTS.some((placement) => placement.value === value));
  const faqHasFormattedBlocks = module === "faqs" && readJson<ContentBlock[]>(doc.blocks, []).length > 0;
  const faqHasPlainAnswer = module === "faqs" && str("answer").trim().length > 0;
  function toggleFaqPlacement(placement: string, selected: boolean) {
    setDocument((current) => {
      const currentDocument = current as unknown as Record<string, unknown>;
      const currentPlacements = readJson<string[]>(currentDocument.placements, []);
      const placements = selected
        ? currentPlacements.includes(placement) ? currentPlacements : [...currentPlacements, placement]
        : currentPlacements.filter((value) => value !== placement);
      return { ...current, placements } as AdminDocument;
    });
  }
  return <>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>Record details</h2><p>Use confirmed, owner-approved content.</p></div></div>
      <div className={styles.formGrid}>
        <Field label="Title"><TextInput value={str("title")} onChange={(value) => { if ((module === "products" || module === "categories") && slugAuto) setDocument({ ...document, title: value, slug: productSlugFromTitle(value) }); else set("title", value); }} maxLength={160} /></Field>
        <Field label="Slug" hint={module === "products" || module === "categories" ? slugAuto ? "Generated from the title until you edit it." : "Manual slug override." : "Lowercase letters, numbers, and hyphens."}><TextInput value={str("slug")} onChange={(value) => { set("slug", value); if (module === "products" || module === "categories") setSlugAuto(false); }} maxLength={160} /></Field>
        {module !== "products" && <Field label="Summary" className={styles.spanTwo}><TextArea value={str("summary")} onChange={(value) => set("summary", value)} rows={3} /></Field>}
        {module === "pages" && <p className={`${styles.fieldHint} ${styles.spanTwo}`}>Proposed route: <code>{str("slug") === "home" ? "/" : str("slug") ? `/${str("slug")}` : "/your-page-slug"}</code>. Saving keeps the current live page unchanged. Existing application routes can take precedence over a published page.</p>}
      </div>
      {(module === "products" || module === "categories") && !slugAuto && <button className={styles.secondaryButton} onClick={() => { setSlugAuto(true); set("slug", productSlugFromTitle(str("title"))); }} type="button">Generate slug from title</button>}
    </section>

    {module === "products" && <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>Variants</h2><p>Prices below apply to these product variants. Existing SKUs stay fixed.</p></div></div>
      <RowEditor label="Variants" addLabel="Add variant" rows={rows("variants")} columns={[{ key: "sku", label: "SKU", immutableWhenExisting: true }, { key: "label", label: "Variant label" }]} onChange={(value) => set("variants", value)} onFieldChange={(key, previous, next) => {
        if (key === "sku" && typeof previous === "string" && previous && typeof next === "string" && next && previous !== next) {
          setSkuEditKeys((current) => ({ ...current, [next]: current[previous] ?? previous }));
        }
      }} />
    </section>}

    {module === "products" && <ProductPricingEditor
      productId={recordId ?? "new"}
      variants={rows("variants") as { id?: string; sku: string; label: string }[]}
      skuEditKeys={skuEditKeys}
      sourceObservation={doc.sourceObservation !== undefined}
      refreshKey={pricingRefreshKey}
      request={api}
      onChange={onPricingChange}
    />}

    {module === "products" && <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>Summary</h2><p>A concise product introduction.</p></div></div>
      <Field label="Summary" className={styles.spanTwo}><TextArea value={str("summary")} onChange={(value) => set("summary", value)} rows={3} /></Field>
    </section>}
    {module === "products" && <ProductDocumentEditor value={typeof doc.documentMediaId === "string" ? doc.documentMediaId : undefined} onChange={(value) => set("documentMediaId", value)} canManageMedia={canManageMedia} onUploadDelta={onUploadDelta} />}
    {module === "products" && <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>Tags</h2><p>Optional labels that describe or group this product.</p></div></div>
      <TokenInput label="Product tags" values={arr("tags")} onChange={(value) => set("tags", value)} maxItems={30} maxLength={60} hint="Up to 30 tags, 60 characters each." />
    </section>}

    {(module === "products" || module === "categories") && <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>{module === "categories" ? "Category organization" : "Catalog details"}</h2><p>{module === "categories" ? "Choose a parent and display order. Lower positions appear first." : "Add categories, specifications, compatibility and resources. Inventory is managed separately."}</p></div></div>
      <div className={styles.formGrid}>
        {module === "products" && <RelationPicker label="Categories" module="categories" values={arr("categoryIds")} onChange={(value) => set("categoryIds", value)} />}
        {module === "categories" && <>
          <ParentCategoryPicker value={doc.parentId === null ? null : str("parentId")} currentId={recordId} onChange={(value) => set("parentId", value)} />
          <Field label="Position"><TextInput type="number" value={String(num("position"))} onChange={(value) => set("position", Number(value))} /></Field>
        </>}
        {module === "products" && <>
          <section className={styles.panel} aria-label="Source observation">
            <label className={styles.inlineCheck}><input type="checkbox" checked={doc.sourceObservation !== undefined} onChange={(event) => {
              if (event.target.checked) set("sourceObservation", { priceText: "", capturedAt: "", sourceUrl: "" });
              else {
                const next = { ...doc };
                delete next.sourceObservation;
                delete next.sourceReview;
                setDocument(next as AdminDocument);
              }
            }} /><span>Publish as a non-purchasable source observation</span></label>
            {doc.sourceObservation !== undefined && <div className={styles.formGrid}>
              <p className={styles.fieldHint}>This records dated source wording, not an active price or availability claim.</p>
              <Field label="Exact source price text"><TextInput value={String((doc.sourceObservation as Record<string, unknown>)?.priceText ?? "")} maxLength={160} onChange={(priceText) => set("sourceObservation", { ...(doc.sourceObservation as Record<string, unknown>), priceText })} /></Field>
              <Field label="Archive capture time (ISO date and time)"><TextInput value={String((doc.sourceObservation as Record<string, unknown>)?.capturedAt ?? "")} maxLength={35} placeholder="2026-10-25T14:26:46.928Z" onChange={(capturedAt) => set("sourceObservation", { ...(doc.sourceObservation as Record<string, unknown>), capturedAt })} /></Field>
              <Field label="Source URL"><TextInput type="url" value={String((doc.sourceObservation as Record<string, unknown>)?.sourceUrl ?? "")} maxLength={2048} placeholder="https://…" onChange={(sourceUrl) => set("sourceObservation", { ...(doc.sourceObservation as Record<string, unknown>), sourceUrl })} /></Field>
              <Field label="Staff-only source review notes" hint="One note per line. Up to 64 notes, 2,000 characters each." className={styles.spanTwo}>
                <TextArea value={arr("sourceReview").join("\n")} onChange={(value) => set("sourceReview", value.split("\n").filter((note) => note.trim()))} rows={5} maxLength={128_063} />
              </Field>
            </div>}
          </section>
          <RowEditor label="Specifications" addLabel="Add specification" rows={rows("specifications")} columns={[{ key: "name", label: "Name" }, { key: "value", label: "Value" }]} onChange={(value) => set("specifications", value)} />
          <TokenInput label="Model numbers" values={arr("modelNumbers")} onChange={(value) => set("modelNumbers", value)} />
          <TokenInput label="Compatibility" values={arr("compatibility")} onChange={(value) => set("compatibility", value)} />
          <RowEditor label="Kit contents" addLabel="Add item" rows={rows("kitContents")} columns={[{ key: "title", label: "Item title" }, { key: "quantity", label: "Quantity", type: "number" }]} onChange={(value) => set("kitContents", value)} />
          <RowEditor label="Resources" addLabel="Add link" rows={rows("resources")} columns={[{ key: "label", label: "Link title" }, { key: "url", label: "URL" }]} onChange={(value) => set("resources", value)} />
        </>}
      </div>
    </section>}

    {module === "blog" && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Article details</h2></div></div><div className={styles.formGrid}><Field label="Author"><TextInput value={str("author")} onChange={(value) => set("author", value)} maxLength={160} /></Field><TokenInput label="Tags" values={arr("tags")} onChange={(value) => set("tags", value)} maxItems={30} maxLength={60} hint="Up to 30 tags, 60 characters each." /></div></section>}
    {module === "faqs" && <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><h2>FAQ details</h2><p>Choose where this answer should appear and which answer format to use.</p></div></div>
      <div className={styles.formGrid}>
        <Field label="Topic"><TextInput value={str("topic")} onChange={(value) => set("topic", value)} /></Field>
        <Field label="Position" hint="Lower numbers appear first. Use 0 for the first FAQ."><TextInput type="number" value={String(num("position"))} onChange={(value) => set("position", Number(value))} /></Field>
        <fieldset className={`${styles.field} ${styles.spanTwo}`} style={{ border: 0, margin: 0, padding: 0 }} aria-describedby="faq-placement-hint">
          <legend className={styles.fieldLabel}>Placements</legend>
          <p id="faq-placement-hint" className={styles.fieldHint}>Home and Help are currently displayed on the public site. About, Contact, Product details, and Solutions are saved but not connected to a public section yet.</p>
          <div className={styles.checkList}>
            {FAQ_PLACEMENTS.map((placement) => <label key={placement.value}>
              <input type="checkbox" checked={faqPlacements.includes(placement.value)} onChange={(event) => toggleFaqPlacement(placement.value, event.target.checked)} />
              <span><strong>{placement.label}</strong><span className={styles.fieldHint}>{placement.note}</span></span>
            </label>)}
          </div>
          {unlistedFaqPlacements.length > 0 && <p className={styles.fieldHint}>Existing placement values not listed here will be preserved: {unlistedFaqPlacements.join(", ")}.</p>}
        </fieldset>
        <Field label="Plain text answer" hint="This is used only when no formatted blocks are present. Formatted blocks take precedence; the plain text remains saved." className={styles.spanTwo}>
          <TextArea value={str("answer")} onChange={(value) => set("answer", value)} rows={6} />
        </Field>
        {faqHasFormattedBlocks && faqHasPlainAnswer && <p className={`${styles.fieldHint} ${styles.spanTwo}`} role="status">Formatted blocks are shown publicly. The plain text answer remains saved but is hidden while blocks are present.</p>}
      </div>
    </section>}
    {module === "team" && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Profile details</h2><p>Use real or owner-approved identities and biographies.</p></div></div><div className={styles.formGrid}><Field label="Name"><TextInput value={str("name")} onChange={(value) => set("name", value)} /></Field><Field label="Role"><TextInput value={str("role")} onChange={(value) => set("role", value)} /></Field><Field label="Position"><TextInput type="number" value={String(num("position"))} onChange={(value) => set("position", Number(value))} /></Field><Field label="Biography" className={styles.spanTwo}><TextArea value={str("bio")} onChange={(value) => set("bio", value)} rows={5} /></Field><RowEditor label="Profile links" addLabel="Add link" rows={rows("links")} columns={[{ key: "label", label: "Label" }, { key: "url", label: "HTTPS URL" }]} onChange={(value) => set("links", value)} /></div></section>}
    {module === "navigation" && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Navigation links</h2><p>Use the exact existing destination to rename, reorder or hide a core link within its menu group. New header links appear under About; new footer links appear under Company & policies. Missing entries keep defaults.</p></div></div><RowEditor label="Links" addLabel="Add navigation link" rows={rows("links")} columns={[{ key: "label", label: "Label" }, { key: "href", label: "Path or HTTPS URL" }, { key: "group", label: "Group", type: "select", options: [{ value: "header", label: "Header" }, { value: "footer", label: "Footer" }] }, { key: "position", label: "Position", type: "number" }, { key: "visible", label: "Visible", type: "checkbox" }]} onChange={(value) => set("links", value.map((row) => ({ ...row, group: row.group === "footer" ? "footer" : "header" })))} /></section>}
    {module === "contact" && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Public contact details</h2><p>Only publish details approved for the public site.</p></div></div><div className={styles.formGrid}><Field label="Email"><TextInput type="email" value={str("email")} onChange={(value) => set("email", value)} /></Field><Field label="Phone"><TextInput value={str("phone")} onChange={(value) => set("phone", value)} /></Field><Field label="Address" className={styles.spanTwo}><TextArea value={str("address")} onChange={(value) => set("address", value)} rows={3} /></Field><Field label="Hours"><TextInput value={str("hours")} onChange={(value) => set("hours", value)} /></Field><Field label="Timezone"><TextInput value={str("timezone")} onChange={(value) => set("timezone", value)} placeholder="Asia/Kolkata" /></Field><RowEditor label="Social links" addLabel="Add link" rows={rows("socialLinks")} columns={[{ key: "label", label: "Platform" }, { key: "url", label: "HTTPS URL" }]} onChange={(value) => set("socialLinks", value)} /></div></section>}
    {module === "contact" && <section className={styles.panel} aria-label="Support and brand copy"><div className={styles.sectionHeading}><div><h2>Support and brand copy</h2><p>Optional plain text. Blank fields keep the current default. Save a draft and review before publishing.</p></div></div><div className={styles.formGrid}><Field label="Support heading"><TextInput value={str("supportTitle")} onChange={(value) => set("supportTitle", value)} maxLength={120} /></Field><Field label="Support description" className={styles.spanTwo}><TextArea value={str("supportText")} onChange={(value) => set("supportText", value)} maxLength={1000} rows={3} /></Field><Field label="Footer tagline"><TextInput value={str("footerTagline")} onChange={(value) => set("footerTagline", value)} maxLength={160} /></Field><Field label="Copyright name"><TextInput value={str("copyrightName")} onChange={(value) => set("copyrightName", value)} maxLength={120} /></Field></div></section>}
    {(module === "learn" || module === "videos") && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>{module === "learn" ? "Resource details" : "Video details"}</h2></div></div><div className={styles.formGrid}><Field label={module === "learn" ? "Resource URL" : "YouTube URL or ID"}><TextInput value={str("url")} onChange={(value) => set("url", value)} placeholder={module === "learn" ? "https://… or /learn/…" : "https://youtube.com/watch?v=…"} /></Field><Field label="Position"><TextInput type="number" value={String(num("position"))} onChange={(value) => set("position", Number(value))} /></Field><RelationPicker label="Related products" module="products" values={arr("productIds")} onChange={(value) => set("productIds", value)} /></div></section>}

    {module === "learn" && <Field label="Learning collection"><select className={styles.input} value={str("collection") || "embedded-systems"} onChange={(event) => set("collection", event.target.value)}><option value="embedded-systems">Embedded systems resources</option><option value="product-specs">Product specifications</option><option value="kit-guides">PandaByte kit guides</option></select></Field>}
    {module === "categories" && <CategoryImageEditor mediaIds={arr("mediaIds")} onChange={(value) => set("mediaIds", value)} request={api} canManageMedia={canManageMedia} onUploadDelta={onUploadDelta} />}
    {(module === "products" || module === "blog" || module === "team") && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>{module === "products" ? "Product image gallery" : "Media"}</h2><p>{module === "products" ? "Upload up to five WebP images and order the attached gallery." : "Only published WebP images can appear in image galleries."}</p></div></div><RelationPicker label={module === "products" ? "Product images" : "Media assets"} module="media" values={arr("mediaIds")} onChange={(value) => set("mediaIds", value)} reorderable={module === "products"} maxSelections={module === "products" ? 5 : 100} canManageMedia={canManageMedia} uploadOnly={module === "products"} onUploadDelta={onUploadDelta} /></section>}
    {module === "products" && <ProductModelPicker value={doc.model3d as ProductModel3d | undefined} onChange={(value) => set("model3d", value)} title={str("title")} />}

    {module === "products" || module === "categories" ? <ProductRichTextEditor
      key={richContentResetKey}
      kind={module === "categories" ? "category" : "product"}
      value={doc.richContent as ProductRichContent | undefined ?? legacyBlocksToRichContent(readJson<ContentBlock[]>(doc.blocks, []))}
      onChange={(value) => setDocument((current) => ({ ...current, blocks: [], richContent: value } as AdminDocument))}
      onValidityChange={onRichContentValidityChange}
      onUploadDelta={onUploadDelta}
    /> : <BlockEditor blocks={readJson<ContentBlock[]>(doc.blocks, [])} onChange={(value) => set("blocks", value)} reorderable={module === "pages" || module === "blog" || module === "faqs"} contentLabel={module === "blog" ? "Article content" : module === "faqs" ? "Formatted answer" : "Page content"} />}
    <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Search preview</h2><p>Search metadata is optional. Keep it accurate to this record.</p></div></div><div className={styles.formGrid}><Field label="SEO title"><TextInput value={str("seoTitle")} onChange={(value) => set("seoTitle", value)} maxLength={160} /></Field><Field label="SEO description" className={styles.spanTwo}><TextArea value={str("seoDescription")} onChange={(value) => set("seoDescription", value)} rows={3} /></Field></div></section>
  </>;
}

export function RecordEditorScreen({ module, id }: { module: AdminModule; id: string }) {
  const isNew = id === "new";
  const meta = META[module];
  const capabilities = useAdminCapabilities();
  const canEdit = capabilities.includes(ADMIN_MODULES[module].editCapability);
  const canPublish = capabilities.includes("content.publish");
  const router = useRouter();
  const [record, setRecord] = useState<AdminRecord | null>(null);
  const [draft, setDraft] = useState<AdminDocument>(() => freshDocument(module));
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const editorErrorRef = useRef<HTMLDivElement>(null);
  const categoryArchiveDialog = useRef<HTMLDialogElement>(null);
  const categoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const [categoryArchiveOpen, setCategoryArchiveOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [restoreId, setRestoreId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [slugAuto, setSlugAuto] = useState(isNew);
  const [richContentValid, setRichContentValid] = useState(true);
  const [richContentResetKey, setRichContentResetKey] = useState(0);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [pricingRefreshKey, setPricingRefreshKey] = useState(0);
  const [productPricing, setProductPricing] = useState<ProductPricingState>(() => ({ writes: [], dirty: false, errors: [], ready: module !== "products" || isNew }));
  const canManageMedia = capabilities.includes("media.manage");
  const onUploadDelta = useCallback((change: 1 | -1) => setPendingUploads((current) => Math.max(0, current + change)), []);
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);
  const documentDirty = isNew ? serialized !== JSON.stringify(freshDocument(module)) : serialized !== baseline;
  const dirty = documentDirty || (module === "products" && productPricing.dirty) || ((module === "products" || module === "categories") && (!richContentValid || pendingUploads > 0));
  const pricingReady = module !== "products" || productPricing.ready;

  useEffect(() => {
    const dialog = categoryArchiveDialog.current;
    if (!dialog) return;
    if (categoryArchiveOpen && !dialog.open) dialog.showModal();
    if (!categoryArchiveOpen && dialog.open) dialog.close();
  }, [categoryArchiveOpen]);

  useEffect(() => {
    if (module === "categories" && record?.archived) categoryHeadingRef.current?.focus();
  }, [module, record?.archived]);

  useEffect(() => {
    if (validationIssues.length) validationSummaryRef.current?.focus();
  }, [validationIssues]);

  useEffect(() => {
    if (error) editorErrorRef.current?.focus();
  }, [error]);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const result = await api<{ record: AdminRecord }>(`/api/admin/${module}/${encodeURIComponent(id)}`);
      setRecord(result.record);
      setDraft(result.record.document);
      setBaseline(JSON.stringify(result.record.document));
      setSlugAuto(false);
      setRichContentValid(true);
      if (module === "products" || module === "categories") setRichContentResetKey((value) => value + 1);
      setProductPricing({ writes: [], dirty: false, errors: [], ready: module !== "products" });
      if (module === "products") setPricingRefreshKey((value) => value + 1);
      setConflict(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Record could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew, module]);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void api<{ record: AdminRecord }>(`/api/admin/${module}/${encodeURIComponent(id)}`)
      .then((result) => { if (active) { setRecord(result.record); setDraft(result.record.document); setBaseline(JSON.stringify(result.record.document)); setSlugAuto(false); setRichContentValid(true); if (module === "products" || module === "categories") setRichContentResetKey((value) => value + 1); setProductPricing({ writes: [], dirty: false, errors: [], ready: module !== "products" }); if (module === "products") setPricingRefreshKey((value) => value + 1); setConflict(false); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Record could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, isNew, module]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && destination.href !== window.location.href && !window.confirm("You have unsaved changes. Leave this page and discard them?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardNavigation, true); };
  }, [dirty]);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setValidationIssues([]);
    setNotice("");
    if (pendingUploads > 0) {
      setError("Wait for all media uploads to finish before saving.");
      return null;
    }
    if (module === "products" && !productPricing.ready) {
      setError("Wait for variant prices to load, or retry the price read, before saving this product.");
      return null;
    }
    if (module === "products" && productPricing.errors.length) {
      setValidationIssues(productPricing.errors.map((message) => ({ field: "prices", message })));
      return null;
    }
    if ((module === "products" || module === "categories") && !richContentValid) {
      setError("The description contains unsupported content or formatting. Correct it before saving.");
      return null;
    }
    setBusy(true);
    const parsed = parseDocument(module, draft);
    if (!parsed.ok) {
      setValidationIssues(parsed.fields);
      setBusy(false);
      return null;
    }
    const prices = module === "products" ? productPricing.writes : [];
    try {
      const result = isNew
        ? await api<{ record: AdminRecord }>(`/api/admin/${module}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: parsed.value, ...(prices.length ? { prices } : {}) }) })
        : await api<{ record: AdminRecord }>(`/api/admin/${module}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: record?.version, document: parsed.value, ...(prices.length ? { prices } : {}) }) });
      setRecord(result.record);
      setDraft(result.record.document);
      setBaseline(JSON.stringify(result.record.document));
      setRichContentValid(true);
      if (module === "products") {
        if (isNew) setSlugAuto(false);
        setProductPricing({ writes: [], dirty: false, errors: [], ready: false });
        setPricingRefreshKey((value) => value + 1);
        setRichContentResetKey((value) => value + 1);
        toast.success("Product draft saved.");
      }
      if (module === "categories") { setSlugAuto(false); toast.success("Category draft saved."); }
      if (module === "categories") setRichContentResetKey((value) => value + 1);
      setConflict(false);
      setNotice("Draft saved.");
      if (isNew) router.replace(`/admin/${module}/${result.record.id}`);
      return result.record;
    } catch (reason) {
      const status = (reason as { status?: number }).status;
      const fields = (reason as { fields?: ValidationIssue[] }).fields;
      setConflict(status === 409);
      if (Array.isArray(fields) && fields.length) setValidationIssues(fields);
      else setError(reason instanceof Error ? reason.message : "The draft could not be saved.");
      if (module === "products" || module === "categories") toast.error(reason instanceof Error ? reason.message : "The draft could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "publish" | "unpublish" | "archive" | "restore", revisionId?: string) {
    let current = record;
    if (dirty) current = await save();
    if (!current) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ record: AdminRecord }>(`/api/admin/${module}/${encodeURIComponent(current.id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: current.version, ...(action === "restore" ? { revisionId } : {}) }),
      });
      setRecord(result.record);
      setDraft(result.record.document);
      setBaseline(JSON.stringify(result.record.document));
      setRichContentValid(true);
      if (module === "products") {
        setProductPricing({ writes: [], dirty: false, errors: [], ready: false });
        setPricingRefreshKey((value) => value + 1);
        setRichContentResetKey((value) => value + 1);
      }
      setConflict(false);
      setNotice(action === "publish" ? "Record published." : action === "unpublish" ? "Record unpublished." : action === "archive" ? "Record archived." : "Revision restored as a new draft.");
      if (module === "products") toast.success(action === "publish" ? "Product published." : "Product updated.");
      if (module === "categories") toast.success(action === "archive" ? "Category archived. Its history was preserved." : "Category updated.");
      if (module === "categories") setRichContentResetKey((value) => value + 1);
    } catch (reason) {
      const status = (reason as { status?: number }).status;
      setConflict(status === 409);
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
      if (module === "products" || module === "categories") toast.error(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return <AdminAccessDeniedScreen title={meta.title} />;
  if (loading) return <div className={styles.screen}><p className={styles.loadingState} role="status">Loading {meta.singular}…</p></div>;
  if (!isNew && !record && error) return <div className={styles.screen}><div id="record-editor-error" className={styles.errorBanner} ref={editorErrorRef} role="alert" tabIndex={-1}><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setError(""); void load(); }}><RefreshCw size={15} aria-hidden="true" /> Try again</button></div></div>;
  const status = record?.archived ? "Archived" : record?.publishedRevisionId ? "Published" : "Draft";

  return <div className={styles.screen}>
    <div className={styles.editorHeading}>
      <div><Link className={styles.backLink} href={`/admin/${module}`}><ArrowLeft aria-hidden="true" size={16} /> {meta.title}</Link><h1 ref={module === "categories" ? categoryHeadingRef : undefined} tabIndex={module === "categories" ? -1 : undefined}>{isNew ? `Create ${meta.singular}` : draft.title || `Edit ${meta.singular}`}</h1><div className={styles.headingMeta}>{record && <span className={`${styles.statusPill} ${status === "Published" ? styles.statusPublished : status === "Archived" ? styles.statusArchived : ""}`}>{status}</span>}{record && <span>Updated {formatDate(record.updatedAt)}</span>}{dirty && <span className={styles.unsaved}>Unsaved changes</span>}</div></div>
      <div className={styles.editorActions}>
        <button className={styles.secondaryButton} type="button" onClick={() => setPreviewOpen((value) => !value)}><Eye size={16} aria-hidden="true" /> {previewOpen ? "Hide preview" : "Preview draft"}</button>
        <button className={styles.primaryButton} type="button" onClick={() => void save()} disabled={!canEdit || busy || pendingUploads > 0 || !pricingReady || (!dirty && !isNew)}><Save size={16} aria-hidden="true" /> {busy ? "Saving…" : "Save draft"}</button>
      </div>
    </div>
    {previewOpen && <DraftPreview document={draft} module={module} />}
    {!canEdit && <div className={styles.errorBanner} role="status"><p>Your role allows you to view this record, but not edit it.</p></div>}
    {validationIssues.length > 0 && <div id="record-validation-summary" className={styles.errorBanner} role="alert" tabIndex={-1} ref={validationSummaryRef}><div><p>Review these fields before saving:</p><ul>{validationIssues.map((issue, index) => <li key={`${issue.field}-${index}`}>{validationFieldLabel(issue.field)}: {issue.message}</li>)}</ul></div></div>}
    {error && <div id="record-editor-error" className={styles.errorBanner} ref={editorErrorRef} role="alert" tabIndex={-1}><p>{error}</p>{conflict && <button className={styles.secondaryButton} type="button" onClick={() => { if (window.confirm("Discard your local edits and load the latest server version?")) void load(); }}>Reload server version</button>}</div>}
    {notice && <p className={styles.successBanner} role="status"><Check size={16} aria-hidden="true" /> {notice}</p>}
    <form className={styles.editorForm} onSubmit={save} aria-busy={busy} aria-describedby={validationIssues.length && error ? "record-validation-summary record-editor-error" : validationIssues.length ? "record-validation-summary" : error ? "record-editor-error" : undefined}>
      <fieldset className={styles.editorFieldset} disabled={!canEdit}>
        <DocumentFields key={`${record?.id ?? "new"}:${pricingRefreshKey}`} module={module} document={draft} setDocument={setDraft} recordId={record?.id} slugAuto={slugAuto} setSlugAuto={setSlugAuto} onPricingChange={setProductPricing} pricingRefreshKey={pricingRefreshKey} canManageMedia={canManageMedia} onRichContentValidityChange={setRichContentValid} richContentResetKey={richContentResetKey} onUploadDelta={onUploadDelta} />
      </fieldset>
      <div className={styles.bottomActions}><span>{pendingUploads > 0 ? "Media is uploading…" : dirty ? "Remember to save your changes before leaving." : "All changes are saved."}</span><button className={styles.primaryButton} type="submit" disabled={!canEdit || busy || pendingUploads > 0 || !pricingReady || !dirty}>{busy ? "Saving…" : "Save draft"}</button></div>
    </form>
    {record && <section className={styles.panel} aria-labelledby="publishing-heading"><div className={styles.sectionHeading}><div><h2 id="publishing-heading">Publishing</h2><p>Publishing is a separate action and requires the right access.</p></div></div>
      <div className={styles.lifecycleActions}>
        <button className={styles.primaryButton} type="button" onClick={() => void transition("publish")} disabled={!canPublish || busy || pendingUploads > 0 || !pricingReady || record.archived}>{record.publishedRevisionId ? "Publish updates" : "Publish"}</button>
        {record.publishedRevisionId && <button className={styles.secondaryButton} type="button" onClick={() => void transition("unpublish")} disabled={!canPublish || busy || pendingUploads > 0 || !pricingReady || record.archived}>Unpublish</button>}
        {!record.archived && <button className={styles.dangerButton} type="button" onClick={() => module === "categories" ? setCategoryArchiveOpen(true) : window.confirm("Archive this record? It will be removed from public visibility.") && void transition("archive")} disabled={!canPublish || busy || pendingUploads > 0 || !pricingReady}>Archive</button>}
      </div>
      {!canPublish && <p className={styles.fieldHint}>Your role does not include publishing, unpublishing, or archiving.</p>}
      {record.revisions && record.revisions.length > 0 && <div className={styles.revisionPicker}><label className={styles.field}><span className={styles.fieldLabel}>Restore a published revision as a draft</span><select className={styles.input} value={restoreId} onChange={(event) => setRestoreId(event.target.value)}><option value="">Select a revision</option>{record.revisions.map((revision) => <option value={revision.id} key={revision.id}>Revision {revision.revisionNumber} · {revision.title} · {formatDate(revision.publishedAt)}</option>)}</select></label><button className={styles.secondaryButton} type="button" disabled={!restoreId || !canEdit || busy} onClick={() => void transition("restore", restoreId)}>Restore draft</button></div>}
      {record.archived && (!record.revisions || record.revisions.length === 0) && <p className={styles.fieldHint}>No published revision is available to restore.</p>}
      {record.publishedRevisionId && <p className={styles.fieldHint}>Published record slug: <code>{record.slug}</code></p>}
    </section>}
    {module === "categories" && <dialog ref={categoryArchiveDialog} className={`${confirmationStyles.dialog} ${confirmationStyles.confirmDialog}`} aria-labelledby="category-editor-archive-title" aria-describedby="category-editor-archive-warning" onClose={() => setCategoryArchiveOpen(false)}>
      <header className={confirmationStyles.dialogHeader}><h2 id="category-editor-archive-title">Archive category?</h2><button type="button" className={confirmationStyles.iconButton} aria-label="Close archive confirmation" onClick={() => setCategoryArchiveOpen(false)}><X size={18} aria-hidden="true" /></button></header>
      <p id="category-editor-archive-warning" className={confirmationStyles.confirmCopy}><strong>{draft.title || "This category"}</strong> will be removed from the active catalog. Its history is preserved. Linked products or child categories can prevent archival.{dirty ? " Unsaved edits will be saved first." : ""}</p>
      <div className={confirmationStyles.confirmActions}><button type="button" className={confirmationStyles.controlButton} onClick={() => setCategoryArchiveOpen(false)}>Cancel</button><button type="button" className={confirmationStyles.archiveConfirm} onClick={() => { setCategoryArchiveOpen(false); void transition("archive"); }}>Archive category</button></div>
    </dialog>}
  </div>;
}

export function AdminUnavailableScreen({ title, description }: { title: string; description: string }) {
  return <div className={styles.screen}><div className={styles.pageHeading}><div><h1>{title}</h1><p className={styles.lede}>{description}</p></div></div><div className={styles.emptyPanel}><p>This section is not available yet.</p><Link className={styles.secondaryButton} href="/admin">Return to dashboard</Link></div></div>;
}

export function AdminAccessDeniedScreen({ title }: { title: string }) {
  return <div className={styles.screen}><div className={styles.pageHeading}><div><h1>{title}</h1></div></div><div className={styles.errorBanner} role="status"><p>Your role does not allow access to this area.</p></div></div>;
}
