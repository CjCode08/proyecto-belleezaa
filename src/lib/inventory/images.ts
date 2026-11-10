import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const bucket = "inventario-privado";
const maxImageBytes = 4 * 1024 * 1024;
const maxImages = 5;

type UploadResult = { paths: string[]; error?: never } | { paths?: never; error: string };

export function getInventoryImageExtension(
  file: Pick<File, "type">,
  header: Uint8Array,
): "jpg" | "png" | "webp" | null {
  const isJpeg = file.type === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = file.type === "image/png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const isWebp = file.type === "image/webp" &&
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";

  if (isJpeg) return "jpg";
  if (isPng) return "png";
  if (isWebp) return "webp";
  return null;
}

export async function uploadInventoryImages(
  supabase: SupabaseClient<Database>,
  userId: string,
  productId: string,
  files: File[],
): Promise<UploadResult> {
  if (files.length > maxImages) return { error: "Puedes cargar hasta cinco imágenes por producto." };
  const paths: string[] = [];

  for (const file of files) {
    if (file.size === 0 || file.size > maxImageBytes) {
      const cleanupError = await removeInventoryImageObjects(supabase, paths);
      return { error: cleanupError
        ? "La imagen debe pesar hasta 4 MB. Además, no se pudieron limpiar todas las cargas incompletas."
        : "Cada imagen debe pesar más de 0 y hasta 4 MB." };
    }

    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const extension = getInventoryImageExtension(file, header);
    if (!extension) {
      const cleanupError = await removeInventoryImageObjects(supabase, paths);
      return { error: cleanupError
        ? "Formato no válido y no se pudieron limpiar todas las cargas incompletas."
        : "Solo se admiten imágenes JPEG, PNG y WebP válidas." };
    }

    const path = `${userId}/${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error("Error al cargar una imagen de inventario:", error);
      const cleanupError = await removeInventoryImageObjects(supabase, paths);
      return { error: cleanupError
        ? "Falló una carga y no se pudieron limpiar todos los archivos temporales."
        : "No se pudo cargar una imagen. Comprueba el formato y vuelve a intentarlo." };
    }
    paths.push(path);
  }

  return { paths };
}

export async function removeInventoryImageObjects(
  supabase: SupabaseClient<Database>,
  paths: string[],
): Promise<boolean> {
  if (paths.length === 0) return false;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.error("No se pudieron eliminar archivos de imágenes de inventario:", error);
    return true;
  }
  return false;
}

export async function getSignedInventoryImageUrls(
  supabase: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw new Error("No se pudieron preparar las imágenes privadas del inventario.", { cause: error });
  if (!data || data.some((image) => !image.path || !image.signedUrl || image.error)) {
    throw new Error("Una imagen de inventario no está disponible en el almacenamiento privado.");
  }
  return new Map(data.map((image) => [image.path!, image.signedUrl!]));
}
