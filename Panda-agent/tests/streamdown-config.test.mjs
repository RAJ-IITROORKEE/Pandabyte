import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Streamdown } from 'streamdown';
import { rehypePlugins, makeUrlTransform } from '../src/ui/streamdown-config.ts';

const targets = new Map([['S1', '#source-m1-S1']]);
function render(md) {
  return renderToStaticMarkup(React.createElement(Streamdown, { mode: 'static', isAnimating: false, skipHtml: true, rehypePlugins, urlTransform: makeUrlTransform(targets), components: { img: () => null } }, md));
}

test('url transform accepts only http(s) without credentials and this message citations', () => {
  const t = makeUrlTransform(targets);
  assert.equal(t('https://example.com/a', 'href'), 'https://example.com/a');
  assert.equal(t('#source-m1-S1', 'href'), '#source-m1-S1');
  for (const u of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', '/x', '#source-other-S9', 'https://u:p@example.com/']) assert.equal(t(u, 'href'), '');
  assert.equal(t('https://example.com/i.png', 'src'), '');
});

test('hostile markdown renders no image, script, handler or dangerous link', () => {
  const html = render('![x](https://evil.com/a.png) ![d](data:image/png;base64,AAAA) <script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="https://evil.com"></iframe> [bad](javascript:alert(1)) [ok](https://example.com)');
  // raw HTML may only appear escaped as text; no live element, handler, src or javascript: href
  assert.doesNotMatch(html, /<(img|script|iframe)|<[^>]*\s(on\w+|src)=|href="(javascript|data):|evil\.com\/a\.png/i);
  assert.match(html, /data-streamdown="link"[^>]*>ok</);
});
