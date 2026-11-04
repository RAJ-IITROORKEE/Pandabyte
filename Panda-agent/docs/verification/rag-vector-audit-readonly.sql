-- Aggregate-only audit. Calls the existing read-only candidate/eligibility functions.
-- No source text, vector values, identifiers, credentials, or per-row hashes are returned.
WITH candidate AS MATERIALIZED (
  SELECT (public.panda_agent_runtime_candidate()).id AS id
), eligible AS MATERIALIZED (
  SELECT e.document_version_id, e.logical_chunk_id, e.chunk_version_id, e.chunk_text, e.text_hash, e.generation
  FROM candidate c CROSS JOIN LATERAL public.panda_agent_runtime_eligible(c.id) e
), allowed AS MATERIALIZED (
  SELECT * FROM eligible WHERE logical_chunk_id NOT IN (
    '21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4',
    '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac'
  )
), configured AS MATERIALIZED (
  SELECT s.* FROM public.panda_agent_embedding_sets s JOIN candidate c ON c.id=s.release_id
  WHERE s.config_hash='2ac4d2e6ef8e173c5cd733ed07a5b23cd42f57eacd3546b4d12f37dab6373f14'
), vectors AS MATERIALIZED (
  SELECT e.* FROM public.panda_agent_embeddings e
  WHERE e.config_hash='2ac4d2e6ef8e173c5cd733ed07a5b23cd42f57eacd3546b4d12f37dab6373f14'
)
SELECT
 (SELECT count(*) FROM candidate) AS candidate_count,
 (SELECT count(*) FROM configured) AS set_count,
 (SELECT count(*) FROM configured WHERE ready AND model='perplexity/pplx-embed-v1-0.6b' AND dimensions=1024
   AND input_policy='exact-canonical-body-v1-no-prefix' AND expected_count=282
   AND manifest_hash='0ebfec3480bffa6c53304bb0f3d6333b2b81eb466e8cadb488a869cf3aff6ffa') AS ready_matching_set_count,
 (SELECT count(*) FROM eligible) AS eligible_count,
 (SELECT count(*) FROM eligible WHERE logical_chunk_id IN (
   '21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4',
   '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac')) AS blocked_eligible_count,
 (SELECT count(DISTINCT logical_chunk_id) FROM eligible WHERE logical_chunk_id IN (
   '21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4',
   '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac')) AS blocked_distinct_count,
 (SELECT count(*) FROM allowed) AS allowed_count,
 (SELECT count(*) FROM eligible WHERE encode(sha256(convert_to(chunk_text,'UTF8')),'hex') IS DISTINCT FROM text_hash) AS inconsistent_text_count,
 (SELECT count(*) FROM vectors) AS vector_count,
 (SELECT count(DISTINCT text_hash) FROM vectors) AS unique_input_count,
 (SELECT count(*) FROM vectors WHERE public.vector_dims(embedding)<>1024 OR (embedding OPERATOR(public.<#>) embedding)>=0) AS invalid_vector_count,
 (SELECT count(*) FROM vectors WHERE logical_chunk_id IN (
   '21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4',
   '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac')) AS blocked_vector_count,
 (SELECT count(*) FROM allowed a LEFT JOIN vectors v ON v.document_version_id=a.document_version_id AND v.logical_chunk_id=a.logical_chunk_id
   WHERE v.document_version_id IS NULL) AS missing_vector_count,
 (SELECT count(*) FROM vectors v LEFT JOIN allowed a ON v.document_version_id=a.document_version_id AND v.logical_chunk_id=a.logical_chunk_id
   WHERE a.document_version_id IS NULL OR v.chunk_version_id IS DISTINCT FROM a.chunk_version_id
     OR v.text_hash IS DISTINCT FROM a.text_hash OR v.generation IS DISTINCT FROM a.generation) AS inconsistent_vector_count;
