import { useState } from "react";
import { Check, Zap, ArrowRight, Activity } from "lucide-react";
import { Layout } from "@/components/Layout";
import { supabase } from "../lib/supabase";
import { usePlan, useBillingEnabled } from "../hooks/usePlan";

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export function Pricing() {
  const { isPro, isLoading } = usePlan();
  const billingEnabled = useBillingEnabled();
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy("checkout");
    setError(null);
    try {
      const res = await authFetch("/api/billing/checkout", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await authFetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed");
    } finally {
      setBusy(null);
    }
  }

  const freeFeatures = ["Forsinkede low-confidence tips", "Begrænset signal-feed", "Base standings + fixtures"];
  const proFeatures = [
    "Alle live-tips uden forsinkelse",
    "Performance dashboard (ROI, CLV, Brier)",
    "Super-value notifikationer i realtid",
    "Fuld adgang til historiske reviews",
    "Odds-drop og value signals",
  ];

  return (
    <Layout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-mono font-black tracking-tight uppercase text-white">Pricing</h1>
          <p className="text-sm text-muted-foreground font-mono">Vælg dit plan — opsig når som helst</p>
        </div>

        {!billingEnabled && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-[13px] font-mono text-amber-400">
            Billing er ikke aktiveret. Alle brugere har fuld adgang indtil Stripe er sat op.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-[13px] font-mono text-destructive">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/3 p-6 space-y-5">
            <div>
              <h3 className="text-xl font-mono font-bold text-white mb-1">Free</h3>
              <div className="text-3xl font-mono font-black text-white">0 kr<span className="text-sm text-white/40 font-normal">/mdr</span></div>
            </div>
            <ul className="space-y-2">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-white/70 font-mono">
                  <Check className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="pt-2 border-t border-white/5">
              <div className="text-[11px] font-mono text-white/30 uppercase tracking-wider">Dit nuværende plan{!isPro ? " ✓" : ""}</div>
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-5 relative">
            <span className="absolute -top-3 left-6 px-2 py-0.5 rounded bg-primary text-background text-[10px] font-mono font-bold uppercase tracking-wider">
              Anbefalet
            </span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-mono font-bold text-white">Pro</h3>
              </div>
              <div className="text-3xl font-mono font-black text-primary">149 kr<span className="text-sm text-white/40 font-normal">/mdr</span></div>
            </div>
            <ul className="space-y-2">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-white/85 font-mono">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="pt-2">
              {isLoading ? (
                <div className="h-10 flex items-center justify-center"><Activity className="w-4 h-4 text-primary animate-pulse" /></div>
              ) : isPro ? (
                <button
                  onClick={openPortal}
                  disabled={!billingEnabled || busy !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-primary/30 bg-primary/10 text-primary text-[12px] font-mono font-bold uppercase tracking-wider hover:bg-primary/20 disabled:opacity-50 transition-colors"
                >
                  {busy === "portal" ? "Åbner portal…" : "Administrer abonnement"} <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={startCheckout}
                  disabled={!billingEnabled || busy !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-background text-[12px] font-mono font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {busy === "checkout" ? "Omdirigerer…" : "Opgradér til Pro"} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] font-mono text-white/30">
          Betaling via Stripe · Sikker og PCI-compliant · Opsig når som helst fra portalen
        </p>
      </div>
    </Layout>
  );
}
