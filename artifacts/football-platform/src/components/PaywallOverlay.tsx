import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Lock, ArrowRight } from "lucide-react";
import { usePlan, useBillingEnabled } from "../hooks/usePlan";

interface PaywallOverlayProps {
  children: ReactNode;
  message?: string;
  minPlan?: "pro";
}

// Fase 2.4 — Blurs locked content and shows an upgrade CTA.
// Transparent when BILLING_ENABLED=false or user is already on the required plan.
export function PaywallOverlay({ children, message = "Opgradér til Pro for at se denne analyse", minPlan = "pro" }: PaywallOverlayProps) {
  const [, navigate] = useLocation();
  const { plan, isLoading } = usePlan();
  const billingEnabled = useBillingEnabled();

  if (isLoading) return <>{children}</>;
  if (!billingEnabled) return <>{children}</>;
  if (minPlan === "pro" && plan === "pro") return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-40">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl border border-primary/25 bg-background/85 backdrop-blur-md shadow-xl max-w-sm text-center">
          <Lock className="w-5 h-5 text-primary" />
          <p className="text-[13px] font-mono text-white/85 leading-relaxed">{message}</p>
          <button
            onClick={() => navigate("/pricing")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 border border-primary/30 text-primary text-[11px] font-mono font-bold uppercase tracking-wider hover:bg-primary/25 transition-colors"
          >
            Opgradér <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
