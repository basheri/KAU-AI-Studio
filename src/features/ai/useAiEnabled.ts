import { useQuery } from "@tanstack/react-query";
import { aiStatusQuery } from "./api";

/** Whether AI assistance is switched on for the platform (non-secret status from the server). */
export function useAiEnabled() {
  const q = useQuery(aiStatusQuery);
  return { enabled: q.data?.enabled === true, loading: q.isLoading };
}
