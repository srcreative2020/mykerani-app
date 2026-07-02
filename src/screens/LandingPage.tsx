import React, { useEffect, useRef, useState } from "react";
import { getSiteSettings, getFaqItems, getPlans, getLandingContent, type HqPlan, type SiteSettings, type FaqItem, type LandingSection } from "../lib/hqService";
import {
  ArrowRight, PlayCircle, HelpCircle, Mail, Phone,
  MessageCircle, MapPin, Clock, ChevronDown, Sparkles,
  CheckCircle2, Send, Bot,
} from "lucide-react";

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}


interface DemoMsg { role: "user" | "ai"; text: string; }

const DEMO_QA: { label: string; q: string; a: string }[] = [
  {
    label: "Rekod resit",
    q: "Saya bayar minyak RM80 tadi",
    a: "Rekod dicadangkan: Perbelanjaan · Pengangkutan · RM80.00 · Hari ini. Sahkan untuk simpan ke rekod kewangan anda?",
  },
  {
    label: "Semak bil",
    q: "Apa bil perlu dibayar minggu ini?",
    a: "2 bil tertunggak ditemui: Sewa Pejabat RM1,200 dan Internet RM99 — jatuh tempoh 3 hari lagi. Mahu saya sediakan peringatan?",
  },
  {
    label: "Ringkasan bulan",
    q: "Ringkaskan prestasi bulan ini",
    a: "Jun 2026 · Pendapatan RM12,400 · Perbelanjaan RM7,850 · Untung Bersih RM4,550 · Aliran tunai: Sihat ✓",
  },
  {
    label: "Analisa penyata",
    q: "Analisa penyata bank saya",
    a: "47 transaksi ditemui. 12 belum dikategorikan. Tiada duplikasi dikesan. Sedia untuk semakan dan pengesahan anda.",
  },
];

function useScrollReveal(dep?: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".sr-fade");
    if (!els.length) return;
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("sr-visible"); }),
      { threshold: 0.12 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function InteractiveDemo() {
  const [msgs, setMsgs] = useState<DemoMsg[]>([
    { role: "ai", text: "Selamat datang! Cuba tanya saya tentang kewangan perniagaan anda." },
  ]);
  const [typing, setTyping] = useState(false);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const handlePrompt = (idx: number) => {
    if (typing || used.has(idx)) return;
    const qa = DEMO_QA[idx];
    setUsed(prev => new Set(prev).add(idx));
    setMsgs(prev => [...prev, { role: "user", text: qa.q }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs(prev => [...prev, { role: "ai", text: qa.a }]);
    }, 900);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-[#E8E6DE]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E8E6DE] bg-[#F8F7F3]">
        <div className="w-8 h-8 rounded-xl bg-[#22c55e] flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-zinc-800">Kerani Kewangan AI</p>
          <p className="text-[10px] text-[#22c55e] font-semibold">Demo • Tidak menyimpan maklumat anda</p>
        </div>
      </div>

      {/* Messages */}
      <div className="h-48 overflow-y-auto px-4 py-3 space-y-2.5 bg-white">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] text-xs rounded-2xl px-3 py-2 leading-relaxed ${
                m.role === "user"
                  ? "bg-zinc-900 text-white rounded-tr-sm"
                  : "bg-[#F8F7F3] text-zinc-800 border border-[#E8E6DE] rounded-tl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-[#F8F7F3] border border-[#E8E6DE] rounded-2xl rounded-tl-sm px-3 py-2">
              <span className="inline-flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Prompts */}
      <div className="px-4 pb-4 pt-3 border-t border-[#E8E6DE] bg-[#F8F7F3]">
        <p className="text-[10px] text-zinc-400 font-semibold mb-2">Cuba tanya:</p>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_QA.map((qa, i) => (
            <button
              key={i}
              onClick={() => handlePrompt(i)}
              disabled={typing || used.has(i)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
                used.has(i)
                  ? "bg-[#F0FDF4] border-[#BEF3CC] text-[#16a34a] opacity-60"
                  : "bg-white border-[#E8E6DE] text-zinc-700 hover:border-[#22c55e] hover:text-[#16a34a]"
              } disabled:cursor-not-allowed`}
            >
              <Send className="w-3 h-3" />
              {qa.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const NAV_SECTIONS = ["features", "who", "pricing", "faq", "contact"];

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onRegister }) => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [plans, setPlans] = useState<HqPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [landingContent, setLandingContent] = useState<LandingSection[]>([]);

  useScrollReveal(`${plans.length}-${landingContent.length}-${faqs.length}-${settings ? 1 : 0}`);
  const activeSection = useActiveSection(NAV_SECTIONS);

  useEffect(() => {
    getSiteSettings().then(setSettings);
    getFaqItems().then(setFaqs);
    getLandingContent().then(setLandingContent);
    getPlans()
      .then(data => { setPlans(data); setPlansLoading(false); })
      .catch(() => { setPlansError(true); setPlansLoading(false); });
  }, []);

  const sectionItems = (key: string) => landingContent.filter(i => i.sectionKey === key).sort((a, b) => a.sortOrder - b.sortOrder);

  const companyName = settings?.companyName || "MyKerani";

  const navLinkCls = (id: string) =>
    `text-xs font-semibold transition cursor-pointer ${
      activeSection === id ? "text-[#16a34a]" : "text-zinc-500 hover:text-zinc-900"
    }`;

  return (
    <div className="min-h-screen bg-[#F8F7F3] text-zinc-800 font-sans" id="landing_page_root">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-30 bg-[#F8F7F3]/95 backdrop-blur border-b border-[#E8E6DE]">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0 overflow-hidden">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt={companyName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-extrabold text-xs">MK</span>
              )}
            </div>
            <span className="font-display font-bold text-sm tracking-tight text-zinc-900">{companyName.toUpperCase()}</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className={navLinkCls("features")}>Ciri-ciri</a>
            <a href="#who" className={navLinkCls("who")}>Untuk Siapa</a>
            <a href="#pricing" className={navLinkCls("pricing")}>Harga</a>
            <a href="#faq" className={navLinkCls("faq")}>FAQ</a>
            <a href="#contact" className={navLinkCls("contact")}>Hubungi</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={onLogin}
              className="px-3 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 cursor-pointer transition"
            >
              Log Masuk
            </button>
            <button
              onClick={onRegister}
              className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-sm"
            >
              Daftar Percuma
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-5 pt-14 pb-16 grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F0FDF4] border border-[#BEF3CC] rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-[#16a34a]" />
            <span className="text-[11px] font-bold text-[#16a34a]">AI Finansial untuk PKS Malaysia</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight leading-tight text-zinc-900">
            {settings?.heroHeadline || "Urus Kewangan Perniagaan Anda Tanpa Mengupah Kerani Sepenuh Masa"}
          </h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            {settings?.heroSubheadline ||
              "Jejak pendapatan, perbelanjaan, resit, invois dan dokumen kewangan dengan bantuan AI. Sentiasa tersusun untuk laporan, cukai, dan permohonan pembiayaan."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRegister}
              className="flex items-center gap-2 px-5 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-2xl text-sm font-bold cursor-pointer transition shadow-sm"
            >
              Mula Percubaan Percuma <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-[#E8E6DE] hover:border-[#22c55e] rounded-2xl text-sm font-bold text-zinc-700 cursor-pointer transition shadow-sm"
            >
              <PlayCircle className="w-4 h-4 text-[#22c55e]" /> Cuba Demo AI
            </button>
          </div>
        </div>
        <div className="sr-fade">
          <InteractiveDemo />
        </div>
      </section>

      {/* ── Cost of poor records ── */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Kos Rekod Kewangan Yang Tidak Tersusun</h2>
          <p className="text-xs text-zinc-400">Banyak perniagaan kehilangan masa dan wang akibat rekod yang tidak diuruskan.</p>
        </div>
        <div className="grid sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sectionItems("problem").map((item, i) => (
            <div key={i} className="sr-fade bg-white border border-[#E8E6DE] rounded-2xl p-4 text-center space-y-2 hover:-translate-y-0.5 hover:shadow-md transition-all">
              {item.iconEmoji ? <span className="text-2xl block">{item.iconEmoji}</span> : <div className="w-5 h-5 bg-rose-100 rounded mx-auto" />}
              <p className="text-[11px] font-semibold text-zinc-700">{item.label}</p>
              {item.description && <p className="text-[10px] text-zinc-400">{item.description}</p>}
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button
            onClick={onRegister}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer transition"
          >
            Selesaikan Masalah Ini Sekarang
          </button>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-10 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Bagaimana MyKerani Berfungsi</h2>
          <p className="text-xs text-zinc-400">Tiga langkah mudah — Cakap. Upload. Sahkan.</p>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-3">
          {sectionItems("how_it_works").map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className="sr-fade flex flex-col items-center gap-2 w-28 text-center group">
                <div className="w-11 h-11 rounded-xl bg-[#F0FDF4] border border-[#BEF3CC] flex items-center justify-center group-hover:bg-[#22c55e] transition">
                  <span className="text-xl group-hover:scale-110 transition-transform">{item.iconEmoji || "✦"}</span>
                </div>
                <p className="text-[10px] font-semibold text-zinc-600 leading-tight">{item.label}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-[#BEF3CC] hidden sm:block" />}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-10 text-center">
          <button
            onClick={onRegister}
            className="flex items-center gap-2 px-5 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-2xl text-sm font-bold cursor-pointer transition mx-auto"
          >
            Cuba Sekarang — Percuma <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Who should use ── */}
      <section id="who" className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Siapa Patut Guna MyKerani</h2>
          <p className="text-xs text-zinc-400">Untuk pemilik perniagaan yang tidak mahu belajar perakaunan.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {sectionItems("target_users").map((item, i) => (
            <span key={i} className="sr-fade px-4 py-2 bg-white border border-[#E8E6DE] hover:border-[#22c55e] hover:text-[#16a34a] rounded-full text-xs font-semibold text-zinc-700 transition cursor-default">
              {item.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── What can be managed ── */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Apa Yang Boleh Diuruskan</h2>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {sectionItems("what_managed").map((item, i) => (
            <span key={i} className="sr-fade px-4 py-2 bg-[#F0FDF4] border border-[#BEF3CC] text-[#16a34a] rounded-full text-xs font-semibold">
              {item.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Mengapa Pemilik Perniagaan Pilih MyKerani</h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {sectionItems("benefits").map((item, i) => (
            <div key={i} className="sr-fade flex items-center gap-3 p-4 bg-white border border-[#E8E6DE] rounded-xl hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <span className="text-lg shrink-0">{item.iconEmoji || "✓"}</span>
              <span className="text-xs font-semibold text-zinc-700">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button
            onClick={onRegister}
            className="px-6 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-2xl text-sm font-bold cursor-pointer transition shadow-sm"
          >
            Mula Percubaan Percuma
          </button>
        </div>
      </section>

      {/* ── Live Demo CTA ── */}
      <section className="bg-zinc-900 py-16 px-5">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#22c55e]/20 border border-[#22c55e]/30 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-[#22c55e]" />
            <span className="text-[11px] font-bold text-[#22c55e]">Demo AI Percuma</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            Cuba Sendiri — Tanpa Daftar
          </h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Jelajahi papan pemuka, transaksi, dokumen, laporan dan pembantu AI. Tiada e-mel, tiada kata laluan, tiada akaun.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-6 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-2xl text-sm font-bold cursor-pointer transition"
            >
              <PlayCircle className="w-4 h-4" /> Cuba Demo AI Sekarang
            </button>
            <button
              onClick={onRegister}
              className="px-6 py-3 border border-white/20 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-white/10 transition"
            >
              Atau Daftar Akaun
            </button>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-10 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Pelan & Harga</h2>
          <p className="text-xs text-zinc-400">Mulakan percuma. Naik taraf apabila perniagaan anda berkembang.</p>
        </div>
        {plansLoading ? (
          <div className="flex justify-center py-8">
            <div className="flex gap-1.5 items-center text-xs text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0.15s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        ) : plansError ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm font-semibold text-zinc-500">Pelan sedang dikemaskini.</p>
            <p className="text-xs text-zinc-400">
              Sila{" "}
              <a href="#contact" className="text-[#22c55e] hover:underline">hubungi kami</a>
              {" "}untuk maklumat lanjut.
            </p>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm font-semibold text-zinc-500">Pelan sedang dikemaskini.</p>
            <p className="text-xs text-zinc-400">
              Sila{" "}
              <a href="#contact" className="text-[#22c55e] hover:underline">hubungi kami</a>
              {" "}untuk maklumat lanjut.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {plans.map(p => (
              <div
                key={p.id}
                className={`rounded-2xl p-5 space-y-4 border hover:-translate-y-1 hover:shadow-lg transition-all ${
                  p.featured
                    ? "border-[#22c55e] bg-[#F0FDF4] shadow-md"
                    : "border-[#E8E6DE] bg-white"
                }`}
              >
                <div className="flex flex-wrap gap-1.5">
                  {p.featured && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-[#22c55e] rounded-lg text-[10px] font-bold text-white">POPULAR</span>
                  )}
                  {p.isTrial && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700">PERCUBAAN</span>
                  )}
                </div>
                <div>
                  <p className="font-display font-bold text-zinc-900">{p.name}</p>
                  {p.aiCredits > 0 && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">AI {p.aiCredits.toLocaleString()} kredit · Storan {p.storageGB} GB</p>
                  )}
                </div>
                {p.isCustomPricing ? (
                  <p className="text-lg font-bold text-zinc-900">Harga Tersuai</p>
                ) : (
                  <p className="text-2xl font-bold text-zinc-900">
                    RM {p.price.toLocaleString()}
                    <span className="text-xs text-zinc-400 font-normal">/bln</span>
                  </p>
                )}
                <ul className="text-[10px] text-[#16a34a] space-y-1.5">
                  {p.features.slice(0, 6).map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                  {p.maxUsers > 0 && (
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" /> Sehingga {p.maxUsers} pengguna
                    </li>
                  )}
                </ul>
                {p.isTrial ? (
                  <button
                    onClick={onRegister}
                    className="w-full py-2.5 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-xl text-xs font-bold cursor-pointer transition"
                  >
                    Mula Percuma {p.trialDays > 0 ? `(${p.trialDays} Hari)` : ""}
                  </button>
                ) : p.isCustomPricing ? (
                  <a
                    href={`mailto:${settings?.contactEmail || "sales@mykerani.com"}`}
                    className="w-full block text-center py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition"
                  >
                    Hubungi Jualan
                  </a>
                ) : (
                  <button
                    onClick={onRegister}
                    className="w-full py-2.5 bg-white border border-[#22c55e] text-[#16a34a] hover:bg-[#F0FDF4] rounded-xl text-xs font-bold cursor-pointer transition"
                  >
                    Langgan Sekarang
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900 flex items-center justify-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#22c55e]" /> Soalan Lazim
          </h2>
        </div>
        <div className="space-y-2">
          {faqs.map(f => (
            <div key={f.id} className="sr-fade bg-white border border-[#E8E6DE] rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)}
                className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-[#F8F7F3] transition"
              >
                <span className="text-sm font-semibold text-zinc-800">{f.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ${openFaq === f.id ? "rotate-180" : ""}`}
                />
              </button>
              {openFaq === f.id && (
                <p className="px-4 pb-4 text-xs text-zinc-500 leading-relaxed border-t border-[#E8E6DE] pt-3">
                  {f.answer}
                </p>
              )}
            </div>
          ))}
          {faqs.length === 0 && <p className="text-center text-xs text-zinc-400">Tiada soalan lazim lagi.</p>}
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="max-w-6xl mx-auto px-5 py-14 border-t border-[#E8E6DE]">
        <div className="sr-fade text-center mb-8 space-y-2">
          <h2 className="text-xl font-display font-bold text-zinc-900">Hubungi Kami</h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {settings?.contactEmail && (
            <div className="sr-fade p-4 bg-white border border-[#E8E6DE] rounded-xl space-y-1.5 hover:shadow-sm transition">
              <Mail className="w-4 h-4 text-[#22c55e] mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">{settings.contactEmail}</p>
            </div>
          )}
          {settings?.contactPhone && (
            <div className="sr-fade p-4 bg-white border border-[#E8E6DE] rounded-xl space-y-1.5 hover:shadow-sm transition">
              <Phone className="w-4 h-4 text-[#22c55e] mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">{settings.contactPhone}</p>
            </div>
          )}
          {settings?.contactWhatsapp && (
            <div className="sr-fade p-4 bg-white border border-[#E8E6DE] rounded-xl space-y-1.5 hover:shadow-sm transition">
              <MessageCircle className="w-4 h-4 text-[#22c55e] mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">{settings.contactWhatsapp}</p>
            </div>
          )}
          {settings?.contactAddress && (
            <div className="sr-fade p-4 bg-white border border-[#E8E6DE] rounded-xl space-y-1.5 hover:shadow-sm transition">
              <MapPin className="w-4 h-4 text-[#22c55e] mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">{settings.contactAddress}</p>
            </div>
          )}
          {settings?.businessHours && (
            <div className="sr-fade p-4 bg-white border border-[#E8E6DE] rounded-xl space-y-1.5 hover:shadow-sm transition">
              <Clock className="w-4 h-4 text-[#22c55e] mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">{settings.businessHours}</p>
            </div>
          )}
          {!settings?.contactEmail &&
            !settings?.contactPhone &&
            !settings?.contactWhatsapp &&
            !settings?.contactAddress && (
              <p className="col-span-full text-xs text-zinc-400">Maklumat hubungan belum disediakan oleh HQ.</p>
            )}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-[#F0FDF4] border-t border-[#BEF3CC] text-center py-16 px-5">
        <h2 className="text-2xl font-display font-bold text-zinc-900 mb-2">
          Hentikan Cara Susah Urus Kewangan
        </h2>
        <p className="text-sm text-zinc-500 mb-6">Mula susun rekod kewangan anda hari ini — percuma, tanpa kad kredit.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={onRegister}
            className="flex items-center gap-2 px-6 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-2xl text-sm font-bold cursor-pointer transition shadow-sm"
          >
            Mula Percubaan Percuma <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onLogin}
            className="px-6 py-3 bg-white border border-[#E8E6DE] text-zinc-700 rounded-2xl text-sm font-bold cursor-pointer hover:border-[#22c55e] transition"
          >
            Log Masuk
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="text-center py-6 text-[11px] text-zinc-400 space-y-2 border-t border-[#E8E6DE] bg-[#F8F7F3]">
        {settings?.socialLinks && Object.keys(settings.socialLinks).length > 0 && (
          <div className="flex items-center justify-center gap-4">
            {Object.entries(settings.socialLinks).map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-zinc-500 hover:text-zinc-800 transition"
              >
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
