import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export type Plan = "free" | "pro";

interface PlanResponse {
  authenticated: boolean;
  role: string | null;
  plan: Plan;
  accessDenied: boolean;
  email?: string;
}

export function usePlan() {
  const query = useQuery<PlanResponse>({
    queryKey: ["me", "plan"],
    staleTime: 60_000,
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch /me");
      return res.json();
    },
  });

  return {
    plan: (query.data?.plan ?? "free") as Plan,
    isPro: query.data?.plan === "pro",
    role: query.data?.role ?? null,
    email: query.data?.email ?? null,
    isLoading: query.isLoading,
  };
}

export function useBillingEnabled() {
  const query = useQuery<{ enabled: boolean }>({
    queryKey: ["billing", "status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/billing/status");
      if (!res.ok) return { enabled: false };
      return res.json();
    },
  });
  return query.data?.enabled ?? false;
}
