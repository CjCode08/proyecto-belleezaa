"use server";

import { notFound, redirect } from "next/navigation";
import { staffDestination } from "@/lib/auth/staff-destination";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  return signIn(formData, "/inventario/panel");
}

export async function loginSeller(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") notFound();
  return signIn(formData, "/vendedores");
}

async function signIn(formData: FormData, portal: "/inventario/panel" | "/vendedores"): Promise<LoginState> {
  const username = formData.get("username");
  const password = formData.get("password");
  const email = typeof username === "string" ? usernameToInternalEmail(username) : null;
  if (!email || typeof password !== "string" || password.length === 0 || password.length > 1024) {
    return { error: "Ingresa un usuario y contraseña válidos." };
  }

  const supabase = await createSupabaseServerClient();
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
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error("Error al cerrar la sesión:", signOutError);
    return { error: "No se pudo verificar el acceso. Inténtalo más tarde." };
  }

  const destination = staffDestination(profile, process.env.SELLERS_PREVIEW_ENABLED === "true");
  if (destination !== portal || !profile?.username || usernameToInternalEmail(profile.username) !== email) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error("Error al cerrar la sesión:", signOutError);
    return { error: "La cuenta no tiene acceso. Contacta al administrador." };
  }

  redirect(destination);
}

export async function logout() {
  await signOut("/login");
}

export async function logoutSeller() {
  await signOut("/vendedores/login");
}

async function signOut(destination: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error al cerrar la sesión:", error);
    throw new Error("No se pudo cerrar la sesión.");
  }
  redirect(destination);
}
