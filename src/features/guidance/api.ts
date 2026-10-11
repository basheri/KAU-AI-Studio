import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Journey } from "./journey";

// Read-only guidance from the database (filtered to the caller's memberships).

export const myWorkQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my-work", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_work");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
export type MyWorkItem = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myWorkQuery>["queryFn"]>>
>[number];

export const journeyQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-journey", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("project_journey", { _project_id: projectId });
      if (error) throw error;
      return data as unknown as Journey;
    },
  });

export type ReadinessCheck = {
  check: string;
  ok: boolean;
  count?: number;
  stage_en?: string;
  stage_ar?: string;
};
export const readinessQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["review-readiness", versionId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("review_readiness", { _version_id: versionId });
      if (error) throw error;
      return data as unknown as { kind: string; ready: boolean; checks: ReadinessCheck[] };
    },
  });
