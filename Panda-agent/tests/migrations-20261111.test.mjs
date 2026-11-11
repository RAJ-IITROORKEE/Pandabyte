import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const limits = sql('20261111100000_panda-agent-web-search-limits.sql');
const pages = sql('20261111100100_panda-agent-document-pages.sql');

test('web-search limits: RLS, no direct grants, atomic bounded consume', () => {
  assert.match(limits, /ENABLE ROW LEVEL SECURITY/);
  assert.match(limits, /REVOKE ALL ON public\.panda_agent_web_search_usage FROM PUBLIC,anon,authenticated/);
  assert.match(limits, /PRIMARY KEY\(subject,day\)/);
  assert.match(limits, /ON CONFLICT\(subject,day\) DO UPDATE[^;]*WHERE u\.used<p_limit/);
  assert.match(limits, /p_limit<1 OR p_limit>100/);
  assert.match(limits, /requesting_user_id\(\)/);
  assert.doesNotMatch(limits, /p_subject|p_user/);
});

test('document pages: RLS, privileged writes, authenticated-only eligible search', () => {
  assert.match(pages, /ENABLE ROW LEVEL SECURITY/);
  assert.match(pages, /REVOKE ALL ON public\.panda_agent_document_pages FROM PUBLIC,anon,authenticated/);
  assert.match(pages, /vector\(1024\)/);
  assert.match(pages, /USING gin\(search\)/);
  assert.match(pages, /UNIQUE\(source_id,kind,page_number\)/);
  assert.match(pages, /s\.review_state='approved' AND s\.rights_status='permitted' AND s\.withdrawn_at IS NULL AND s\.deleted_at IS NULL/);
  assert.match(pages, /NOT BETWEEN 2 AND 200/);
  assert.match(pages, /p_limit NOT BETWEEN 1 AND 10/);
  assert.match(pages, /document_page_search\(text,integer\) TO authenticated/);
  assert.match(pages, /add_document_page\([^)]*\) TO project_admin/);
});

test('every SECURITY DEFINER function pins search_path and never grants anon', () => {
  for (const text of [limits, pages]) {
    const defs = text.match(/^LANGUAGE .*SECURITY DEFINER/gm) ?? [];
    assert.equal((text.match(/SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp/g) ?? []).length, defs.length);
    assert.doesNotMatch(text, /GRANT[^;]*TO[^;]*\banon\b/);
  }
});
