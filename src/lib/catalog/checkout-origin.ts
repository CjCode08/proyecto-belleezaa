export type CheckoutTestConfiguration = {
  enabled: string | undefined;
  configuredOrigin: string | undefined;
  publicSupabaseUrl: string | undefined;
  testSupabaseUrl: string | undefined;
  testServiceRoleKey: string | undefined;
  testTurnstileSecret: string | undefined;
  testTurnstileSiteKey: string | undefined;
  testWhatsappNumber: string | undefined;
};

export function isAllowedCheckoutTestOrigin(origin: string, nodeEnv: string): boolean {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash) return false;

  if (nodeEnv === "development") {
    return parsed.protocol === "http:" && parsed.hostname === "localhost" &&
      (parsed.port === "" || Number(parsed.port) > 0 && Number(parsed.port) <= 65535);
  }

  return nodeEnv === "production" && parsed.protocol === "https:" && parsed.port === "" &&
    /^deploy-preview-\d+--[a-z0-9][a-z0-9-]*\.netlify\.app$/.test(parsed.hostname);
}

export function isCheckoutTestEnabled(origin: string, nodeEnv: string, config: CheckoutTestConfiguration): boolean {
  return config.enabled === "true" && config.configuredOrigin === origin &&
    isAllowedCheckoutTestOrigin(origin, nodeEnv) && Boolean(
      config.publicSupabaseUrl && config.testSupabaseUrl && config.testServiceRoleKey &&
      config.testTurnstileSecret && config.testTurnstileSiteKey && config.testWhatsappNumber &&
      config.testSupabaseUrl === config.publicSupabaseUrl,
    );
}
