import { notFound, redirect } from "next/navigation";
import { getActiveProfile } from "./active-profile";
import { canAccessPos } from "./staff-destination";

export async function requirePosProfile() {
  if (process.env.POS_PREVIEW_ENABLED !== "true") notFound();
  const profile = await getActiveProfile();
  if (!profile || !canAccessPos(profile, true)) redirect("/pos/login");
  return profile;
}