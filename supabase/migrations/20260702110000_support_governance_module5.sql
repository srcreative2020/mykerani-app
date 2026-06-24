-- HQ Foundation Module 5: Support Governance.
-- The entire HQ Console "Sokongan" (support tickets) page was localStorage-only,
-- keyed per-browser-per-HQ-user (`mykerani_tickets_${user.id}`), meaning tickets
-- were invisible across HQ staff and lost on cache clear — no real backing store
-- existed at all. This migration adds the real persistent table set.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_email text,
  subject text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  summary text,
  assigned_to text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author text NOT NULL,
  reply_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_support_tickets ON public.support_tickets;
CREATE POLICY hq_manage_support_tickets ON public.support_tickets
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

DROP POLICY IF EXISTS hq_manage_support_ticket_replies ON public.support_ticket_replies;
CREATE POLICY hq_manage_support_ticket_replies ON public.support_ticket_replies
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_id ON public.support_ticket_replies(ticket_id);
