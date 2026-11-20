import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { staffDestination } from "@/lib/auth/staff-destination";

export async function getInventoryProfile() {
  const profile = await getActiveProfile();
  return staffDestination(profile, false) === "/inventario/panel" ? profile : null;
}

export async function requireInventoryProfile() {
  const profile = await getInventoryProfile();
  if (!profile) redirect("/login");
  return profile;
}
