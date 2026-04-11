import { useEffect, useRef } from "react";
import { useGetUnreadAlerts } from "@workspace/api-client-react";
import type { Alert } from "@workspace/api-client-react";
import { useSession } from "@/lib/session";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";

const DISMISS_MS = 8_000;

export function AlertPoller() {
  const { sessionId } = useSession();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const seenIdsRef = useRef<Set<number>>(new Set());

  const { data } = useGetUnreadAlerts({
    query: {
      refetchInterval: 30_000,
      queryKey: ["globalUnreadAlerts"],
    },
    request: { headers: { "x-session-id": sessionId } },
  });

  useEffect(() => {
    const alerts: Alert[] = data?.alerts ?? [];

    for (const alert of alerts) {
      if (seenIdsRef.current.has(alert.id)) continue;
      seenIdsRef.current.add(alert.id);

      const matchLabel =
        alert.homeTeamName && alert.awayTeamName
          ? `${alert.homeTeamName} vs ${alert.awayTeamName}`
          : `Kamp ${alert.fixtureId}`;

      toast({
        title: `Signal — ${matchLabel}`,
        description: alert.alertText,
        duration: DISMISS_MS,
        action: (
          <ToastAction
            altText="Gå til kamp"
            onClick={() => navigate(`/match/${alert.fixtureId}`)}
          >
            Gå til kamp
          </ToastAction>
        ),
      });
    }
  }, [data, toast, navigate]);

  return null;
}
