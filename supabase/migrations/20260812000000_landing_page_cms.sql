-- Landing Page CMS content table
CREATE TABLE IF NOT EXISTS landing_page_sections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  section_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  icon_emoji TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE landing_page_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_manage_landing_sections" ON landing_page_sections
  FOR ALL TO authenticated USING (is_hq_user()) WITH CHECK (is_hq_user());

CREATE POLICY "anon_read_visible_landing_sections" ON landing_page_sections
  FOR SELECT TO anon USING (is_visible = true);

CREATE POLICY "authenticated_read_landing_sections" ON landing_page_sections
  FOR SELECT TO authenticated USING (true);

-- Seed: Masalah Pelanggan (Problem section)
INSERT INTO landing_page_sections (section_key, label, icon_emoji, sort_order) VALUES
('problem', 'Resit Hilang', '🧾', 1),
('problem', 'Bil Tertinggal', '📋', 2),
('problem', 'Aliran Tunai Tidak Diketahui', '💸', 3),
('problem', 'Dokumen Tidak Tersusun', '📁', 4),
('problem', 'Sukar Sediakan Laporan', '⚠️', 5),
('problem', 'Sukar Mohon Pembiayaan', '🏢', 6),
('problem', 'Bayar Untuk Rekod Manual', '💰', 7);

-- Seed: Cara MyKerani Berfungsi
INSERT INTO landing_page_sections (section_key, label, icon_emoji, sort_order) VALUES
('how_it_works', 'Muat Naik Dokumen', '📤', 1),
('how_it_works', 'AI Ekstrak Maklumat', '✨', 2),
('how_it_works', 'AI Cadangkan Rekod', '🤖', 3),
('how_it_works', 'Pengguna Sahkan', '✅', 4),
('how_it_works', 'Rekod Disimpan', '💾', 5),
('how_it_works', 'Laporan Sedia', '📊', 6);

-- Seed: Sasaran Pengguna
INSERT INTO landing_page_sections (section_key, label, sort_order) VALUES
('target_users', 'Freelancer', 1),
('target_users', 'Penjual Online', 2),
('target_users', 'Perniagaan Makanan', 3),
('target_users', 'Kontraktor', 4),
('target_users', 'Kedai Runcit', 5),
('target_users', 'Perniagaan Servis', 6),
('target_users', 'Agensi', 7),
('target_users', 'PKS', 8),
('target_users', 'Syarikat Berkembang', 9);

-- Seed: Apa Yang Boleh Diuruskan
INSERT INTO landing_page_sections (section_key, label, sort_order) VALUES
('what_managed', 'Pendapatan', 1),
('what_managed', 'Perbelanjaan', 2),
('what_managed', 'Resit', 3),
('what_managed', 'Invois', 4),
('what_managed', 'Penyata Bank', 5),
('what_managed', 'Belum Terima', 6),
('what_managed', 'Belum Bayar', 7),
('what_managed', 'Hutang', 8),
('what_managed', 'Bil', 9),
('what_managed', 'Komitmen', 10),
('what_managed', 'Aliran Tunai', 11),
('what_managed', 'Laporan', 12),
('what_managed', 'Dokumen Kewangan', 13);

-- Seed: Kelebihan MyKerani (Benefits)
INSERT INTO landing_page_sections (section_key, label, icon_emoji, sort_order) VALUES
('benefits', 'Jimat Masa', '⏱️', 1),
('benefits', 'Kurangkan Kerja Manual', '📉', 2),
('benefits', 'Kurangkan Kos Rekod Kewangan', '💡', 3),
('benefits', 'Susun Dokumen Kewangan', '📂', 4),
('benefits', 'Sedia Untuk Keperluan Cukai', '🗂️', 5),
('benefits', 'Sedia Untuk Permohonan Pembiayaan', '🏦', 6),
('benefits', 'Tingkatkan Penglihatan Kewangan', '📈', 7);
