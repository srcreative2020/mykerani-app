-- Public marketing site CMS: lets HQ_OWNER edit the landing page (logo,
-- hero copy, contact info, social/demo links) and FAQ entries without
-- touching code, while the marketing site itself reads this anonymously
-- (no login) since it must be visible to visitors before they register.

CREATE TABLE IF NOT EXISTS public.site_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'MyKerani',
  logo_url text,
  hero_headline text NOT NULL DEFAULT 'Manage Your Business Finances Without Hiring A Full-Time Accounts Clerk',
  hero_subheadline text NOT NULL DEFAULT 'Track income, expenses, receipts, invoices and financial documents with the help of AI.',
  contact_email text,
  contact_phone text,
  contact_whatsapp text,
  contact_address text,
  business_hours text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  demo_video_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.faq_items (question, answer, sort_order) VALUES
  ('Apa itu MyKerani?', 'MyKerani adalah pembantu kewangan AI yang membantu perniagaan menguruskan pendapatan, perbelanjaan, resit dan dokumen kewangan secara automatik.', 1),
  ('Bagaimana ia berbeza dengan perisian perakaunan biasa?', 'MyKerani menggunakan AI untuk mengekstrak dan mencadangkan rekod kewangan secara automatik daripada resit dan dokumen, mengurangkan kerja manual.', 2),
  ('Bolehkah saya guna storan saya sendiri?', 'Pada masa ini storan disediakan terus oleh MyKerani melalui pelan langganan anda.', 3),
  ('Bolehkah saya jemput kakitangan?', 'Ya, pemilik syarikat boleh menjemput kakitangan dengan kebenaran akses yang ditetapkan.', 4)
ON CONFLICT DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

-- Public marketing site needs anonymous read access (visitors aren't logged in yet).
CREATE POLICY site_settings_public_read ON public.site_settings FOR SELECT USING (true);
CREATE POLICY faq_items_public_read ON public.faq_items FOR SELECT USING (is_published = true);

-- Only HQ_OWNER/HQ_STAFF may edit site content.
CREATE POLICY site_settings_hq_write ON public.site_settings FOR ALL
  USING (public.is_hq_user()) WITH CHECK (public.is_hq_user());
CREATE POLICY faq_items_hq_write ON public.faq_items FOR ALL
  USING (public.is_hq_user()) WITH CHECK (public.is_hq_user());

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.faq_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faq_items TO authenticated;
