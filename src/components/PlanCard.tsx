import { CheckCircle2 } from "lucide-react";

interface PlanCardBadge {
  label: string;
  variant: "green" | "amber";
}

interface PlanCardCta {
  label: string;
  onClick?: () => void;
  href?: string;
  variant: "primary" | "secondary" | "danger" | "outline";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export interface PlanCardProps {
  title: string;
  price: string;
  subtitle?: string;
  badges?: PlanCardBadge[];
  meta?: string[];
  features?: string[];
  limitations?: string[];
  badge2?: string;
  cta?: PlanCardCta;
  secondaryCta?: PlanCardCta;
  featured?: boolean;
  highlighted?: boolean;
  hover?: boolean;
  featureIcon?: "check" | "plus";
}

const BADGE_STYLES: Record<PlanCardBadge["variant"], string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
};

const CTA_STYLES: Record<PlanCardCta["variant"], string> = {
  primary:   "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent",
  secondary: "bg-slate-900 hover:bg-slate-800 text-white border-transparent",
  danger:    "bg-white hover:bg-red-50 text-red-400 border-red-100",
  outline:   "bg-white hover:bg-slate-50 text-slate-600 border-slate-200",
};

function CtaButton({ cta, className = "" }: { cta: PlanCardCta; className?: string }) {
  const base = `block text-center py-2 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${CTA_STYLES[cta.variant]} ${className}`;
  const label = cta.loading && cta.loadingLabel ? cta.loadingLabel : cta.label;

  if (cta.href) {
    return (
      <a href={cta.href} className={base}>
        {label}
      </a>
    );
  }
  return (
    <button onClick={cta.onClick} disabled={cta.disabled || cta.loading} className={base}>
      {label}
    </button>
  );
}

export default function PlanCard({
  title,
  price,
  subtitle,
  badges,
  meta,
  features,
  limitations,
  badge2,
  cta,
  secondaryCta,
  featured,
  highlighted,
  hover,
  featureIcon = "check",
}: PlanCardProps) {
  const borderClass = highlighted
    ? "border-indigo-300 bg-indigo-50/40"
    : featured
    ? "border-emerald-300 bg-emerald-50/30"
    : "border-slate-200 bg-white";

  const hoverClass = hover ? "hover:-translate-y-1 hover:shadow-lg" : "";

  return (
    <div className={`border rounded-2xl p-4 space-y-2 relative transition-all ${borderClass} ${hoverClass}`}>
      {/* Badges */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${BADGE_STYLES[b.variant]}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Title + subtitle */}
      <div className={badges && badges.length > 0 ? "" : "pr-14"}>
        <p className="font-bold text-slate-900">{title}</p>
        {subtitle && <p className="text-[10px] text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>

      {/* Price */}
      <p className={`font-bold text-slate-900 ${price.startsWith("RM") ? "text-2xl" : "text-lg"}`}>
        {price.startsWith("RM") ? (
          <>
            {price.replace(/\/bln$/, "")}
            <span className="text-xs text-slate-400 font-normal">/bln</span>
          </>
        ) : (
          price
        )}
      </p>

      {/* Meta — small detail lines */}
      {meta && meta.length > 0 && (
        <div className="text-[11px] text-slate-400 space-y-0.5">
          {meta.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
          {badge2 && <p className="text-emerald-600 font-semibold">{badge2}</p>}
        </div>
      )}
      {!meta && badge2 && (
        <p className="text-[11px] text-emerald-600 font-semibold">{badge2}</p>
      )}

      {/* Features */}
      {features && features.length > 0 && (
        <ul className={`text-[10px] space-y-1 ${featureIcon === "check" ? "text-emerald-700" : "text-emerald-700"}`}>
          {features.map((f, i) =>
            featureIcon === "check" ? (
              <li key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" /> {f}
              </li>
            ) : (
              <li key={i} className="text-emerald-700">+ {f}</li>
            )
          )}
        </ul>
      )}

      {/* Limitations */}
      {limitations && limitations.length > 0 && (
        <ul className="text-[10px] space-y-0.5 pt-1 border-t border-slate-100">
          {limitations.map((l, i) => (
            <li key={i} className="text-slate-400">- {l}</li>
          ))}
        </ul>
      )}

      {/* CTA buttons */}
      {(cta || secondaryCta) && (
        <div className={`pt-1 ${secondaryCta ? "flex gap-2" : ""}`}>
          {cta && <CtaButton cta={cta} className={secondaryCta ? "flex-1 py-1.5" : "w-full py-2"} />}
          {secondaryCta && <CtaButton cta={secondaryCta} className="py-1.5 px-3" />}
        </div>
      )}
    </div>
  );
}
