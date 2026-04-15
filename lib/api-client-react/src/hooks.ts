import { useQuery } from "@tanstack/react-query";
import { healthCheck } from "./generated/api";

export function useGetMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        await healthCheck();

        return {
          user: null,
          authenticated: false,
          role: null,
        };
      } catch {
        return {
          user: null,
          authenticated: false,
          role: null,
        };
      }
    },
    staleTime: 30_000,
  });
}