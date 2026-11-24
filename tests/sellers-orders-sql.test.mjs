import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20261123100000_sellers_orders.sql", import.meta.url), "utf8");
const returningFix = readFileSync(new URL("../supabase/migrations/20261123110000_sellers_order_returning_fix.sql", import.meta.url), "utf8");
const customerFields = readFileSync(new URL("../supabase/migrations/20261123120000_sellers_customer_fields.sql", import.meta.url), "utf8");

test("solo el vendedor activo crea y consulta sus propias órdenes", () => {
  assert.equal((sql.match(/p\.id = v_seller and p\.role = 'vendedor' and p\.is_active is true/g) ?? []).length, 2);
  assert.match(sql, /from public\.seller_orders o where o\.seller_id = v_seller/);
  assert.match(sql, /revoke all on public\.seller_orders, public\.seller_order_items from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.sellers_create_order\(uuid, text, jsonb\) to authenticated/);
  assert.match(sql, /grant execute on function public\.sellers_list_orders\(text, integer\) to authenticated/);
});

test("reserva disponibilidad por treinta minutos sin descontar el stock físico", () => {
  assert.match(sql, /o\.status = 'en_proceso' and o\.expires_at > now\(\)/);
  assert.match(sql, /v_line\.variant_stock - v_reserved < v_line\.quantity/);
  assert.match(sql, /v_line\.bundle_stock - v_reserved < v_line\.quantity/);
  assert.match(sql, /clock_timestamp\(\) \+ interval '30 minutes'/);
  assert.doesNotMatch(sql, /update public\.(product_variants|inventory_bundles).*stock/s);
});

test("impide duplicados por reintento y separa órdenes completadas de las vigentes", () => {
  assert.match(sql, /unique \(seller_id, idempotency_key\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(v_seller::text \|\| ':' \|\| p_key::text, 0\)\)/);
  assert.match(sql, /if v_previous\.request_hash <> v_hash then raise exception/);
  assert.match(sql, /p_status = 'en_proceso' and o\.status = 'en_proceso' and o\.expires_at > now\(\)/);
  assert.match(sql, /p_status = 'completada' and o\.status = 'completada'/);
  assert.match(sql, /order by o\.created_at desc, o\.id limit 25 offset p_offset/);
  assert.match(sql, /p_status = 'todas'/);
});

test("califica RETURNING para no colisionar con expires_at de RETURNS TABLE", () => {
  assert.match(sql, /insert into public\.seller_orders as created_order/);
  assert.match(sql, /returning created_order\.id, created_order\.expires_at into v_order, v_expires/);
});

test("muestra las dos modalidades de precios originales en cada tarjeta", () => {
  const sellersCart = readFileSync(new URL("../src/app/vendedores/sellers-cart.tsx", import.meta.url), "utf8");
  assert.match(sellersCart, /Bolívares/);
  assert.match(sellersCart, /Divisas/);
  assert.match(sellersCart, /bolivaresPrice/);
  assert.match(sellersCart, /divisasPrice/);
  assert.doesNotMatch(sellersCart, /convertUsdCentsToVesCents|formatVesCents|vesRate|catalog_current_rate/);
});

test("requiere nombre y cedula del cliente y los devuelve en el listado", () => {
  assert.match(customerFields, /add column if not exists customer_name text/);
  assert.match(customerFields, /add column if not exists customer_id text/);
  assert.match(customerFields, /p_customer_name text/);
  assert.match(customerFields, /p_customer_id text/);
  assert.match(customerFields, /raise exception 'Nombre y apellido invalidos'/);
  assert.match(customerFields, /raise exception 'Cedula invalida'/);
  assert.match(customerFields, /select o\.id, o\.customer_name, o\.customer_id/);
  assert.match(customerFields, /drop function if exists public\.sellers_create_order\(uuid, text, jsonb\)/);
  assert.match(customerFields, /drop function if exists public\.sellers_list_orders\(text, integer\)/);
  assert.ok(customerFields.indexOf("drop function if exists public.sellers_create_order(uuid, text, jsonb)")
    < customerFields.indexOf("create or replace function public.sellers_create_order("));
  assert.ok(customerFields.indexOf("drop function if exists public.sellers_list_orders(text, integer)")
    < customerFields.indexOf("create or replace function public.sellers_list_orders("));
});

test("la correccion reemplaza la funcion sin recrear tablas y conserva sus permisos", () => {
  assert.match(returningFix, /create or replace function public\.sellers_create_order/);
  assert.match(returningFix, /returning created_order\.id, created_order\.expires_at into v_order, v_expires/);
  assert.doesNotMatch(returningFix, /create table public\.seller_(orders|order_items)/);
  assert.match(returningFix, /revoke all on function public\.sellers_create_order\(uuid, text, jsonb\) from public, anon, authenticated/);
  assert.match(returningFix, /grant execute on function public\.sellers_create_order\(uuid, text, jsonb\) to authenticated/);
});