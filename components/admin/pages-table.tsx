"use client";

import { IconArrowLeft, IconArrowRight, IconPencil, IconRefresh, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { isPagesTableResult, type PagesTableQuery as PageTableQuery, type PagesTableResult } from "@/lib/admin/pages-table-contract";
import { ADMIN_MODULES } from "@/lib/admin/validation";
import tableStyles from "./products-table.module.css";
import styles from "./pages-table.module.css";

const PAGE_SIZES = [10, 20, 50] as const;
const STATUSES = ["all", "draft", "published", "archived"] as const;
const SORTS = ["updated_desc", "updated_asc", "title_asc", "title_desc"] as const;
const MAX_OFFSET = 10_000;
const DEFAULT_QUERY: PageTableQuery = { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 };
const conciseDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });

type PageTableStatus = (typeof STATUSES)[number];
type PageTableSort = (typeof SORTS)[number];
type PageTableLimit = (typeof PAGE_SIZES)[number];
type ApiError = { error?: { message?: string } };

function parseQuery(search: string): PageTableQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const q = (params.get("q") ?? "").trim();
  const limit = Number(params.get("limit"));
  const pageSize = PAGE_SIZES.includes(limit as PageTableLimit) ? limit as PageTableLimit : DEFAULT_QUERY.limit;
  const offsetValue = params.get("offset") ?? "0";
  const offset = /^(0|[1-9][0-9]*)$/.test(offsetValue) ? Number(offsetValue) : NaN;
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    q: Array.from(q).length <= 120 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(q) ? q : "",
    status: STATUSES.includes(status as PageTableStatus) ? status as PageTableStatus : DEFAULT_QUERY.status,
    sort: SORTS.includes(sort as PageTableSort) ? sort as PageTableSort : DEFAULT_QUERY.sort,
    limit: pageSize,
    offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= MAX_OFFSET
      ? Math.floor(offset / pageSize) * pageSize
      : DEFAULT_QUERY.offset,
  };
}

function serializeQuery(query: PageTableQuery) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  return params.toString();
}

function replaceQuery(query: PageTableQuery) {
  const url = new URL(window.location.href);
  url.search = serializeQuery(query);
  window.history.replaceState(null, "", url);
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as ApiError | null;
  return body && typeof body === "object" && typeof body.error?.message === "string"
    ? body.error.message
    : "Pages could not be loaded. Try again.";
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { visible: value, title: value, dateTime: undefined };
  return { visible: conciseDate.format(date), title: fullDate.format(date), dateTime: date.toISOString() };
}

export function PagesTable() {
  const capabilities = useAdminCapabilities();
  const canEdit = capabilities.includes(ADMIN_MODULES.pages.editCapability);
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const queryString = useMemo(() => serializeQuery(parseQuery(searchString)), [searchString]);
  const query = useMemo(() => parseQuery(queryString), [queryString]);
  const [searchDraft, setSearchDraft] = useState<{ base: string; value: string } | null>(null);
  const searchText = searchDraft?.base === query.q ? searchDraft.value : query.q;
  const [responseState, setResponseState] = useState<{ key: string; value: PagesTableResult } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const requestKey = `${queryString}#${reload}`;
  const response = responseState?.key === requestKey ? responseState.value : null;
  const rows = response?.items ?? [];
  const total = response?.total ?? null;
  const error = errorState?.key === requestKey ? errorState.message : "";
  const loading = canEdit && responseState?.key !== requestKey && errorState?.key !== requestKey;

  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const timer = window.setTimeout(() => replaceQuery({ ...query, q: searchText.trim(), offset: 0 }), 300);
    return () => window.clearTimeout(timer);
  }, [query, searchText]);

  useEffect(() => {
    if (!canEdit) return;
    const url = new URL(window.location.href);
    if (url.search.slice(1) !== queryString) replaceQuery(query);

    const controller = new AbortController();
    void fetch(`/api/admin/pages/table?${queryString}`, { cache: "no-store", signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error(await readError(result));
        return result.json() as Promise<unknown>;
      })
      .then((result) => {
        if (!isPagesTableResult(result, query.limit)) throw new Error("Pages could not be loaded. Try again.");
        setResponseState({ key: requestKey, value: result });
        const lastPageOffset = result.total === 0 ? 0 : Math.min(Math.floor((result.total - 1) / query.limit) * query.limit, MAX_OFFSET);
        if (query.offset > lastPageOffset) replaceQuery({ ...query, offset: lastPageOffset });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Pages could not be loaded. Try again." });
      });
    return () => controller.abort();
  }, [canEdit, query, queryString, reload, requestKey]);

  const pageRange = useMemo(() => {
    if (total === null || total === 0) return "";
    return `${query.offset + 1}–${Math.min(query.offset + rows.length, total)} of ${total}`;
  }, [query.offset, rows.length, total]);

  const retry = useCallback(() => setReload((value) => value + 1), []);
  function updateQuery(patch: Partial<PageTableQuery>) {
    replaceQuery({ ...query, ...patch });
  }

  if (!canEdit) return <div className={tableStyles.screen}><h1>Pages</h1><p className={tableStyles.accessMessage} role="alert">You do not have permission to manage pages.</p></div>;

  return <div className={tableStyles.screen}>
    <header className={tableStyles.heading}>
      <div><h1>Pages</h1><p>Manage published site pages with structured content blocks.</p></div>
      <Link className={tableStyles.newButton} href="/admin/pages/new">New page</Link>
    </header>

    <section className={tableStyles.controls} aria-label="Page table filters">
      <label className={tableStyles.search} htmlFor="pages-search">
        <IconSearch aria-hidden="true" size={16} />
        <span className={tableStyles.visuallyHidden}>Search pages</span>
        <input id="pages-search" type="search" maxLength={120} value={searchText} onChange={(event) => setSearchDraft({ base: query.q, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateQuery({ q: searchText.trim(), offset: 0 }); } }} placeholder="Search title or slug" />
      </label>
      <label className={tableStyles.filter}>
        <span>Status</span>
        <select value={query.status} onChange={(event) => updateQuery({ status: event.target.value as PageTableStatus, offset: 0 })}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </label>
      <label className={tableStyles.filter}>
        <span>Sort</span>
        <select value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value as PageTableSort, offset: 0 })}>
          <option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option>
          <option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
        </select>
      </label>
      <span className={tableStyles.count} aria-live="polite">{loading ? "Loading pages…" : total === null ? "" : `${total} ${total === 1 ? "page" : "pages"}`}</span>
    </section>

    {error && <div className={tableStyles.errorBanner} role="alert"><p>{error}</p><button type="button" className={tableStyles.controlButton} onClick={retry}><IconRefresh aria-hidden="true" size={15} /> Try again</button></div>}

    <div className={tableStyles.tableScroller} role="region" aria-label="Pages" tabIndex={0} aria-busy={loading}>
      <table className={`${tableStyles.table} ${styles.table}`}>
        <thead><tr>
          <th scope="col" className={tableStyles.numberHeading}>No.</th><th scope="col">Page</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className={tableStyles.visuallyHidden}>Actions</span></th>
        </tr></thead>
        <tbody>
          {loading && <tr><td className={tableStyles.tableMessage} colSpan={5}>Loading pages…</td></tr>}
          {!loading && !error && rows.length === 0 && <tr><td className={tableStyles.tableMessage} colSpan={5}>{query.q || query.status !== "all" ? "No pages match these filters." : "No pages yet. Create the first page when approved content is ready."}</td></tr>}
          {!loading && rows.map((row, index) => {
            const title = row.title || "Untitled page";
            const updated = formatUpdated(row.updatedAt);
            const status = row.archived ? "archived" : row.publishedRevisionId ? "published" : "draft";
            const editHref = `/admin/pages/${encodeURIComponent(row.id)}`;
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

    <nav className={tableStyles.pagination} aria-label="Pages pagination">
      <span>{pageRange}</span>
      <div className={tableStyles.pageControls}>
        <label className={tableStyles.pageSize}><span>Rows</span><select aria-label="Rows per page" value={query.limit} onChange={(event) => updateQuery({ limit: Number(event.target.value) as PageTableLimit, offset: 0 })}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: Math.max(0, query.offset - query.limit) })} disabled={loading || query.offset === 0}><IconArrowLeft aria-hidden="true" size={16} /> Previous</button>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: query.offset + query.limit })} disabled={loading || total === null || query.offset + query.limit >= total || query.offset + query.limit > MAX_OFFSET}>Next <IconArrowRight aria-hidden="true" size={16} /></button>
      </div>
    </nav>
  </div>;
}
