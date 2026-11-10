import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
    return Response.json({ error: "Producto inválido." }, { status: 400, headers });
  }
  const supabase = await createSupabaseServerClient();
  const { data: images, error } = await supabase.rpc("catalog_product_images", { p_product_ids: [productId] });
  if (error || !images) {
    console.error("No se pudieron consultar las imágenes del catálogo:", error);
    return Response.json({ error: "No se pudieron consultar las imágenes." }, { status: 500, headers });
  }
  if (!images.length) return Response.json({ images: [] }, { headers });
  const { data: signed, error: signedError } = await supabase.storage
    .from("catalogo-optimizado").createSignedUrls(images.map((image) => image.image_url), 300);
  if (signedError || !signed || signed.length !== images.length || signed.some((item) => !item.signedUrl || item.error)) {
    console.error("No se pudieron firmar las imágenes del catálogo:", signedError ?? "Respuesta incompleta.");
    return Response.json({ error: "No se pudieron preparar las imágenes." }, { status: 500, headers });
  }
  return Response.json({ images: signed.map((item) => item.signedUrl) }, { headers });
}
