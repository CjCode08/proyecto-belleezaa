"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessAdministration } from "@/lib/auth/staff-destination";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: FormDataEntryValue | null): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function redirectToRange(start: string, end: string, result: "procesada" | "error"): never {
  const params = new URLSearchParams({ desde: start, hasta: end, resultado: result });
  redirect(`/administracion/comisiones?${params.toString()}`);
}

export async function processCommission(formData: FormData) {
  const profile = await getActiveProfile();
  if (!canAccessAdministration(profile)) redirect("/administracion/login");

  const sellerId = formData.get("seller_id");
  const start = formData.get("desde");
  const end = formData.get("hasta");
  if (typeof sellerId !== "string" || !uuidPattern.test(sellerId) || !validDate(start) || !validDate(end) || start > end) {
    redirectToRange(validDate(start) ? start : "", validDate(end) ? end : "", "error");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_process_commission", {
    p_seller_id: sellerId,
    p_range_start: start,
    p_range_end: end,
  });
  if (error) {
    console.error("No se pudo procesar la comisión:", error.code, error.message);
    redirectToRange(start, end, "error");
  }

  revalidatePath("/administracion/comisiones");
  revalidatePath("/administracion/comisiones/procesadas");
  redirectToRange(start, end, "procesada");
}