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

const freeFeatures = [
  "Delayed low-confidence tips",
  "Limited signal feed",
  "Standings and fixtures",
];

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
    <div className="min-h-screen w-full text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg object-contain" />
              <span className="font-mono font-bold tracking-tight text-sm">Signal Terminal</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <span className="text-xs font-mono text-muted-foreground hover:text-white transition-colors cursor-pointer">
                Sign in
              </span>
            </Link>
            <Link href="/login">
              <span className="text-xs font-mono px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-bold hover:bg-primary/90 cursor-pointer">
                Start trial
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-12">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-mono font-black tracking-tight uppercase text-white">Pricing</h1>
          <p className="text-sm text-muted-foreground font-mono max-w-lg mx-auto">
            Simple plans. Upgrade after you sign in — start with a trial from the login page.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/3 p-6 space-y-5">
            <div>
              <h3 className="text-xl font-mono font-bold text-white mb-1">Free</h3>
              <div className="text-3xl font-mono font-black text-white">
                0 kr<span className="text-sm text-white/40 font-normal">/mo</span>
              </div>
            </div>
            <ul className="space-y-2">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-white/70 font-mono">
                  <Check className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <div className="block w-full text-center py-2.5 rounded-md border border-white/15 text-[12px] font-mono font-bold uppercase tracking-wider hover:bg-white/5 cursor-pointer transition-colors">
                Sign in to continue
              </div>
            </Link>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-5 relative">
            <span className="absolute -top-3 left-6 px-2 py-0.5 rounded bg-primary text-background text-[10px] font-mono font-bold uppercase tracking-wider">
              Recommended
            </span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-mono font-bold text-white">Pro</h3>
              </div>
              <div className="text-3xl font-mono font-black text-primary">
                149 kr<span className="text-sm text-white/40 font-normal">/mo</span>
              </div>
            </div>
            <ul className="space-y-2">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-white/85 font-mono">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/login">
              <div className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-background text-[12px] font-mono font-bold uppercase tracking-wider hover:bg-primary/90 cursor-pointer transition-colors">
                Sign in to upgrade <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-mono font-bold text-primary uppercase tracking-widest">FAQ</h2>
          <div className="rounded-xl border border-white/10 divide-y divide-white/10 overflow-hidden">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm font-medium text-white">{item.q}</span>
                    {open ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed border-t border-white/5">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-[11px] font-mono text-white/30">
          Payments processed securely via Stripe when billing is enabled.
        </p>
      </main>
    </div>
  );
}
