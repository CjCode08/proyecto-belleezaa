export function staffDestination(
  profile: { role: string; is_active: boolean | null } | null,
  sellersPreviewEnabled: boolean,
) {
  if (profile?.is_active !== true) return null;
  if (profile.role === "admin" || profile.role === "personal") return "/inventario/panel";
  if (profile.role === "vendedor" && sellersPreviewEnabled) return "/vendedores";
  return null;
}