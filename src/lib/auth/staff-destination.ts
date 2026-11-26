export function staffDestination(
  profile: { role: string; is_active: boolean | null } | null,
  sellersPreviewEnabled: boolean,
) {
  if (profile?.is_active !== true) return null;
  if (profile.role === "admin" || profile.role === "personal") return "/inventario/panel";
  if (profile.role === "vendedor" && sellersPreviewEnabled) return "/vendedores";
  return null;
}

export function canAccessPos(profile: { role: string; is_active: boolean | null } | null, enabled: boolean) {
  return enabled && profile?.is_active === true && ["admin", "cajero"].includes(profile.role);
}

export function canAccessAdministration(profile: { role: string; is_active: boolean | null } | null) {
  return profile?.role === "admin" && profile.is_active === true;
}