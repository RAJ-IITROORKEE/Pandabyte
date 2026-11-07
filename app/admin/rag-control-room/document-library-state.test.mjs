import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProductListings, parseDocumentSearch } from './document-library-state.ts';

test('fallback search matches literal title or SKU without inventing a match', () => {
  const rows = [{ title:'Board Alpha', sku:'SKU-A' }, { title:'Sensor', sku:'BETA-2' }];
  assert.deepEqual(filterProductListings(rows, ' alpha '), [rows[0]]);
  assert.deepEqual(filterProductListings(rows, 'beta'), [rows[1]]);
  assert.deepEqual(filterProductListings(rows, '%'), []);
  assert.deepEqual(filterProductListings(rows, 'alpha sku'), []);
  assert.deepEqual(filterProductListings(rows, ''), rows);
});

test('document search accepts only correlated versioned passages and honest empty results', () => {
  const source = { kind:'uploaded_document', reference:'doc-a', version:2, title:'Guide', ordinal:1, sectionPath:['Setup'] };
  const result = { outcome:'retrieved', retrieval:'lexical', relevance:'unverified', passages:[{ rank:1, text:'Captured text', source }] };
  assert.deepEqual(parseDocumentSearch(result, 'doc-a', 2, 'Guide'), result);
  assert.equal(parseDocumentSearch(result, 'doc-b', 2, 'Guide'), null);
  assert.equal(parseDocumentSearch(result, 'doc-a', 3, 'Guide'), null);
  assert.equal(parseDocumentSearch(result, 'doc-a', 2, 'Other'), null);
  assert.equal(parseDocumentSearch({ ...result, passages:[] }, 'doc-a', 2, 'Guide'), null);
  assert.deepEqual(parseDocumentSearch({ ...result, outcome:'insufficient', passages:[] }, 'doc-a', 2, 'Guide')?.passages, []);
});
