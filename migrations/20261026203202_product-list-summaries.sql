-- Legacy public summary lists must omit rich document bodies too.
ALTER FUNCTION public.published_list_records(text,text,integer,integer) RENAME TO product_editor_list_records_before;
CREATE FUNCTION public.published_list_records(p_kind text,p_query text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 result:=public.product_editor_list_records_before(p_kind,p_query,p_limit,p_offset);
 RETURN jsonb_set(result,'{items}',COALESCE((SELECT jsonb_agg(jsonb_set(item,'{document}',(item->'document')-'richContent') ORDER BY ord) FROM jsonb_array_elements(result->'items') WITH ORDINALITY i(item,ord)),'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.product_editor_list_records_before(text,text,integer,integer),public.published_list_records(text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_records(text,text,integer,integer) TO anon,authenticated;
