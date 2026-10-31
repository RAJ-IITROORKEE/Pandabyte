-- Internal canonical lexical index. No customer SELECT/RPC grants are added.
-- An expression index avoids an additional mutable evidence field; purging text
-- automatically removes its lexical entries in the same transaction.
CREATE INDEX panda_agent_chunks_lexical ON public.panda_agent_chunks
USING gin (to_tsvector('pg_catalog.simple'::regconfig, coalesce(chunk_text,'')));
