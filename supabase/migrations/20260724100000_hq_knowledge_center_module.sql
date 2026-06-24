-- HQ Phase 2 — net-new Module: HQ Knowledge Center.
--
-- Approved as a distinct Phase 2 module (not a rename/alias of the public
-- FAQ / Website CMS in public_site_cms, which is tenant/public-facing
-- marketing content). Knowledge Center is an internal-only HQ knowledge
-- base — runbooks, support scripts, troubleshooting notes — never exposed
-- to tenants.
--
-- Owner/Staff Parity: per MYKERANI_OWNER_STAFF_PARITY_RULE.md this module
-- is HQ-internal tooling, not one of the five financial engines the parity
-- rule governs (OCR/AI processing/voice/business mapping/branch mapping/
-- evidence linking/import recovery/learning memory/duplicate detection/
-- ledger processing) — parity rule does not apply to module access itself,
-- but HQ_OWNER and HQ_STAFF still get equal create/update rights here so
-- neither role is blocked from keeping the knowledge base current;
-- deletion is HQ_OWNER-only as the higher-blast-radius action.
--
-- HQ Impact: closes the "Knowledge flow" gap — support replies, onboarding,
-- and incident response previously relied on tribal knowledge with no
-- shared record. Tenant Impact: none directly — articles are HQ-internal;
-- indirect benefit via faster/more consistent support ticket replies
-- (cross-module link below). Notification impact: none (a reference
-- library is not an alert source). Audit impact: every create/update/
-- delete is audited. Resource/Billing impact: none.

CREATE TABLE IF NOT EXISTS public.hq_knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_knowledge_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_read_knowledge_articles ON public.hq_knowledge_articles;
CREATE POLICY hq_read_knowledge_articles ON public.hq_knowledge_articles
  FOR SELECT USING (is_hq_user());

GRANT SELECT ON public.hq_knowledge_articles TO authenticated;

CREATE OR REPLACE FUNCTION public.create_hq_knowledge_article(p_title text, p_body text, p_category text DEFAULT 'general')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  insert into public.hq_knowledge_articles (title, body, category, created_by, updated_by)
  values (p_title, p_body, coalesce(p_category, 'general'), auth.uid(), auth.uid())
  returning id into v_id;

  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_actor_tenant,
    'Knowledge Center', 'CREATE',
    null,
    jsonb_build_object('id', v_id, 'title', p_title, 'category', p_category)
  );

  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_hq_knowledge_article(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_hq_knowledge_article(p_id uuid, p_title text, p_body text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old record;
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;

  select * into v_old from public.hq_knowledge_articles where id = p_id;
  if v_old.id is null then
    raise exception 'Knowledge article not found';
  end if;

  update public.hq_knowledge_articles
  set title = coalesce(p_title, title),
      body = coalesce(p_body, body),
      category = coalesce(p_category, category),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id;

  select email, role, tenant_id into v_actor_email, v_actor_role, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), coalesce(v_actor_role, 'HQ'), v_actor_tenant,
    'Knowledge Center', 'UPDATE',
    jsonb_build_object('title', v_old.title, 'category', v_old.category),
    jsonb_build_object('id', p_id, 'title', coalesce(p_title, v_old.title), 'category', coalesce(p_category, v_old.category))
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.update_hq_knowledge_article(uuid, text, text, text) TO authenticated;

-- Delete restricted to HQ_OWNER — the higher-blast-radius action in this
-- module's parity decision.
CREATE OR REPLACE FUNCTION public.delete_hq_knowledge_article(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old record;
  v_actor_email text;
  v_actor_role text;
  v_actor_tenant uuid;
begin
  select role into v_actor_role from public.user_role_assignments where user_id = auth.uid()::text;
  if v_actor_role is distinct from 'HQ_OWNER' then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select * into v_old from public.hq_knowledge_articles where id = p_id;
  if v_old.id is null then
    raise exception 'Knowledge article not found';
  end if;

  delete from public.hq_knowledge_articles where id = p_id;

  select email, tenant_id into v_actor_email, v_actor_tenant
  from public.user_role_assignments where user_id = auth.uid()::text and tenant_id in (
    select tenant_id from public.tenants where category = 'HQ'
  ) limit 1;

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (
    auth.uid()::text, coalesce(v_actor_email, 'hq'), 'HQ_OWNER', v_actor_tenant,
    'Knowledge Center', 'DELETE',
    jsonb_build_object('id', v_old.id, 'title', v_old.title, 'category', v_old.category),
    null
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_hq_knowledge_article(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hq_knowledge_articles(p_category text DEFAULT NULL)
RETURNS SETOF public.hq_knowledge_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query
  select * from public.hq_knowledge_articles
  where p_category is null or category = p_category
  order by updated_at desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_knowledge_articles(text) TO authenticated;

-- Cross-module dependency: lets the support ticket reply workflow insert
-- knowledge-base content directly into a reply without re-typing it,
-- closing a real cross-module gap (consistent, faster ticket replies)
-- instead of leaving Knowledge Center isolated from the rest of the
-- ecosystem. Reuses the existing hq_reply_support_ticket() RPC — no new
-- support-side RPC needed; the UI composes the reply text client-side from
-- the selected article body before calling it.
CREATE OR REPLACE FUNCTION public.get_hq_knowledge_article_for_reply(p_id uuid)
RETURNS TABLE (title text, body text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  return query select a.title, a.body from public.hq_knowledge_articles a where a.id = p_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hq_knowledge_article_for_reply(uuid) TO authenticated;
