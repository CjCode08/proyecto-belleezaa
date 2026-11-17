import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("la consulta comercial limita la información pública y contempla bultos", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.products (id uuid primary key, name text, description text, category text, status text, catalog_visible boolean, audiences text[]);
      create table public.product_variants (id uuid primary key, product_id uuid, size text, color text, stock integer, sku text);
      create table public.inventory_bundles (id uuid primary key, product_id uuid, assortment_description text, stock integer);
      create table public.inventory_product_prices (product_id uuid, payment_category text, unit_price_usd numeric, promotion_price_usd numeric, promotion_quantity integer, promotion_description text, bundle_price_usd numeric, needs_review boolean);
      create table public.product_images (id uuid primary key, product_id uuid, image_type text, image_url text, display_order integer, is_primary boolean);
      insert into public.products values
        ('00000000-0000-4000-8000-000000000001', 'Franela', 'Descripción', 'Camisas', 'activo', true, array['mujeres']),
        ('00000000-0000-4000-8000-000000000002', 'Bulto', null, 'Camisas', 'activo', true, array['hombres']),
        ('00000000-0000-4000-8000-000000000003', 'Oculto', null, 'Privado', 'activo', false, array['hombres']),
        ('00000000-0000-4000-8000-000000000004', 'Inactivo', null, 'Privado', 'inhabilitado', true, array['hombres']),
        ('00000000-0000-4000-8000-000000000005', 'Agotado', null, 'Privado', 'activo', true, array['hombres']);
      insert into public.product_variants values
        ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'M', 'Rojo', 3, 'SKU-PRIVADO'),
        ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'M', 'Rojo', 3, null),
        ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'M', 'Rojo', 3, null);
      insert into public.inventory_bundles values
        ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Surtido', 2);
      insert into public.inventory_product_prices values
        ('00000000-0000-4000-8000-000000000001', 'divisas', 10, 8, 3, 'Tres unidades', 90, false),
        ('00000000-0000-4000-8000-000000000001', 'bolivares', 20, null, null, null, null, true),
        ('00000000-0000-4000-8000-000000000002', 'divisas', null, null, null, null, 80, false);
      insert into public.product_images values
        ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'catalogo', 'catalogo/franela', 1, true),
        ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'catalogo', 'catalogo/bulto', 1, true),
        ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'almacen', 'privado/franela', 1, true),
        ('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'catalogo', 'catalogo/oculto', 1, true);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261117100000_catalog_commercial_read.sql", import.meta.url), "utf8"));
    await db.exec("set role anon");
    const products = (await db.query("select * from public.catalog_commercial_products('', 0, '', '')")).rows;
    assert.deepEqual(products.map((row) => row.name), ["Bulto", "Franela"]);
    assert.equal(products[0].bundles[0].stock, 2);
    assert.equal(products[1].variants[0].stock, 3);
    assert.equal("sku" in products[1].variants[0], false);
    assert.equal(products[1].prices.length, 1);
    assert.equal(products[1].prices[0].promotion_description, "Tres unidades");
    assert.deepEqual((await db.query("select * from public.catalog_filter_categories()")).rows[0].catalog_filter_categories, ["Camisas"]);
    assert.equal((await db.query("select * from public.catalog_commercial_products('', 0, 'hombres', 'Camisas')")).rows.length, 1);
    assert.equal((await db.query("select public.catalog_can_read_image('catalogo/bulto') as allowed")).rows[0].allowed, true);
    assert.equal((await db.query("select public.catalog_can_read_image('privado/franela') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select public.catalog_can_read_image('catalogo/oculto') as allowed")).rows[0].allowed, false);
    await assert.rejects(db.query("select * from public.inventory_product_prices"), /permission denied/);
  } finally {
    await db.close();
  }
});