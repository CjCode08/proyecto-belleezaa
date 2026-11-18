"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeInventoryImageObjects, uploadInventoryImages } from "@/lib/inventory/images";
import { capitalizeInitial, validAudiences } from "@/lib/inventory/product-fields";
import { parseCommercialForm } from "@/lib/inventory/commercial-form";

export type CreateProductState = { error?: string; loginRequired?: boolean };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createProduct(_state: CreateProductState, formData: FormData): Promise<CreateProductState> {
  let profile;
  try {
    profile = await getInventoryProfile();
  } catch (error) {
    console.error("No se pudo verificar el acceso para crear el producto:", error);
    return { error: "No se pudo verificar la conexión o la sesión. Tus datos se conservaron; inténtalo nuevamente." };
  }
  if (!profile) {
    return { error: "La sesión terminó o no tiene acceso al inventario. Inicia sesión y vuelve a intentar; tus datos se conservaron.", loginRequired: true };
  }
  const name = capitalizeInitial(text(formData.get("name")));
  const description = capitalizeInitial(text(formData.get("description")));
  const newCategory = formData.get("categoryNew");
  const category = newCategory === null ? text(formData.get("category")) : capitalizeInitial(text(newCategory));
  const selectedAudiences = formData.getAll("audiences");
  const comment = capitalizeInitial(text(formData.get("comment")));
  const commercial = parseCommercialForm(formData, false);
  const fileEntries = formData.getAll("images");

  if (!validAudiences(selectedAudiences, true)) return { error: "Selecciona al menos un tipo de prenda válido." };
  if (!name || name.length > 120 || description.length > 2000 || category.length > 120 ||
      !comment || comment.length > 1000 ||
      fileEntries.some((file) => !(file instanceof File))) {
    return { error: "Revisa el nombre, imágenes y comentario obligatorio." };
  }
  if ("error" in commercial) return { error: commercial.error };
  const files = fileEntries.filter((file): file is File => file instanceof File && file.size > 0);

  try {
    const supabase = await createSupabaseServerClient();
    const productId = crypto.randomUUID();
    const upload = await uploadInventoryImages(supabase, profile.id, productId, files);
    if ("error" in upload) return { error: upload.error };

    const { error } = await supabase.rpc("inventory_create_product_commercial", {
      p_product_id: productId,
      p_name: name,
      p_description: description,
      p_category: category,
      p_sku_base: commercial.base,
      p_prices: commercial.prices,
      p_bundles: commercial.bundles,
      p_variants: commercial.variants,
      p_image_paths: upload.paths,
      p_comment: comment,
      p_audiences: selectedAudiences,
    });
    if (error) {
      console.error("Error al crear el producto:", error);
      const cleanupFailed = await removeInventoryImageObjects(supabase, upload.paths);
      const message = error.message.toLowerCase();
      const status = (error as typeof error & { status?: number }).status;
      const connectionError = status === 0 || /fetch failed|network|timeout|timed out|failed to fetch/.test(message);
      const loginRequired = status === 401 || error.code === "42501";
      const errorMessage = cleanupFailed
        ? "No se pudo crear el producto y quedaron archivos temporales pendientes de limpieza."
        : connectionError
          ? "No se pudo conectar con Supabase. Tus datos se conservaron; revisa la conexión y vuelve a guardar."
          : error.code === "23505"
            ? "No se pudo crear el producto. Comprueba que cada SKU sea único."
            : loginRequired
              ? "La sesión terminó o la cuenta no tiene permiso para crear productos. Tus datos se conservaron."
              : "No se pudo crear el producto. Comprueba los datos e inténtalo nuevamente.";
      return { error: errorMessage, ...(loginRequired ? { loginRequired: true } : {}) };
    }
  } catch (error) {
    console.error("Falló la conexión durante la creación del producto:", error instanceof Error ? error.message : "Error desconocido");
    return { error: "No se pudo conectar con Supabase. Tus datos se conservaron; revisa la conexión y vuelve a guardar." };
  }

  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  redirect("/inventario");
}
