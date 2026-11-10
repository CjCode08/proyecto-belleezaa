"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { exchangeRateChangeError, isValidExchangeRateDate, parseExchangeRate } from "@/lib/inventory/exchange-rate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExchangeRateState = { error?: string; success?: string };

function identifier(formData: FormData) {
  const raw = formData.get("id");
  const id = typeof raw === "string" && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  const expected = formData.get("updatedAt");
  return Number.isSafeInteger(id) && id <= 2147483647 && typeof expected === "string" && expected.length > 0
    ? { id, expected }
    : null;
}

function failure(error: { code: string; message: string }): ExchangeRateState {
  console.error(`Error al guardar la tasa: ${JSON.stringify({ code: error.code, message: error.message })}`);
  return { error: exchangeRateChangeError(error.code) };
}

async function save(formData: FormData, editing: boolean): Promise<ExchangeRateState> {
  const profile = await requireInventoryProfile();
  if (profile.role !== "admin") return { error: "Solo el administrador puede modificar la tasa." };

  const rateInput = formData.get("rate");
  const commentInput = formData.get("comment");
  const dateInput = formData.get("effectiveDate");
  const rate = typeof rateInput === "string" ? parseExchangeRate(rateInput) : null;
  const comment = typeof commentInput === "string" ? commentInput.trim() : "";
  if (rate === null || !comment || comment.length > 1000 ||
      typeof dateInput !== "string" || !isValidExchangeRateDate(dateInput)) {
    return { error: "Ingresa una fecha válida, una tasa positiva con hasta 6 decimales y un comentario." };
  }

  const target = editing ? identifier(formData) : null;
  if (editing && !target) return { error: "El registro no es válido. Recarga la página." };
  const supabase = await createSupabaseServerClient();
  const values = { p_rate: rate, p_comment: comment, p_effective_date: dateInput };
  const { error } = target
    ? await supabase.rpc("inventory_edit_exchange_rate", { ...values, p_id: target.id, p_expected_updated_at: target.expected })
    : await supabase.rpc("inventory_set_exchange_rate_for_date", values);
  if (error) return failure(error);

  revalidatePath("/inventario/tasa");
  revalidatePath("/inventario/panel");
  return { success: editing ? "Tasa modificada correctamente." : "Tasa registrada correctamente." };
}

export async function saveExchangeRate(_state: ExchangeRateState, formData: FormData): Promise<ExchangeRateState> {
  return save(formData, false);
}

export async function editExchangeRate(_state: ExchangeRateState, formData: FormData): Promise<ExchangeRateState> {
  return save(formData, true);
}

export async function deleteExchangeRate(_state: ExchangeRateState, formData: FormData): Promise<ExchangeRateState> {
  const profile = await requireInventoryProfile();
  if (profile.role !== "admin") return { error: "Solo el administrador puede eliminar tasas." };
  const target = identifier(formData);
  const reasonInput = formData.get("reason");
  const reason = typeof reasonInput === "string" ? reasonInput.trim() : "";
  if (!target || !reason || reason.length > 1000) return { error: "Ingresa un motivo válido para eliminar la tasa." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("inventory_delete_exchange_rate", {
    p_id: target.id, p_expected_updated_at: target.expected, p_reason: reason,
  });
  if (error) return failure(error);
  revalidatePath("/inventario/tasa");
  revalidatePath("/inventario/panel");
  return { success: "Tasa eliminada correctamente." };
}
