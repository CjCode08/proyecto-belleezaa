"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeInventoryImageObjects, uploadInventoryImages } from "@/lib/inventory/images";
import { capitalizeInitial, isValidSku, normalizeColor, normalizeSize, normalizeSku, validAudiences } from "@/lib/inventory/product-fields";

export type CreateProductState = { error?: string };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePrice(value: FormDataEntryValue | null): number | null {
  const raw = text(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount < 100000000 ? amount : null;
}

export async function createProduct(_state: CreateProductState, formData: FormData): Promise<CreateProductState> {
  const profile = await requireInventoryProfile();
  const name = capitalizeInitial(text(formData.get("name")));
  const description = capitalizeInitial(text(formData.get("description")));
  const newCategory = formData.get("categoryNew");
  const category = newCategory === null ? text(formData.get("category")) : capitalizeInitial(text(newCategory));
  const selectedAudiences = formData.getAll("audiences");
  const comment = capitalizeInitial(text(formData.get("comment")));
  const unitPrice = parsePrice(formData.get("unitPrice"));
  const promoPrice = parsePrice(formData.get("promoPrice"));
  const wholesalePrice = parsePrice(formData.get("wholesalePrice"));
  const fileEntries = formData.getAll("images");

  if (!validAudiences(selectedAudiences, true)) return { error: "Selecciona al menos un tipo de prenda válido." };
  if (!name || name.length > 120 || description.length > 2000 || category.length > 120 ||
      !comment || comment.length > 1000 || unitPrice === null || promoPrice === null || wholesalePrice === null ||
      fileEntries.some((file) => !(file instanceof File))) {
    return { error: "Revisa el nombre, los tres precios y el comentario obligatorio." };
  }
  const files = fileEntries.filter((file): file is File => file instanceof File && file.size > 0);

  const sizes = formData.getAll("size");
  const colors = formData.getAll("color");
  const skus = formData.getAll("sku");
  const stocks = formData.getAll("stock");
  if (!sizes.length || sizes.length !== colors.length || sizes.length !== skus.length || sizes.length !== stocks.length) {
    return { error: "Debes registrar al menos una variante completa." };
  }

  const variants = sizes.map((size, index) => {
    const stockText = text(stocks[index]);
    return {
      size: normalizeSize(text(size)),
      color: normalizeColor(text(colors[index])),
      sku: normalizeSku(text(skus[index])),
      stock: /^(0|[1-9]\d*)$/.test(stockText) ? Number(stockText) : -1,
    };
  });
  if (variants.some((variant) => !isValidSku(variant.sku))) {
    return { error: "El SKU solo admite letras, números y guiones, hasta 100 caracteres." };
  }
  if (variants.some((variant) => !variant.size || variant.size.length > 50 || !variant.color ||
      variant.color.length > 50 || variant.sku.length > 100 || !Number.isSafeInteger(variant.stock) ||
      variant.stock < 0 || variant.stock > 2147483647)) {
    return { error: "Revisa las tallas, colores y existencias de las variantes." };
  }

  const supabase = await createSupabaseServerClient();
  const productId = crypto.randomUUID();
  const upload = await uploadInventoryImages(supabase, profile.id, productId, files);
  if ("error" in upload) return { error: upload.error };

  const { error } = await supabase.rpc("inventory_create_product_v3", {
    p_product_id: productId,
    p_name: name,
    p_description: description,
    p_category: category,
    p_unit_price: unitPrice,
    p_promo_price: promoPrice,
    p_wholesale_price: wholesalePrice,
    p_variants: variants,
    p_image_paths: upload.paths,
    p_comment: comment,
    p_audiences: selectedAudiences,
  });
  if (error) {
    console.error("Error al crear el producto:", error);
    const cleanupFailed = await removeInventoryImageObjects(supabase, upload.paths);
    return { error: error.code === "23505"
      ? "No se pudo crear el producto. Comprueba que cada SKU sea único."
      : cleanupFailed
        ? "No se pudo crear el producto y quedaron archivos temporales pendientes de limpieza."
        : "No se pudo crear el producto. Comprueba los datos e inténtalo nuevamente." };
  }

  revalidatePath("/inventario/panel");
  revalidatePath("/inventario");
  redirect("/inventario");
}
