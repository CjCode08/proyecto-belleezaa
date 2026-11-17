import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("registra promociones y bultos de forma atómica e idempotente", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create type public.fulfillment_type as enum ('delivery', 'envio_nacional', 'pickup');
      create type public.payment_method as enum ('bolivares', 'binance', 'efectivo');
      create table public.products (id uuid primary key, name text, status text, catalog_visible boolean);
      create table public.product_variants (id uuid primary key, product_id uuid references public.products, size text, color text, sku text, stock integer);
      create table public.inventory_bundles (id uuid primary key, product_id uuid references public.products, assortment_description text, stock integer);
      create table public.inventory_product_prices (product_id uuid, payment_category text, unit_price_usd numeric, promotion_price_usd numeric, promotion_quantity integer, bundle_price_usd numeric, needs_review boolean, primary key (product_id, payment_category));
      create table public.exchange_rates (id integer primary key, currency_from text, currency_to text, rate numeric, effective_date date, created_by uuid, updated_at timestamptz);
      create table public.orders (id uuid primary key default gen_random_uuid(), customer_name text, customer_phone text, fulfillment public.fulfillment_type, payment public.payment_method, status text, total_usd numeric(10,2), total_ves numeric(10,2), checkout_is_test boolean, checkout_state text, checkout_municipality text, checkout_address text, checkout_exchange_rate numeric, checkout_rate_date date);
      create table public.checkout_request_keys (key_hash bytea primary key, request_hash bytea not null, order_id uuid references public.orders);
      insert into public.products values ('00000000-0000-4000-8000-000000000001', 'Franela', 'activo', true);
      insert into public.product_variants values
        ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'M', 'Rojo', 'FRAN-M-R', 5),
        ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'L', 'Azul', 'FRAN-L-A', 5);
      insert into public.inventory_bundles values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Surtido M y L', 2);
      insert into public.inventory_product_prices values
        ('00000000-0000-4000-8000-000000000001', 'bolivares', 10, 8, 3, 80, false),
        ('00000000-0000-4000-8000-000000000001', 'divisas', 9, 7, 2, 70, false);
      insert into public.exchange_rates values (1, 'USD', 'VES', 100, (clock_timestamp() at time zone 'America/Caracas')::date, '00000000-0000-4000-8000-000000000001', now());
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261117110000_checkout_commercial_requests.sql", import.meta.url), "utf8"));
    const items = [
      { kind: "variant", id: "10000000-0000-4000-8000-000000000001", quantity: 2 },
      { kind: "variant", id: "10000000-0000-4000-8000-000000000002", quantity: 2 },
      { kind: "bundle", id: "20000000-0000-4000-8000-000000000001", quantity: 1 },
    ];
    const run = (key, payment, cart = items) => db.query("select * from public.checkout_create_commercial_request($1, 'Cliente', '04120000000', 'pickup', $2, '', '', '', $3::jsonb, true)", [key, payment, JSON.stringify(cart)]);
    const result = (await run("a".repeat(64), "bolivares")).rows[0];
    assert.equal(result.reused, false);
    assert.equal((await run("a".repeat(64), "bolivares")).rows[0].order_id, result.order_id);
    assert.equal((await run("a".repeat(64), "bolivares")).rows[0].reused, true);
    await assert.rejects(run("a".repeat(64), "binance"), /Clave usada/);
    const saved = (await db.query("select * from public.orders where id = $1", [result.order_id])).rows[0];
    assert.equal(Number(saved.total_usd), 114);
    assert.equal(Number(saved.total_ves), 11400);
    const lines = (await db.query("select * from public.checkout_commercial_items where order_id = $1 order by kind, sku", [result.order_id])).rows;
    assert.equal(lines.length, 3);
    assert.equal(lines.reduce((sum, line) => sum + line.promotion_units, 0), 3);
    assert.equal(lines[0].bundle_description, "Surtido M y L");
    assert.ok(lines.some((line) => line.sku === "FRAN-M-R"));
    const divisas = (await run("b".repeat(64), "binance")).rows[0];
    assert.equal(Number((await db.query("select total_usd from public.orders where id = $1", [divisas.order_id])).rows[0].total_usd), 98);
    await db.exec("update public.inventory_product_prices set promotion_quantity = 4 where payment_category = 'divisas'");
    const four = (await run("e".repeat(64), "binance", items.slice(0, 2))).rows[0];
    assert.equal(Number((await db.query("select total_usd from public.orders where id = $1", [four.order_id])).rows[0].total_usd), 28);
    await db.exec("update public.inventory_product_prices set unit_price_usd = null where payment_category = 'divisas'");
    await assert.rejects(run("f".repeat(64), "binance", [{ ...items[0], quantity: 1 }]), /precio disponible/);
    const bundleOnly = (await run("1".repeat(64), "binance", [items[2]])).rows[0];
    assert.equal(Number((await db.query("select total_usd from public.orders where id = $1", [bundleOnly.order_id])).rows[0].total_usd), 70);
    await assert.rejects(run("c".repeat(64), "bolivares", [{ ...items[0], quantity: 6 }]), /suficiente stock/);
    await assert.rejects(run("c".repeat(64), "bolivares", [{ ...items[2], quantity: 3 }]), /suficiente stock/);
    await db.exec("update public.products set catalog_visible = false");
    await assert.rejects(run("c".repeat(64), "bolivares"), /no está disponible/);
    await db.exec("update public.products set catalog_visible = true; update public.inventory_product_prices set needs_review = true where payment_category = 'bolivares'");
    await assert.rejects(run("c".repeat(64), "bolivares"), /precio disponible/);
    await db.exec("update public.inventory_product_prices set needs_review = false; update public.exchange_rates set effective_date = effective_date - 1");
    await assert.rejects(run("c".repeat(64), "bolivares"), /tasa válida/);
    await db.exec("update public.exchange_rates set effective_date = effective_date + 1");
    assert.equal(Number((await db.query("select count(*) as count from public.orders")).rows[0].count), 4);
    assert.equal((await db.query("select stock from public.product_variants where id = $1", [items[0].id])).rows[0].stock, 5);
    await db.exec("set role service_role");
    assert.equal((await run("a".repeat(64), "bolivares")).rows[0].reused, true);
    assert.equal((await db.query("select * from public.checkout_commercial_items where order_id = $1", [result.order_id])).rows.length, 3);
    await db.exec("reset role");
    await db.exec("set role anon");
    await assert.rejects(run("d".repeat(64), "bolivares"), /permission denied/);
    await assert.rejects(db.query("select * from public.checkout_commercial_items"), /permission denied/);
  } finally { await db.close(); }
});