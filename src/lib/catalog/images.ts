import sharp from "sharp";
import { getInventoryImageExtension } from "../inventory/images.ts";

export const catalogImageBucket = "catalogo-optimizado";
const maxInputBytes = 8 * 1024 * 1024;
const maxOutputBytes = 2 * 1024 * 1024;

export async function optimizeCatalogImage(file: File): Promise<Buffer> {
  if (file.size === 0 || file.size > maxInputBytes) {
    throw new RangeError("La imagen debe pesar más de 0 y hasta 8 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!getInventoryImageExtension(file, buffer.subarray(0, 12))) {
    throw new RangeError("Solo se admiten imágenes JPEG, PNG y WebP válidas.");
  }
  const image = sharp(buffer, { limitInputPixels: 40000000, animated: false });
  const { data, info } = await image.rotate().resize(1600, 1600, {
    fit: "inside", withoutEnlargement: true,
  }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  if (info.width < 1 || info.height < 1 || data.length > maxOutputBytes) {
    throw new RangeError("La imagen optimizada supera el límite de 2 MB.");
  }
  return data;
}
