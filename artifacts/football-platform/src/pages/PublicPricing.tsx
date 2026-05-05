import { Link } from "wouter";
import { ArrowRight, Check, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { useState } from "react";

const FAQ = [
  {
    q: "What do I actually get each day?",
    a: "A clear view of live matches, upcoming kickoffs, and model-ranked edges — plus alerts when you follow fixtures. Everything routes into one match page for pre-match, live, and post analysis.",
  },
  {
    q: "Is this betting advice?",
    a: "No. Signal Terminal is an analytics product. You are responsible for how you use any information. Betting carries risk; past performance does not guarantee future results.",
  },
  {
    q: "How fresh is the data?",
    a: "Live fixtures and odds refresh on a short interval while games are in play. Pre-match data syncs with our upstream providers on a regular schedule.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. When billing is enabled, you manage your subscription through the Stripe customer portal. Until then, access may be offered without charge.",
  },
];

const freeFeatures = ["Delayed low-confidence tips", "Limited signal feed", "Standings and fixtures"];

const proFeatures = [
  "Full live tips without delay",
  "Performance dashboard (ROI, CLV, Brier)",
  "High-value notifications",
  "Historical reviews and signal history",
  "Odds-drop and value signals",
];

export function PublicPricing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen w-full text-foreground">
      <header className="border-b border-white/[0.07] bg-background/85 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg object-contain ring-1 ring-white/10" />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white tracking-tight">Signal Terminal</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Intelligence</div>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <span className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Sign in</span>
            </Link>
            <Link href="/login">
              <span className="text-xs font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-95 cursor-pointer transition-opacity shadow-[0_0_20px_-4px_hsl(43_72%_54%_/_.4)]">
                Start trial
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-14 space-y-14">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Plans</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Simple pricing</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Upgrade after you sign in. Start with a trial from the login page.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass-card rounded-2xl p-7 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Free</h3>
              <div className="text-3xl font-semibold text-white tabular-nums">
                0 kr<span className="text-sm text-muted-foreground font-normal">/mo</span>
              </div>
            </div>
            <ul className="space-y-3">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <div className="block w-full text-center py-3 rounded-xl border border-white/12 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-white/[0.04] cursor-pointer transition-colors">
                Sign in to continue
              </div>
            </Link>
          </div>

          <div className="glass-card rounded-2xl p-7 space-y-6 relative ring-1 ring-primary/25 shadow-[0_0_40px_-12px_hsl(43_72%_54%_/_.35)]">
            <span className="absolute -top-2.5 left-6 px-2.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
              Recommended
            </span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-white">Pro</h3>
              </div>
              <div className="text-3xl font-semibold text-primary tabular-nums">
                149 kr<span className="text-sm text-muted-foreground font-normal">/mo</span>
              </div>
            </div>
            <ul className="space-y-3">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <div className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.12em] hover:opacity-95 cursor-pointer transition-opacity">
                Sign in to upgrade <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em]">FAQ</h2>
          <div className="glass-card rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-sm font-medium text-white">{item.q}</span>
                    {open ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-white/[0.05] pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">Payments processed securely via Stripe when billing is enabled.</p>
      </main>
    </div>
  );
}
