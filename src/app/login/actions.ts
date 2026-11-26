"use server";

import { notFound, redirect } from "next/navigation";
import { canAccessAdministration, canAccessPos, staffDestination } from "@/lib/auth/staff-destination";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionScope } from "@/lib/supabase/session-scope";

export type LoginState = { error?: string };

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  return signIn(formData, "/inventario/panel");
}

export async function loginSeller(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") notFound();
  return signIn(formData, "/vendedores");
}

export async function loginPos(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (process.env.POS_PREVIEW_ENABLED !== "true") notFound();
  return signIn(formData, "/pos");
}

export async function loginAdmin(_state: LoginState, formData: FormData): Promise<LoginState> {
  return signIn(formData, "/administracion");
}

async function signIn(formData: FormData, portal: "/inventario/panel" | "/vendedores" | "/pos" | "/administracion"): Promise<LoginState> {
  const username = formData.get("username");
  const password = formData.get("password");
  const email = typeof username === "string" ? usernameToInternalEmail(username) : null;
  if (!email || typeof password !== "string" || password.length === 0 || password.length > 1024) {
    return { error: "Ingresa un usuario y contraseña válidos." };
  }

  const scope: SessionScope = portal === "/pos" ? "pos" : portal === "/vendedores" ? "sellers" : "default";
  const supabase = await createSupabaseServerClient(scope);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && error.status !== 400 && error.status !== 422) {
      console.error("Error de autenticación en Supabase:", error);
      return { error: "No se pudo iniciar sesión. Inténtalo más tarde." };
    }
    return { error: "Usuario o contraseña incorrectos." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, username")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error al consultar el perfil:", profileError);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) console.error("Error al cerrar la sesión:", signOutError);
    return { error: "No se pudo verificar el acceso. Inténtalo más tarde." };
  }

  const destination = portal === "/pos"
    ? canAccessPos(profile, process.env.POS_PREVIEW_ENABLED === "true") ? "/pos" : null
    : portal === "/administracion"
      ? canAccessAdministration(profile) ? "/administracion" : null
      : staffDestination(profile, process.env.SELLERS_PREVIEW_ENABLED === "true");
  if (destination !== portal || !profile?.username || usernameToInternalEmail(profile.username) !== email) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) console.error("Error al cerrar la sesión:", signOutError);
    return { error: "La cuenta no tiene acceso. Contacta al administrador." };
  }

  redirect(destination);
}

export async function logout() {
  await signOut("/login");
}

export async function logoutSeller() {
  await signOut("/vendedores/login", "sellers");
}

export async function logoutPos() {
  await signOut("/pos/login", "pos");
}

export async function logoutAdmin() {
  await signOut("/administracion/login");
}

async function signOut(destination: string, scope: SessionScope = "default") {
  const supabase = await createSupabaseServerClient(scope);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("Error al cerrar la sesión:", error);
    throw new Error("No se pudo cerrar la sesión.");
  }
  redirect(destination);
}
