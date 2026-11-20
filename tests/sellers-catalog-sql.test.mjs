import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20261120100000_sellers_catalog_read.sql", import.meta.url), "utf8");
const photos = readFileSync(new URL("../supabase/migrations/20261120110000_sellers_inventory_images.sql", import.meta.url), "utf8");

test("limita la proyeccion al vendedor activo y no concede acceso anonimo", () => {
  assert.match(sql, /staff\.id = \(select auth\.uid\(\)\) and staff\.role = 'vendedor' and staff\.is_active is true/);
  assert.match(sql, /revoke all .* from public, anon, authenticated/);
  assert.match(sql, /grant execute .* to authenticated/);
  assert.match(sql, /security definer set search_path = ''/);
});

test("incluye stock interno activo, busca por SKU y limita la pagina", () => {
  assert.match(sql, /p\.status = 'activo'/);
  assert.doesNotMatch(sql, /catalog_visible|product_images/);
  assert.match(sql, /'stock', v\.stock, 'sku', v\.sku/);
  assert.match(sql, /strpos\(lower\(coalesce\(v\.sku, ''\)\), lower\(p_search\)\)/);
  assert.match(sql, /order by p\.name, p\.id limit 25 offset p_offset/);
});

test("las fotos privadas de vendedores solo habilitan lectura de prendas disponibles", () => {
  assert.match(photos, /staff\.id = \(select auth\.uid\(\)\) and staff\.role = 'vendedor' and staff\.is_active is true/);
  assert.match(photos, /i\.image_url = p_path and i\.image_type = 'almacen' and p\.status = 'activo'/);
  assert.match(photos, /v\.stock > 0/);
  assert.match(photos, /b\.stock > 0/);
  assert.match(photos, /cardinality\(p_product_ids\) > 24/);
  assert.match(photos, /distinct on \(i\.product_id\)[\s\S]*i\.is_primary desc nulls last/);
  assert.match(photos, /for select to authenticated\s+using \(bucket_id = 'inventario-privado'/);
  assert.doesNotMatch(photos, /for (insert|update|delete|all) to|grant execute .* to anon/i);
});