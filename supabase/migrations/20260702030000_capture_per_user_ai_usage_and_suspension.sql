-- Repository capture of production-only migration "per_user_ai_usage_and_suspension"
-- (remote version 20260618001440). Idempotent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_user_suspended(p_user_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not is_hq_user() then
    raise exception 'Permission denied: HQ access required';
  end if;
  update public.profiles set is_suspended = p_suspended where id = p_user_id;
end;
$function$;
