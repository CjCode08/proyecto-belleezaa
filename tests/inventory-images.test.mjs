import assert from "node:assert/strict";
import { test } from "node:test";
import { getInventoryImageExtension } from "../src/lib/inventory/images.ts";

test("reconoce JPEG, PNG y WebP según su tipo y firma binaria", () => {
  assert.equal(getInventoryImageExtension({ type: "image/jpeg" }, Uint8Array.from([0xff, 0xd8, 0xff])), "jpg");
  assert.equal(getInventoryImageExtension(
    { type: "image/png" },
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ), "png");
  assert.equal(getInventoryImageExtension(
    { type: "image/webp" },
    Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
  ), "webp");
});

test("rechaza firmas falsas o extensiones MIME no permitidas", () => {
  assert.equal(getInventoryImageExtension({ type: "image/jpeg" }, Uint8Array.from([1, 2, 3])), null);
  assert.equal(getInventoryImageExtension({ type: "image/svg+xml" }, Uint8Array.from([60, 115, 118, 103])), null);
});
