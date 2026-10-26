-- Parenthesize the document projection before JSON subtraction; preserve catalog availability.
CREATE OR REPLACE FUNCTION public.published_list_products(p_query text,p_category_ids uuid[],p_min_price_paise bigint,p_max_price_paise bigint,p_availability text,p_sort text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 result:=public.product_editor_list_products_before(p_query,p_category_ids,p_min_price_paise,p_max_price_paise,p_availability,p_sort,p_limit,p_offset);
 RETURN jsonb_set(result,'{items}',COALESCE((SELECT jsonb_agg(jsonb_set(item,'{document}',(item->'document')-'richContent') ORDER BY ord) FROM jsonb_array_elements(result->'items') WITH ORDINALITY i(item,ord)),'[]'::jsonb));
END $f$;
