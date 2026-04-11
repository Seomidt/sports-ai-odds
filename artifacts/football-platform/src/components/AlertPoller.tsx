import { useEffect, useRef } from "react";
import { useGetUnreadAlerts } from "@workspace/api-client-react";
import type { Alert } from "@workspace/api-client-react";
import { useSession } from "@/lib/session";
import { useToast } from "@/hooks/use-toast";

export function AlertPoller() {
  const { sessionId } = useSession();
  const { toast } = useToast();
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
      if (!seenIdsRef.current.has(alert.id)) {
        seenIdsRef.current.add(alert.id);

        toast({
          title: `Signal Alert — Match ${alert.fixtureId}`,
          description: alert.alertText,
          duration: 8000,
        });
      }
    }
  }, [data, toast]);

  return null;
}
