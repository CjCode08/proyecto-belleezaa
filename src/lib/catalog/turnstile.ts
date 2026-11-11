const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type VerificationResult =
  | { ok: true }
  | { ok: false; reason: "invalid-token" | "unavailable" | "misconfigured" };

type VerificationOptions = {
  secret: string;
  // Use a trusted server configuration, never the incoming Host header.
  hostname: string;
  action: string;
  fetcher?: typeof fetch;
};

export async function verifyTurnstile(
  token: unknown,
  options: VerificationOptions,
): Promise<VerificationResult> {
  if (!options.secret.trim() || !options.hostname.trim() || !options.action.trim()) {
    return { ok: false, reason: "misconfigured" };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "invalid-token" };
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(siteverifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: options.secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!response.ok) return { ok: false, reason: "unavailable" };

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "unavailable" };
  }
  const verification = result as Record<string, unknown>;
  if (typeof verification.success !== "boolean") {
    return { ok: false, reason: "unavailable" };
  }
  if (!verification.success) {
    const codes = verification["error-codes"];
    if (!Array.isArray(codes) || codes.some((code) => typeof code !== "string")) {
      return { ok: false, reason: "unavailable" };
    }
    if (codes.includes("missing-input-secret") || codes.includes("invalid-input-secret")) {
      return { ok: false, reason: "misconfigured" };
    }
    if (codes.includes("internal-error") || codes.includes("bad-request")) {
      return { ok: false, reason: "unavailable" };
    }
    if (!codes.length || codes.some((code) =>
      code !== "missing-input-response" && code !== "invalid-input-response" && code !== "timeout-or-duplicate"
    )) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "invalid-token" };
  }
  if (verification.hostname !== options.hostname ||
      verification.action !== options.action) {
    return { ok: false, reason: "invalid-token" };
  }
  return { ok: true };
}
