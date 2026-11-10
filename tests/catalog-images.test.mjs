import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { optimizeCatalogImage } from "../src/lib/catalog/images.ts";

test("optimiza la imagen a WebP de hasta 1600 píxeles", async () => {
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#e11d48" } }).png().toBuffer();
  const output = await optimizeCatalogImage(new File([input], "foto.png", { type: "image/png" }));
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.ok(output.length <= 2 * 1024 * 1024);
});

test("rechaza archivos vacíos, demasiado grandes o con firma incorrecta", async () => {
  await assert.rejects(() => optimizeCatalogImage(new File([], "x.png", { type: "image/png" })), /hasta 8 MB/);
  await assert.rejects(() => optimizeCatalogImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "x.png", { type: "image/png" })), /hasta 8 MB/);
  await assert.rejects(() => optimizeCatalogImage(new File(["no es una imagen"], "x.png", { type: "image/png" })), /JPEG, PNG y WebP/);
});
