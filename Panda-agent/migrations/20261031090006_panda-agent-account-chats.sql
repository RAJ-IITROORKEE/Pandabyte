-- Additive account-owned chat history. No corpus, identity, runtime or commerce changes.
-- Forward-only: to withdraw this feature revoke these RPCs; preserve owner histories.
CREATE TABLE public.panda_agent_chats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_subject text NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 512),
 title text NOT NULL DEFAULT 'New chat' CHECK(length(title) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX panda_agent_chats_owner_recent ON public.panda_agent_chats(owner_subject,updated_at DESC,id);
CREATE TABLE public.panda_agent_chat_turns (
 thread_id uuid NOT NULL REFERENCES public.panda_agent_chats(id),
 request_id uuid NOT NULL,
 user_message_id uuid NOT NULL DEFAULT gen_random_uuid(),
 assistant_message_id uuid NOT NULL DEFAULT gen_random_uuid(),
 question text NOT NULL CHECK(length(btrim(question)) BETWEEN 1 AND 2000),
 finish_secret_hash text NOT NULL CHECK(finish_secret_hash ~ '^[a-f0-9]{64}$'),
 response jsonb CHECK(response IS NULL OR (jsonb_typeof(response)='object' AND octet_length(response::text)<=24000)),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(thread_id,request_id),
 CHECK((status='pending' AND response IS NULL AND completed_at IS NULL) OR (status='complete' AND response IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX panda_agent_chat_turns_order ON public.panda_agent_chat_turns(thread_id,created_at,request_id);
ALTER TABLE public.panda_agent_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_chat_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY panda_agent_chat_owner_read ON public.panda_agent_chats FOR SELECT TO authenticated
 USING(owner_subject=(SELECT public.requesting_user_id()));
CREATE POLICY panda_agent_chat_turn_owner_read ON public.panda_agent_chat_turns FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.panda_agent_chats c WHERE c.id=thread_id AND c.owner_subject=(SELECT public.requesting_user_id())));
-- No direct runtime table writes or reads: the bounded RPCs below are the surface.
REVOKE ALL ON public.panda_agent_chats,public.panda_agent_chat_turns FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_chat_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats; ms jsonb; ts jsonb; st text;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT CASE WHEN bool_or(status='pending' AND created_at<now()-interval '5 minutes') THEN 'blocked'
 WHEN bool_or(status='pending') THEN 'pending' ELSE 'idle' END INTO st
 FROM public.panda_agent_chat_turns WHERE thread_id=c.id;
 SELECT coalesce(jsonb_agg(v ORDER BY at,seq,rid),'[]'::jsonb) INTO ms FROM (
 SELECT jsonb_build_object('id',user_message_id,'role','user','text',question,'createdAt',created_at,'citations','[]'::jsonb) v,created_at at,0 seq,request_id rid
 FROM public.panda_agent_chat_turns WHERE thread_id=c.id
 UNION ALL
 SELECT jsonb_build_object('id',assistant_message_id,'role','assistant','text',response->>'text','createdAt',completed_at,'citations',coalesce(response->'citations','[]'::jsonb)),created_at,1,request_id
 FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND status='complete') m;
 SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'question',question,'response',response,'status',status,'createdAt',created_at) ORDER BY created_at,request_id),'[]'::jsonb)
 INTO ts FROM public.panda_agent_chat_turns WHERE thread_id=c.id;
 RETURN jsonb_build_object('thread',jsonb_build_object('id',c.id,'title',c.title,'updatedAt',c.updated_at,'status',st),'messages',ms,'turns',ts);
END $$;

CREATE FUNCTION public.panda_agent_chats_list() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); items jsonb;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY updated_at DESC,id),'[]'::jsonb) INTO items FROM (
 SELECT c.id,c.updated_at,jsonb_build_object('id',c.id,'title',c.title,'updatedAt',c.updated_at,'status',
 CASE WHEN EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=c.id AND t.status='pending' AND t.created_at<now()-interval '5 minutes') THEN 'blocked'
 WHEN EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=c.id AND t.status='pending') THEN 'pending' ELSE 'idle' END) v
 FROM public.panda_agent_chats c WHERE c.owner_subject=a ORDER BY c.updated_at DESC,c.id LIMIT 100) q;
 RETURN jsonb_build_object('threads',items);
END $$;

CREATE FUNCTION public.panda_agent_chat_create(p_title text DEFAULT 'New chat') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 100 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('panda-agent-chat:'||a,0));
 IF (SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=a)>=100 THEN PERFORM public.phase3_fail('quota'); END IF;
 INSERT INTO public.panda_agent_chats(owner_subject,title) VALUES(a,btrim(p_title)) RETURNING * INTO c;
 RETURN jsonb_build_object('thread',jsonb_build_object('id',c.id,'title',c.title,'updatedAt',c.updated_at,'status','idle'));
END $$;

CREATE FUNCTION public.panda_agent_chat_begin(p_thread uuid,p_request uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats; t public.panda_agent_chat_turns; result jsonb; token text;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request IS NULL OR p_question IS NULL OR length(btrim(p_question)) NOT BETWEEN 1 AND 2000 THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND request_id=p_request;
 IF FOUND THEN
  IF t.question<>btrim(p_question) THEN PERFORM public.phase3_fail('conflict'); END IF;
  result:=public.panda_agent_chat_read(c.id);
  RETURN result||jsonb_build_object('admitted',false,'turn',jsonb_build_object('requestId',t.request_id,'question',t.question,'response',t.response,'status',t.status));
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND status='pending') THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF (SELECT count(*) FROM public.panda_agent_chat_turns WHERE thread_id=c.id)>=100 THEN PERFORM public.phase3_fail('quota'); END IF;
 -- Only the admitting server receives this capability; replay and history never reveal it.
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 INSERT INTO public.panda_agent_chat_turns(thread_id,request_id,question,finish_secret_hash)
 VALUES(c.id,p_request,btrim(p_question),encode(sha256(convert_to(token,'UTF8')),'hex')) RETURNING * INTO t;
 UPDATE public.panda_agent_chats SET title=CASE WHEN title='New chat' THEN left(btrim(p_question),100) ELSE title END,updated_at=clock_timestamp() WHERE id=c.id;
 result:=public.panda_agent_chat_read(c.id);
 RETURN result||jsonb_build_object('admitted',true,'finishToken',token,'turn',jsonb_build_object('requestId',t.request_id,'question',t.question,'response',t.response,'status',t.status));
END $$;

CREATE FUNCTION public.panda_agent_chat_finish(p_thread uuid,p_request uuid,p_response jsonb,p_finish_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats; t public.panda_agent_chat_turns; cite jsonb;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_response IS NULL OR jsonb_typeof(p_response)<>'object' OR octet_length(p_response::text)>24000
 OR coalesce(jsonb_typeof(p_response->'text'),'')<>'string' OR length(p_response->>'text') NOT BETWEEN 1 AND 8000 OR p_response->>'text' ~ '^[[:space:]]*$'
 OR coalesce(jsonb_typeof(p_response->'citations'),'')<>'array' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF jsonb_array_length(p_response->'citations')>4 THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_response))<>3
 OR coalesce(p_response->>'outcome','') NOT IN ('evidence','clarification','insufficient','conflict') THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF ((p_response->>'outcome')='evidence')<>(jsonb_array_length(p_response->'citations')>0) THEN PERFORM public.phase3_fail('invalid'); END IF;
 FOR cite IN SELECT value FROM jsonb_array_elements(p_response->'citations') LOOP
  IF jsonb_typeof(cite)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(cite))<>6
  OR coalesce(cite->>'id','') !~ '^S[1-4]$'
  OR coalesce(jsonb_typeof(cite->'title'),'')<>'string' OR length(cite->>'title') NOT BETWEEN 1 AND 300 OR cite->>'title' ~ '^[[:space:]]*$'
  OR coalesce(cite->>'sourceUrl','') !~ '^https://(www\.)?pandabyte\.in/product-page/[A-Za-z0-9_-]+/?$'
  OR coalesce(jsonb_typeof(cite->'quote'),'')<>'string' OR length(cite->>'quote') NOT BETWEEN 1 AND 600 OR cite->>'quote' ~ '^[[:space:]]*$'
  OR coalesce(jsonb_typeof(cite->'capturedAt'),'')<>'string' OR length(cite->>'capturedAt') NOT BETWEEN 1 AND 50
  OR coalesce(cite->>'capturedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR coalesce(jsonb_typeof(cite->'sectionPath'),'')<>'array' THEN PERFORM public.phase3_fail('invalid'); END IF;
  IF jsonb_array_length(cite->'sectionPath')>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(cite->'sectionPath') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 200 OR (x#>>'{}') ~ '^[[:space:]]*$') THEN PERFORM public.phase3_fail('invalid'); END IF;
  BEGIN IF NOT isfinite((cite->>'capturedAt')::timestamptz) THEN PERFORM public.phase3_fail('invalid'); END IF; EXCEPTION WHEN OTHERS THEN PERFORM public.phase3_fail('invalid'); END;
 END LOOP;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND request_id=p_request FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF p_finish_token IS NULL OR p_finish_token !~ '^[a-f0-9]{64}$'
 OR encode(sha256(convert_to(p_finish_token,'UTF8')),'hex')<>t.finish_secret_hash THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF t.status='complete' THEN
  IF t.response<>p_response THEN PERFORM public.phase3_fail('conflict'); END IF;
 ELSE
  UPDATE public.panda_agent_chat_turns SET response=p_response,status='complete',completed_at=clock_timestamp() WHERE thread_id=c.id AND request_id=p_request;
  UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=c.id;
 END IF;
 RETURN public.panda_agent_chat_read(c.id);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_chat_read(uuid),public.panda_agent_chats_list(),public.panda_agent_chat_create(text),public.panda_agent_chat_begin(uuid,uuid,text),public.panda_agent_chat_finish(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chat_read(uuid),public.panda_agent_chats_list(),public.panda_agent_chat_create(text),public.panda_agent_chat_begin(uuid,uuid,text),public.panda_agent_chat_finish(uuid,uuid,jsonb,text) TO authenticated;
