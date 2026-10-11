import { createServerFn } from "@tanstack/react-start";

export interface SystemStatus {
  aiConfigured: boolean;
  integrationsEnabled: false;
}

/**
 * Server-only boundary: secrets are read from process.env inside the handler
 * and only booleans are returned. Never return secret values to the browser.
 */
export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemStatus> => ({
    aiConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
    integrationsEnabled: false,
  }),
);
