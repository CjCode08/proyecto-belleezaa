export type SessionScope = "default" | "sellers" | "pos";

export function sessionScopeForPath(pathname: string): SessionScope {
  if (pathname === "/vendedores" || pathname.startsWith("/vendedores/")) return "sellers";
  if (pathname === "/pos" || pathname.startsWith("/pos/")) return "pos";
  return "default";
}

export function sessionCookieOptions(scope: SessionScope, supabaseUrl: string): { name?: string } {
  if (scope === "default") return {};
  const project = new URL(supabaseUrl).hostname.split(".")[0];
  return { name: `sb-${project}-auth-token-${scope}` };
}