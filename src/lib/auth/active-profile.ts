import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getActiveProfile() {
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
  return profile?.is_active ? profile : null;
}