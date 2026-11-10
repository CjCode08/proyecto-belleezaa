"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { catalogImageBucket, optimizeCatalogImage } from "@/lib/catalog/images";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CatalogImageState = { error?: string; success?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function admin() {
  const profile = await requireInventoryProfile();
  return profile.role === "admin";
}

function inputs(form: FormData) {
  const product = form.get("productId");
  const comment = form.get("comment");
  if (typeof product !== "string" || !uuid.test(product) || typeof comment !== "string" ||
      !comment.trim() || comment.trim().length > 1000) return null;
  return { product, comment: comment.trim() };
}

function refresh(productId: string) {
  revalidatePath(`/inventario/${productId}/imagenes-catalogo`);
  revalidatePath("/catalogo");
  revalidatePath("/inventario/auditoria");
}

export async function uploadCatalogImage(_state: CatalogImageState, form: FormData): Promise<CatalogImageState> {
  if (!await admin()) return { error: "Solo el administrador puede gestionar imágenes de catálogo." };
  const values = inputs(form);
  const file = form.get("image");
  if (!values || !(file instanceof File)) return { error: "Selecciona un producto, una imagen y un comentario válido." };

  let optimized: Buffer;
  try {
    optimized = await optimizeCatalogImage(file);
  } catch (error) {
    console.error("No se pudo optimizar la imagen de catálogo:", error);
    return { error: error instanceof RangeError ? error.message : "No se pudo procesar la imagen. Comprueba que sea un archivo válido." };
  }
  const client = await createSupabaseServerClient();
  const path = `${values.product}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await client.storage.from(catalogImageBucket).upload(path, optimized, {
    contentType: "image/webp", upsert: false,
  });
  if (uploadError) {
    console.error("No se pudo cargar la imagen de catálogo:", uploadError);
    return { error: "No se pudo cargar la imagen. Comprueba la conexión e inténtalo nuevamente." };
  }
  const { error } = await client.rpc("catalog_add_image", {
    p_product_id: values.product, p_path: path, p_comment: values.comment,
  });
  if (error) {
    console.error("No se pudo asociar la imagen de catálogo:", error.code, error.message);
    const { error: cleanupError } = await client.storage.from(catalogImageBucket).remove([path]);
    if (cleanupError) {
      console.error("No se pudo retirar la imagen temporal de catálogo:", cleanupError);
      return { error: "No se pudo guardar la imagen y quedó un archivo temporal pendiente de limpieza." };
    }
    return { error: "No se pudo asociar la imagen. Comprueba que el producto tenga menos de cinco imágenes de catálogo." };
  }
  refresh(values.product);
  return { success: "Imagen optimizada y guardada." };
}

export async function removeCatalogImage(_state: CatalogImageState, form: FormData): Promise<CatalogImageState> {
  if (!await admin()) return { error: "Solo el administrador puede gestionar imágenes de catálogo." };
  const values = inputs(form);
  const imageId = form.get("imageId");
  if (!values || typeof imageId !== "string" || !uuid.test(imageId)) return { error: "Selecciona una imagen y un comentario válido." };
  const client = await createSupabaseServerClient();
  const { data: path, error } = await client.rpc("catalog_remove_image", {
    p_product_id: values.product, p_image_id: imageId, p_comment: values.comment,
  });
  if (error || !path) {
    console.error("No se pudo retirar la imagen de catálogo:", error?.code, error?.message);
    return { error: "No se pudo retirar la imagen del catálogo." };
  }
  const { error: cleanupError } = await client.storage.from(catalogImageBucket).remove([path]);
  refresh(values.product);
  if (cleanupError) {
    console.error("No se pudo eliminar el archivo de catálogo retirado:", cleanupError);
    return { error: "La imagen ya no aparece en el catálogo, pero el archivo requiere limpieza." };
  }
  return { success: "Imagen retirada del catálogo." };
}
