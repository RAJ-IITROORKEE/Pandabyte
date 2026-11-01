"use client";

import { AdminNotice } from "./admin-notice";

import { IconArrowLeft, IconArrowRight, IconPencil, IconRefresh, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAdminPermission } from "@/lib/admin/access-contract";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { isContentTableResult, type ContentTableModule, type ContentTableQuery, type ContentTableResult } from "@/lib/admin/pages-table-contract";
import { ADMIN_MODULES } from "@/lib/admin/validation";
import tableStyles from "./products-table.module.css";
import styles from "./pages-table.module.css";

const PAGE_SIZES = [10, 20, 50] as const;
const STATUSES = ["all", "draft", "published", "archived"] as const;
const SORTS = ["updated_desc", "updated_asc", "title_asc", "title_desc"] as const;
const COLLECTIONS = ["all", "product-specs", "embedded-systems", "kit-guides"] as const;
const MAX_OFFSET = 10_000;
const DEFAULT_QUERY: ContentTableQuery = { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 };
const conciseDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });
const TABLE_COPY = {
  pages: { title: "Pages", description: "Manage published site pages with structured content blocks.", singular: "page", plural: "pages", row: "Page", loading: "Loading pages…", error: "Pages could not be loaded. Try again.", empty: "Create the first page when approved content is ready." },
  blog: { title: "Blog", description: "Edit sourced editorial content and its publication status.", singular: "article", plural: "articles", row: "Article", loading: "Loading blog articles…", error: "Articles could not be loaded. Try again.", empty: "Create the first article when approved content is ready." },
  faqs: { title: "FAQs", description: "Manage questions, answers and their publication status.", singular: "FAQ", plural: "FAQs", row: "Question", loading: "Loading FAQs…", error: "FAQs could not be loaded. Try again.", empty: "Create the first FAQ when approved content is ready." },
  team: { title: "Team", description: "Manage approved team profiles and their publication status.", singular: "profile", plural: "profiles", row: "Profile", loading: "Loading profiles…", error: "Profiles could not be loaded. Try again.", empty: "Create the first profile when approved details are ready." },
  solutions: { title: "Solutions", description: "Manage solution pages and their publication status.", singular: "solution", plural: "solutions", row: "Solution", loading: "Loading solutions…", error: "Solutions could not be loaded. Try again.", empty: "Create the first solution when approved content is ready." },
  learn: { title: "Learn resources", description: "Manage learning resources and their publication status.", singular: "resource", plural: "resources", row: "Resource", loading: "Loading resources…", error: "Resources could not be loaded. Try again.", empty: "Create the first resource when approved content is ready." },
  videos: { title: "Videos", description: "Manage approved YouTube videos and their publication status.", singular: "video", plural: "videos", row: "Video", loading: "Loading videos…", error: "Videos could not be loaded. Try again.", empty: "Create the first video when approved content is ready." },
} as const;

type ContentTableStatus = (typeof STATUSES)[number];
type ContentTableSort = (typeof SORTS)[number];
type ContentTableLimit = (typeof PAGE_SIZES)[number];
type Collection = (typeof COLLECTIONS)[number];
type TableQuery = ContentTableQuery & { collection?: Collection };
type ApiError = { error?: { message?: string } };

function parseQuery(search: string, module: ContentTableModule): TableQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const q = (params.get("q") ?? "").trim();
  const limit = Number(params.get("limit"));
  const pageSize = PAGE_SIZES.includes(limit as ContentTableLimit) ? limit as ContentTableLimit : DEFAULT_QUERY.limit;
  const offsetValue = params.get("offset") ?? "0";
  const offset = /^(0|[1-9][0-9]*)$/.test(offsetValue) ? Number(offsetValue) : NaN;
  const status = params.get("status");
  const sort = params.get("sort");
  const collection = params.get("collection");
  return {
    ...(module === "learn" ? { collection: COLLECTIONS.includes(collection as Collection) ? collection as Collection : "all" } : {}),
    q: Array.from(q).length <= 120 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(q) ? q : "",
    status: STATUSES.includes(status as ContentTableStatus) ? status as ContentTableStatus : DEFAULT_QUERY.status,
    sort: SORTS.includes(sort as ContentTableSort) ? sort as ContentTableSort : DEFAULT_QUERY.sort,
    limit: pageSize,
    offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= MAX_OFFSET
      ? Math.floor(offset / pageSize) * pageSize
      : DEFAULT_QUERY.offset,
  };
}

function serializeQuery(query: TableQuery) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.collection) params.set("collection", query.collection);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  return params.toString();
}

function replaceQuery(query: TableQuery) {
  const url = new URL(window.location.href);
  url.search = serializeQuery(query);
  window.history.replaceState(null, "", url);
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ApiError | null;
  return body && typeof body === "object" && typeof body.error?.message === "string"
    ? body.error.message
    : fallback;
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { visible: value, title: value, dateTime: undefined };
  return { visible: conciseDate.format(date), title: fullDate.format(date), dateTime: date.toISOString() };
}

export function ContentTable({ module = "pages" }: { module?: ContentTableModule }) {
  const copy = TABLE_COPY[module];
  const kind = module === "pages" ? "page" : module === "blog" ? "blog" : module === "faqs" ? "faq" : module === "team" ? "team" : module === "solutions" ? "solution" : module === "videos" ? "video" : "resource";
  const capabilities = useAdminCapabilities();
  const hasAccess = capabilities.includes(ADMIN_MODULES[module].editCapability);
  const canRead = hasAccess && canAdminPermission(capabilities, module, "read");
  const canCreate = hasAccess && canAdminPermission(capabilities, module, "create");
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const queryString = useMemo(() => serializeQuery(parseQuery(searchString, module)), [searchString, module]);
  const query = useMemo(() => parseQuery(queryString, module), [queryString, module]);
  const [searchDraft, setSearchDraft] = useState<{ base: string; value: string } | null>(null);
  const searchText = searchDraft?.base === query.q ? searchDraft.value : query.q;
  const [responseState, setResponseState] = useState<{ key: string; value: ContentTableResult } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const requestKey = `${module}#${queryString}#${reload}`;
  const response = responseState?.key === requestKey ? responseState.value : null;
  const rows = response?.items ?? [];
  const total = response?.total ?? null;
  const error = errorState?.key === requestKey ? errorState.message : "";
  const loading = canRead && responseState?.key !== requestKey && errorState?.key !== requestKey;

  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const timer = window.setTimeout(() => replaceQuery({ ...query, q: searchText.trim(), offset: 0 }), 300);
    return () => window.clearTimeout(timer);
  }, [query, searchText]);

  useEffect(() => {
    if (!canRead) return;
    const url = new URL(window.location.href);
    if (url.search.slice(1) !== queryString) replaceQuery(query);

    const controller = new AbortController();
    void fetch(`/api/admin/${module}/table?${queryString}`, { cache: "no-store", signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error(await readError(result, copy.error));
        return result.json() as Promise<unknown>;
      })
      .then((result) => {
        if (!isContentTableResult(result, query.limit, kind)) throw new Error(copy.error);
        setResponseState({ key: requestKey, value: result });
        const lastPageOffset = result.total === 0 ? 0 : Math.min(Math.floor((result.total - 1) / query.limit) * query.limit, MAX_OFFSET);
        if (query.offset > lastPageOffset) replaceQuery({ ...query, offset: lastPageOffset });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : copy.error });
      });
    return () => controller.abort();
  }, [canRead, copy.error, kind, module, query, queryString, reload, requestKey]);

  const pageRange = useMemo(() => {
    if (total === null || total === 0) return "";
    return `${query.offset + 1}–${Math.min(query.offset + rows.length, total)} of ${total}`;
  }, [query.offset, rows.length, total]);

  const retry = useCallback(() => setReload((value) => value + 1), []);
  function updateQuery(patch: Partial<TableQuery>) {
    replaceQuery({ ...query, ...patch });
  }

  if (!canRead) return <div className={tableStyles.screen}><h1>{copy.title}</h1><p className={tableStyles.accessMessage} role="alert">You do not have permission to manage {copy.plural}.</p></div>;

  return <div className={tableStyles.screen}>
    <header className={tableStyles.heading}>
      <div><h1>{copy.title}</h1><p>{copy.description}</p></div>
      {canCreate && <Link className={tableStyles.newButton} href={`/admin/${module}/new`}>New {copy.singular}</Link>}
    </header>

    <section className={tableStyles.controls} aria-label={`${copy.title} table filters`}>
      <label className={tableStyles.search} htmlFor={`${module}-search`}>
        <IconSearch aria-hidden="true" size={16} />
        <span className={tableStyles.visuallyHidden}>Search {copy.plural}</span>
        <input id={`${module}-search`} type="search" maxLength={120} value={searchText} onChange={(event) => setSearchDraft({ base: query.q, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateQuery({ q: searchText.trim(), offset: 0 }); } }} placeholder="Search title or slug" />
      </label>
      {module === "learn" && <label className={tableStyles.filter}>
        <span>Collection</span>
        <select value={query.collection ?? "all"} onChange={(event) => updateQuery({ collection: event.target.value as Collection, offset: 0 })}>
          <option value="all">All collections</option><option value="product-specs">Product specs</option><option value="embedded-systems">Embedded systems</option><option value="kit-guides">Kit guides</option>
        </select>
      </label>}
      <label className={tableStyles.filter}>
        <span>Status</span>
        <select value={query.status} onChange={(event) => updateQuery({ status: event.target.value as ContentTableStatus, offset: 0 })}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </label>
      <label className={tableStyles.filter}>
        <span>Sort</span>
        <select value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value as ContentTableSort, offset: 0 })}>
          <option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option>
          <option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
        </select>
      </label>
      <span className={tableStyles.count} aria-live="polite">{loading ? copy.loading : total === null ? "" : `${total} ${total === 1 ? copy.singular : copy.plural}`}</span>
    </section>

    {error && <AdminNotice tone="error" key={`${requestKey}:${error}`} className={tableStyles.errorBanner} actions={<button type="button" className={tableStyles.controlButton} onClick={retry}><IconRefresh aria-hidden="true" size={15} /> Try again</button>}><p>{error}</p></AdminNotice>}

    <div className={tableStyles.tableScroller} role="region" aria-label={copy.title} tabIndex={0} aria-busy={loading}>
      <table className={`${tableStyles.table} ${styles.table}`}>
        <thead><tr>
          <th scope="col" className={tableStyles.numberHeading}>No.</th><th scope="col">{copy.row}</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className={tableStyles.visuallyHidden}>Actions</span></th>
        </tr></thead>
        <tbody>
          {loading && <tr><td className={tableStyles.tableMessage} colSpan={5}>{copy.loading}</td></tr>}
          {!loading && !error && rows.length === 0 && <tr><td className={tableStyles.tableMessage} colSpan={5}>{query.q || query.status !== "all" || (query.collection && query.collection !== "all") ? `No ${copy.plural} match these filters.` : `No ${copy.plural} yet. ${copy.empty}`}</td></tr>}
          {!loading && rows.map((row, index) => {
            const title = row.title || `Untitled ${copy.singular}`;
            const updated = formatUpdated(row.updatedAt);
            const status = row.archived ? "archived" : row.publishedRevisionId ? "published" : "draft";
            const editHref = `/admin/${module}/${encodeURIComponent(row.id)}`;
            return <tr key={row.id}>
              <td className={tableStyles.rowNumber}>{query.offset + index + 1}</td>
              <td className={styles.pageCell}>
                <Link className={styles.pageTitle} href={editHref} title={title}>{title}</Link>
                <code className={styles.pageSlug} title={row.slug}>{row.slug}</code>
              </td>
              <td><span className={`${tableStyles.statusBadge} ${tableStyles[`status${status[0].toUpperCase()}${status.slice(1)}`]}`}>{status}</span></td>
              <td className={tableStyles.updatedCell}><time dateTime={updated.dateTime} title={updated.title}>{updated.visible}</time></td>
              <td><div className={tableStyles.actions}><Link className={tableStyles.iconButton} href={editHref} aria-label={`Edit ${title}`} title="Edit"><IconPencil aria-hidden="true" size={16} /></Link></div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <nav className={tableStyles.pagination} aria-label={`${copy.title} pagination`}>
      <span>{pageRange}</span>
      <div className={tableStyles.pageControls}>
        <label className={tableStyles.pageSize}><span>Rows</span><select aria-label="Rows per page" value={query.limit} onChange={(event) => updateQuery({ limit: Number(event.target.value) as ContentTableLimit, offset: 0 })}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: Math.max(0, query.offset - query.limit) })} disabled={loading || query.offset === 0}><IconArrowLeft aria-hidden="true" size={16} /> Previous</button>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: query.offset + query.limit })} disabled={loading || total === null || query.offset + query.limit >= total || query.offset + query.limit > MAX_OFFSET}>Next <IconArrowRight aria-hidden="true" size={16} /></button>
      </div>
    </nav>
  </div>;
}

export function PagesTable() {
  return <ContentTable />;
}
