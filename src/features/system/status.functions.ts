import { createServerFn } from "@tanstack/react-start";

export interface SystemStatus {
  integrationsEnabled: false;
}

/**
 * Server-only boundary: never return secret values to the browser.
 * AI status lives in src/features/ai/ai.functions.ts (getAiStatus).
 */
export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemStatus> => ({ integrationsEnabled: false }),
);
