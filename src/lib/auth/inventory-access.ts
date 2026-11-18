import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getInventoryProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error("No se pudo verificar la sesión.", { cause: authError });
  }
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error("No se pudo verificar el perfil.", { cause: error });
  if (!profile || !profile.is_active || !["admin", "personal"].includes(profile.role)) return null;
  return profile;
}

export async function requireInventoryProfile() {
  const profile = await getInventoryProfile();
  if (!profile) redirect("/login");
  return profile;
}
