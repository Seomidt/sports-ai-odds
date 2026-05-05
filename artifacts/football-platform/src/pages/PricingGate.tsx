import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Pricing } from "./Pricing";
import { PublicPricing } from "./PublicPricing";

export function PricingGate() {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (isSignedIn) {
    return <Pricing />;
  }

  return <PublicPricing />;
}
