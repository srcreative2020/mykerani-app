import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getSiteSettings, getFaqItems, type SiteSettings, type FaqItem } from "../lib/hqService";
import {
  ArrowRight, PlayCircle, Receipt, FileWarning, HelpCircle, Mail, Phone,
  MessageCircle, MapPin, Clock, ChevronDown, Sparkles, Upload, Wand2,
  CheckCircle2, FileSpreadsheet, Building2, Banknote,
} from "lucide-react";

interface PlanRow {
  id: string;
  name: string;
  price: number;
  features: string[];
  limitations: string[];
  isTrial: boolean;
  isCustomPricing: boolean;
  featured: boolean;
}

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

const BUSINESS_TYPES = [
  "Freelancer", "Penjual Online", "Perniagaan Makanan", "Kontraktor",
  "Kedai Runcit", "Perniagaan Servis", "Agensi", "PKS", "Syarikat Berkembang",
];

const COST_CARDS = [
  { icon: Receipt, label: "Resit Hilang" },
  { icon: FileWarning, label: "Bil Tertinggal" },
  { icon: Banknote, label: "Aliran Tunai Tidak Diketahui" },
  { icon: FileSpreadsheet, label: "Dokumen Tidak Tersusun" },
  { icon: FileWarning, label: "Sukar Sediakan Laporan" },
  { icon: Building2, label: "Sukar Mohon Pembiayaan" },
  { icon: Receipt, label: "Bayar Untuk Rekod Manual" },
];

const HOW_IT_WORKS = [
  { icon: Upload, label: "Muat Naik Resit" },
  { icon: Wand2, label: "AI Ekstrak Maklumat" },
  { icon: Sparkles, label: "AI Cadangkan Rekod" },
  { icon: CheckCircle2, label: "Pengguna Sahkan" },
  { icon: FileSpreadsheet, label: "Rekod Kewangan Disimpan" },
  { icon: FileSpreadsheet, label: "Laporan Sedia Bila-bila" },
];

const WHAT_CAN_BE_MANAGED = [
  "Pendapatan", "Perbelanjaan", "Resit", "Invois", "Penyata Bank",
  "Belum Terima", "Belum Bayar", "Hutang", "Bil", "Komitmen",
  "Aliran Tunai", "Laporan", "Dokumen Kewangan",
];

const BENEFITS = [
  "Jimat Masa", "Kurangkan Kerja Manual", "Kurangkan Kos Rekod Kewangan",
  "Susun Dokumen Kewangan", "Sedia Untuk Keperluan Cukai",
  "Sedia Untuk Permohonan Pembiayaan", "Tingkatkan Penglihatan Kewangan",
];

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onRegister }) => {
  const { signIn } = useAuth();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoChat] = useState([
    { q: "Saya bayar minyak RM80", a: "Kategori dicadangkan: Pengangkutan · Jumlah: RM80.00 · Simpan rekod?" },
    { q: "Apa bil yang perlu dibayar?", a: "Anda ada 2 bil tertunggak: Sewa Pejabat (RM1,200) dan Internet (RM99), jatuh tempoh minggu ini." },
    { q: "Ringkaskan bulan ini", a: "Pendapatan RM12,400 · Perbelanjaan RM7,850 · Untung Bersih RM4,550 · Aliran tunai sihat." },
  ]);

  useEffect(() => {
    getSiteSettings().then(setSettings);
    getFaqItems().then(setFaqs);
    if (isSupabaseConfigured() && supabase) {
      supabase.from("subscription_plans").select("*").order("monthly_price_myr", { ascending: true })
        .then(({ data }) => setPlans((data || []).map((row: any) => ({
          id: row.id, name: row.name, price: Number(row.monthly_price_myr) || 0,
          features: row.features?.featureList ?? [], limitations: row.features?.limitations ?? [],
          isTrial: row.features?.isTrial ?? false, isCustomPricing: row.features?.isCustomPricing ?? false,
          featured: row.features?.featured ?? false,
        }))));
    }
  }, []);

  const companyName = settings?.companyName || "MyKerani";

  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      await signIn("owner@mykerani.demo", "");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans" id="landing_page_root">
      {/* Top Nav */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden">
              {settings?.logoUrl ? <img src={settings.logoUrl} alt={companyName} className="w-full h-full object-cover" /> : <span className="text-white font-extrabold text-xs">MK</span>}
            </div>
            <span className="font-display font-bold text-sm tracking-tight">{companyName.toUpperCase()}</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-500">
            <a href="#features" className="hover:text-slate-900">Ciri-ciri</a>
            <a href="#who" className="hover:text-slate-900">Untuk Siapa</a>
            <a href="#pricing" className="hover:text-slate-900">Harga</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
            <a href="#contact" className="hover:text-slate-900">Hubungi</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={onLogin} className="px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer">Log Masuk</button>
            <button onClick={onRegister} className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition">Daftar</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-14 pb-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="space-y-5">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight leading-tight">
            {settings?.heroHeadline || "Urus Kewangan Perniagaan Anda Tanpa Mengupah Kerani Sepenuh Masa"}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            {settings?.heroSubheadline || "Jejak pendapatan, perbelanjaan, resit, invois dan dokumen kewangan dengan bantuan AI. Sentiasa tersusun untuk laporan, persediaan cukai, permohonan pembiayaan dan keputusan perniagaan masa depan."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={onRegister} className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-indigo-700 transition shadow-sm">
              Mula Percubaan Percuma <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={handleTryDemo} disabled={demoLoading} className="flex items-center gap-2 px-5 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition disabled:opacity-50">
              <PlayCircle className="w-4 h-4" /> {demoLoading ? "Memuatkan..." : "Lihat Demo (Tanpa Daftar)"}
            </button>
          </div>
        </div>
        <div className="bg-slate-900 rounded-3xl p-5 shadow-2xl">
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
              <Sparkles className="w-4 h-4" /> Kerani Kewangan AI
            </div>
            {demoChat.map((c, i) => (
              <div key={i} className="space-y-1.5">
                <div className="self-end bg-indigo-600 text-white text-xs rounded-2xl rounded-tr-sm px-3 py-2 inline-block max-w-[85%]">{c.q}</div>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-xs rounded-2xl rounded-tl-sm px-3 py-2 max-w-[90%]">{c.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cost of poor records */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-2">Kos Rekod Kewangan Yang Tidak Tersusun</h2>
        <p className="text-xs text-slate-400 text-center mb-8">Banyak perniagaan kehilangan masa dan wang akibat rekod yang tidak diuruskan.</p>
        <div className="grid sm:grid-cols-3 md:grid-cols-4 gap-3">
          {COST_CARDS.map((c, i) => (
            <div key={i} className="border border-slate-100 rounded-2xl p-4 text-center space-y-2 bg-slate-50/50">
              <c.icon className="w-5 h-5 text-rose-500 mx-auto" />
              <p className="text-[11px] font-semibold text-slate-700">{c.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Bagaimana MyKerani Berfungsi</h2>
        <div className="flex flex-wrap justify-center items-center gap-3">
          {HOW_IT_WORKS.map((s, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-2 w-28 text-center">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><s.icon className="w-5 h-5 text-indigo-600" /></div>
                <p className="text-[10px] font-semibold text-slate-600 leading-tight">{s.label}</p>
              </div>
              {i < HOW_IT_WORKS.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Who should use */}
      <section id="who" className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Siapa Patut Guna MyKerani</h2>
        <div className="flex flex-wrap justify-center gap-2.5">
          {BUSINESS_TYPES.map((b, i) => (
            <span key={i} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs font-semibold text-slate-700">{b}</span>
          ))}
        </div>
      </section>

      {/* What can be managed */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Apa Yang Boleh Diuruskan</h2>
        <div className="flex flex-wrap justify-center gap-2.5">
          {WHAT_CAN_BE_MANAGED.map((b, i) => (
            <span key={i} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">{b}</span>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Mengapa Pemilik Perniagaan Pilih MyKerani</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {BENEFITS.map((b, i) => (
            <div key={i} className="flex items-center gap-2 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Live demo workspace */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100 text-center space-y-4">
        <h2 className="text-xl font-display font-bold">Cuba Ruang Kerja Demo</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">Jelajahi papan pemuka, transaksi, dokumen, laporan dan pembantu AI tanpa perlu mendaftar — tiada e-mel, tiada kata laluan, tiada akaun dicipta.</p>
        <button onClick={handleTryDemo} disabled={demoLoading} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-slate-800 transition disabled:opacity-50">
          {demoLoading ? "Memuatkan..." : "Cuba Demo Sekarang"}
        </button>
      </section>

      {/* Pricing — DB-driven, never hardcoded */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Harga</h2>
        {plans.length === 0 ? (
          <p className="text-center text-xs text-slate-400">Pelan harga belum disediakan oleh HQ.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {plans.map(p => (
              <div key={p.id} className={`border rounded-2xl p-5 space-y-3 ${p.featured ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"}`}>
                <p className="font-bold text-slate-900">{p.name}</p>
                {p.isCustomPricing ? (
                  <p className="text-lg font-bold text-slate-900">Harga Tersuai</p>
                ) : (
                  <p className="text-2xl font-bold text-slate-900">RM {p.price.toLocaleString()}<span className="text-xs text-slate-400 font-normal">/bln</span></p>
                )}
                <ul className="text-[10px] text-emerald-700 space-y-1">
                  {p.features.slice(0, 6).map((f, i) => <li key={i}>+ {f}</li>)}
                </ul>
                {p.isTrial ? (
                  <button onClick={onRegister} className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition">Mula Percubaan Percuma</button>
                ) : p.isCustomPricing ? (
                  <a href={`mailto:${settings?.contactEmail || "sales@mykerani.com"}`} className="w-full block text-center py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition">Hubungi Jualan</a>
                ) : (
                  <button onClick={onRegister} className="w-full py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition">Langgan</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FAQ — DB-driven */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8 flex items-center justify-center gap-2"><HelpCircle className="w-5 h-5 text-indigo-500" /> Soalan Lazim</h2>
        <div className="space-y-2">
          {faqs.map(f => (
            <div key={f.id} className="border border-slate-100 rounded-xl">
              <button onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)} className="w-full flex items-center justify-between p-4 text-left cursor-pointer">
                <span className="text-sm font-semibold text-slate-800">{f.question}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition shrink-0 ${openFaq === f.id ? "rotate-180" : ""}`} />
              </button>
              {openFaq === f.id && <p className="px-4 pb-4 text-xs text-slate-500 leading-relaxed">{f.answer}</p>}
            </div>
          ))}
          {faqs.length === 0 && <p className="text-center text-xs text-slate-400">Tiada soalan lazim lagi.</p>}
        </div>
      </section>

      {/* Contact — DB-driven */}
      <section id="contact" className="max-w-6xl mx-auto px-5 py-14 border-t border-slate-100">
        <h2 className="text-xl font-display font-bold text-center mb-8">Hubungi Kami</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {settings?.contactEmail && (
            <div className="p-4 border border-slate-100 rounded-xl space-y-1.5"><Mail className="w-4 h-4 text-indigo-500 mx-auto" /><p className="text-xs font-semibold text-slate-700">{settings.contactEmail}</p></div>
          )}
          {settings?.contactPhone && (
            <div className="p-4 border border-slate-100 rounded-xl space-y-1.5"><Phone className="w-4 h-4 text-indigo-500 mx-auto" /><p className="text-xs font-semibold text-slate-700">{settings.contactPhone}</p></div>
          )}
          {settings?.contactWhatsapp && (
            <div className="p-4 border border-slate-100 rounded-xl space-y-1.5"><MessageCircle className="w-4 h-4 text-indigo-500 mx-auto" /><p className="text-xs font-semibold text-slate-700">{settings.contactWhatsapp}</p></div>
          )}
          {settings?.contactAddress && (
            <div className="p-4 border border-slate-100 rounded-xl space-y-1.5"><MapPin className="w-4 h-4 text-indigo-500 mx-auto" /><p className="text-xs font-semibold text-slate-700">{settings.contactAddress}</p></div>
          )}
          {settings?.businessHours && (
            <div className="p-4 border border-slate-100 rounded-xl space-y-1.5"><Clock className="w-4 h-4 text-indigo-500 mx-auto" /><p className="text-xs font-semibold text-slate-700">{settings.businessHours}</p></div>
          )}
          {!settings?.contactEmail && !settings?.contactPhone && !settings?.contactWhatsapp && !settings?.contactAddress && (
            <p className="col-span-full text-xs text-slate-400">Maklumat hubungan belum disediakan oleh HQ.</p>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-900 text-white text-center py-16 px-5">
        <h2 className="text-2xl font-display font-bold mb-2">Hentikan Cara Susah Urus Kewangan</h2>
        <p className="text-sm text-slate-300 mb-6">Mula susun rekod kewangan anda hari ini.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onRegister} className="px-6 py-3 bg-white text-slate-900 rounded-2xl text-sm font-bold cursor-pointer hover:bg-slate-100 transition">Mula Percubaan Percuma</button>
          <button onClick={onRegister} className="px-6 py-3 border border-white/30 rounded-2xl text-sm font-bold cursor-pointer hover:bg-white/10 transition">Daftar Sekarang</button>
        </div>
      </section>

      <footer className="text-center py-6 text-[11px] text-slate-400 space-y-2">
        {settings?.socialLinks && Object.keys(settings.socialLinks).length > 0 && (
          <div className="flex items-center justify-center gap-4">
            {Object.entries(settings.socialLinks).map(([platform, url]) => (
              <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-500 hover:text-slate-800 transition">
                {platform}
              </a>
            ))}
          </div>
        )}
        <p>© {new Date().getFullYear()} {companyName}. Hak cipta terpelihara.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
