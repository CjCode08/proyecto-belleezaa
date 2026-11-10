"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { removeInventoryImageObjects, uploadInventoryImages } from "@/lib/inventory/images";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { capitalizeInitial, isValidSku, normalizeColor, normalizeSize, normalizeSku, validAudiences } from "@/lib/inventory/product-fields";

export type InventoryActionState = { error?: string };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function price(value: FormDataEntryValue | null): number | null {
  const raw = text(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed < 100000000 ? parsed : null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateProduct(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const profile = await requireInventoryProfile();
  const productId = text(formData.get("productId"));
  const name = capitalizeInitial(text(formData.get("name")));
  const description = capitalizeInitial(text(formData.get("description")));
  const newCategory = formData.get("categoryNew");
  const category = newCategory === null ? text(formData.get("category")) : capitalizeInitial(text(newCategory));
  const selectedAudiences = formData.getAll("audiences");
  const comment = capitalizeInitial(text(formData.get("comment")));
  const unitPrice = price(formData.get("unitPrice"));
  const promoPrice = price(formData.get("promoPrice"));
  const wholesalePrice = price(formData.get("wholesalePrice"));
  const fileEntries = formData.getAll("images");
  if (!validAudiences(selectedAudiences, false)) return { error: "La clasificación de la prenda no es válida." };
  if (!uuidPattern.test(productId) || !name || name.length > 120 || description.length > 2000 ||
      category.length > 120 || !comment || comment.length > 1000 ||
      unitPrice === null || promoPrice === null || wholesalePrice === null ||
      fileEntries.some((file) => !(file instanceof File))) {
    return { error: "Revisa los datos del producto, precios, imágenes y comentario obligatorio." };
  }
  const files = fileEntries.filter((file): file is File => file instanceof File && file.size > 0);

  const variantIds = formData.getAll("variantId");
  const sizes = formData.getAll("size");
  const colors = formData.getAll("color");
  const skus = formData.getAll("sku");
  const stocks = formData.getAll("stock");
  if (!sizes.length || sizes.length !== colors.length || sizes.length !== skus.length ||
      sizes.length !== stocks.length || sizes.length !== variantIds.length) {
    return { error: "Registra al menos una variante completa." };
  }

  const variants = sizes.map((size, index) => {
    const id = text(variantIds[index]);
    const stockText = text(stocks[index]);
    return {
      ...(id ? { id } : {}),
      size: normalizeSize(text(size)),
      color: normalizeColor(text(colors[index])),
      sku: normalizeSku(text(skus[index])),
      stock: /^(0|[1-9]\d*)$/.test(stockText) ? Number(stockText) : -1,
    };
  });
  if (variants.some((variant) => !isValidSku(variant.sku))) {
    return { error: "El SKU solo admite letras, números y guiones, hasta 100 caracteres." };
  }
  if (variants.some((variant) => (variant.id && !uuidPattern.test(variant.id)) ||
      !variant.size || variant.size.length > 50 || !variant.color || variant.color.length > 50 ||
      variant.sku.length > 100 || !Number.isSafeInteger(variant.stock) ||
      variant.stock < 0 || variant.stock > 2147483647) ||
      new Set(variants.flatMap((variant) => variant.id ? [variant.id] : [])).size !== variants.filter((variant) => variant.id).length) {
    return { error: "Revisa las tallas, colores, SKU e inventario de las variantes." };
  }

  const imageIds = formData.getAll("removeImageId").map((value) => text(value));
  if (imageIds.some((id) => !uuidPattern.test(id)) || new Set(imageIds).size !== imageIds.length) {
    return { error: "La selección de imágenes a retirar no es válida." };
  }

  const supabase = await createSupabaseServerClient();
  const upload = await uploadInventoryImages(supabase, profile.id, productId, files);
  if ("error" in upload) return { error: upload.error };

  const { data: removedPaths, error } = await supabase.rpc("inventory_update_product_v2", {
    p_product_id: productId,
    p_name: name,
    p_description: description,
    p_category: category,
    p_unit_price: unitPrice,
    p_promo_price: promoPrice,
    p_wholesale_price: wholesalePrice,
    p_variants: variants,
    p_add_image_paths: upload.paths,
    p_remove_image_ids: imageIds,
    p_comment: comment,
    p_audiences: selectedAudiences,
  });
  if (error || !removedPaths) {
    if (error) console.error(`Error al modificar el producto: ${JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })}`);
    else console.error("Error al modificar el producto: la función no devolvió las rutas de imágenes retiradas.");
    const cleanupFailed = await removeInventoryImageObjects(supabase, upload.paths);
    return { error: cleanupFailed
      ? "No se pudo guardar la modificación y quedaron imágenes temporales pendientes de limpieza."
      : error?.code === "23505"
        ? "No se pudo guardar: comprueba que cada SKU sea único."
        : error?.code === "23503"
          ? "No se puede quitar una variante asociada a un pedido."
          : "No se pudo modificar el producto. Comprueba los datos e inténtalo nuevamente." };
  }

  const cleanupFailed = await removeInventoryImageObjects(supabase, removedPaths);
  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  revalidatePath("/inventario/auditoria");
  redirect(cleanupFailed
    ? `/inventario?limpieza=pendiente`
    : `/inventario?editado=1`);
}

export async function setProductStatus(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryProfile();
  const productId = text(formData.get("productId"));
  const status = text(formData.get("status"));
  const comment = text(formData.get("comment"));
  if (!uuidPattern.test(productId) || !["activo", "inhabilitado"].includes(status) ||
      !comment || comment.length > 1000) {
    return { error: "El estado y un comentario válido son obligatorios." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("inventory_set_product_status", {
    p_product_id: productId,
    p_status: status,
    p_comment: comment,
  });
  if (error) {
    console.error("Error al cambiar el estado del producto:", error);
    return { error: "No se pudo cambiar el estado del producto." };
  }

  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  revalidatePath("/inventario/auditoria");
  redirect(`/inventario?estado=${status}`);
}

export async function deleteProduct(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const profile = await requireInventoryProfile();
  if (profile.role !== "admin") return { error: "Solo el administrador puede eliminar productos." };
  const productId = text(formData.get("productId"));
  const comment = text(formData.get("comment"));
  if (!uuidPattern.test(productId) || !comment || comment.length > 1000) {
    return { error: "El comentario y producto seleccionado son obligatorios." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: removedImages, error } = await supabase.rpc("catalog_delete_product", {
    p_product_id: productId,
    p_comment: comment,
  });
  if (error || !removedImages || removedImages.length !== 1) {
    if (error) console.error("Error al eliminar el producto:", error);
    return { error: error?.code === "23503"
      ? "El producto tiene pedidos asociados. Puedes inhabilitarlo en lugar de eliminarlo."
      : "No se pudo eliminar el producto." };
  }

  const cleanupFailed = await removeInventoryImageObjects(supabase, removedImages[0].warehouse_paths);
  const catalogPaths = removedImages[0].catalog_paths;
  const { error: catalogCleanupError } = catalogPaths.length
    ? await supabase.storage.from("catalogo-optimizado").remove(catalogPaths)
    : { error: null };
  if (catalogCleanupError) console.error("No se pudieron eliminar las imágenes de catálogo del producto:", catalogCleanupError);
  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  revalidatePath("/inventario/auditoria");
  redirect(cleanupFailed || catalogCleanupError ? "/inventario?limpieza=pendiente" : "/inventario?eliminado=1");
}
