"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeInventoryImageObjects, uploadInventoryImages } from "@/lib/inventory/images";
import { capitalizeInitial, validAudiences } from "@/lib/inventory/product-fields";
import { parseCommercialForm } from "@/lib/inventory/commercial-form";

export type CreateProductState = { error?: string };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createProduct(_state: CreateProductState, formData: FormData): Promise<CreateProductState> {
  const profile = await requireInventoryProfile();
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
    return { error: cleanupFailed
      ? "No se pudo crear el producto y quedaron archivos temporales pendientes de limpieza."
      : error.code === "23505"
        ? "No se pudo crear el producto. Comprueba que cada SKU sea único."
        : "No se pudo crear el producto. Comprueba los datos e inténtalo nuevamente." };
  }

  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  redirect("/inventario");
}
