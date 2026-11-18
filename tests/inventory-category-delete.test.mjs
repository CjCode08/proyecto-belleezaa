import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const adminId = "00000000-0000-4000-8000-000000000001";
const staffId = "00000000-0000-4000-8000-000000000002";

async function setUser(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

test("la eliminación de categoría requiere admin, bloquea categorías usadas y registra auditoría", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create type public.user_role as enum ('admin', 'personal');
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.profiles (id uuid primary key, role public.user_role, is_active boolean, full_name text);
      create table public.inventory_categories (
        id bigint generated always as identity primary key,
        name text not null check (length(btrim(name)) between 1 and 120)
      );
      create unique index inventory_categories_name_unique on public.inventory_categories (lower(btrim(name)));
      create table public.products (id uuid primary key, category text);
      create table public.inventory_movements (
        id bigint generated always as identity primary key,
        product_id uuid,
        variant_id uuid,
        user_id uuid not null,
        action_type text not null,
        quantity_change integer,
        comment text,
        product_snapshot text,
        variant_snapshot text,
        created_at timestamptz not null default now()
      );
      insert into public.profiles values
        ('${adminId}', 'admin', true, 'Admin'),
        ('${staffId}', 'personal', true, 'Operador');
      insert into public.inventory_categories (name) values ('Temporal'), ('En uso');
      insert into public.products values ('10000000-0000-4000-8000-000000000001', 'En uso');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261118110000_inventory_delete_category.sql", import.meta.url), "utf8"));

    await setUser(db, adminId);
    await db.query("select public.inventory_delete_category($1)", ["Temporal"]);
    assert.equal((await db.query("select count(*) as count from public.inventory_categories where name = 'Temporal'")).rows[0].count, 0);
    const movement = (await db.query("select user_id, action_type, comment, product_snapshot from public.inventory_movements")).rows[0];
    assert.equal(movement.user_id, adminId);
    assert.equal(movement.action_type, "ELIMINACION");
    assert.match(movement.comment, /Categoría eliminada: Temporal/);
    assert.equal(movement.product_snapshot, "Categoría: Temporal");
    await assert.rejects(db.query("select public.inventory_delete_category('En uso')"), /No se puede eliminar una categoría asignada/);
    assert.equal((await db.query("select count(*) as count from public.inventory_categories where name = 'En uso'")).rows[0].count, 1);

    await setUser(db, staffId);
    await assert.rejects(db.query("select public.inventory_delete_category('En uso')"), /Solo el administrador/);
    assert.equal((await db.query("select has_function_privilege('anon', 'public.inventory_delete_category(text)', 'EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated', 'public.inventory_delete_category(text)', 'EXECUTE') as allowed")).rows[0].allowed, true);
  } finally {
    await db.close();
  }
});

test("el botón de eliminación solo aparece en la lista de categorías del administrador", async () => {
  const source = await readFile(new URL("../src/app/inventario/product-fields.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(id) {
      if (id === "lucide-react") return { Trash2: () => null };
      if (id === "./actions") return { deleteInventoryCategory: async () => ({}) };
      if (id === "@/lib/inventory/product-fields") return { audiences: [], capitalizeInitial: (value) => value };
      return require(id);
    },
  });
  const categories = ["Franela", "Conjuntos"];
  const staffMarkup = renderToStaticMarkup(React.createElement(exports.CategoryField, { categories }));
  const adminMarkup = renderToStaticMarkup(React.createElement(exports.CategoryField, { categories, canDeleteCategories: true }));
  assert.doesNotMatch(staffMarkup, /Eliminar categoría/);
  assert.match(adminMarkup, /aria-label="Eliminar categoría Franela"/);
  assert.ok(adminMarkup.lastIndexOf("Franela") > adminMarkup.indexOf('aria-label="Eliminar categoría Franela"'));
});
