import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const adminId = "00000000-0000-4000-8000-000000000001";
const staffOneId = "00000000-0000-4000-8000-000000000002";
const staffTwoId = "00000000-0000-4000-8000-000000000003";

async function setUser(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

test("filtra auditoría por mes de Caracas y usuario sin ampliar permisos de personal", async () => {
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
      create table public.profiles (id uuid primary key, full_name text, role public.user_role, is_active boolean);
      create table public.inventory_movements (
        id uuid primary key, user_id uuid references public.profiles(id), action_type text,
        comment text, quantity_change integer, created_at timestamptz, product_id uuid,
        variant_id uuid, product_snapshot text, variant_snapshot text
      );
      create table public.products (id uuid primary key, name text);
      create table public.product_variants (id uuid primary key, size text, color text);
      insert into public.profiles values
        ('${adminId}', 'Admin', 'admin', true),
        ('${staffOneId}', 'Operador Uno', 'personal', true),
        ('${staffTwoId}', 'Operador Dos', 'personal', true);
      insert into public.inventory_movements values
        ('10000000-0000-4000-8000-000000000001', '${staffOneId}', 'CREACION', 'Octubre Caracas', 1, '2026-11-01 03:30:00+00', null, null, 'Producto Uno', null),
        ('10000000-0000-4000-8000-000000000002', '${staffTwoId}', 'CREACION', 'Noviembre Caracas', 1, '2026-11-01 04:30:00+00', null, null, 'Producto Dos', null),
        ('10000000-0000-4000-8000-000000000003', '${staffOneId}', 'EDICION', 'Noviembre Uno', 2, '2026-11-15 12:00:00+00', null, null, 'Producto Uno', null);
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261118100000_inventory_audit_filters.sql", import.meta.url), "utf8");
    await db.exec(migration);

    await setUser(db, adminId);
    const users = await db.query("select * from public.inventory_audit_users() order by id");
    assert.deepEqual(users.rows.map((row) => row.id), [staffOneId, staffTwoId]);
    const october = await db.query("select * from public.inventory_audit_list_filtered(0, '2026-10', null)");
    assert.equal(october.rows.length, 1);
    assert.equal(october.rows[0].comment, "Octubre Caracas");
    const novemberOne = await db.query("select * from public.inventory_audit_list_filtered(0, '2026-11', $1)", [staffOneId]);
    assert.equal(novemberOne.rows.length, 1);
    assert.equal(novemberOne.rows[0].comment, "Noviembre Uno");
    assert.equal(Number(novemberOne.rows[0].total_count), 1);

    await setUser(db, staffOneId);
    const ownUsers = await db.query("select * from public.inventory_audit_users()");
    assert.deepEqual(ownUsers.rows.map((row) => row.id), [staffOneId]);
    const otherMovements = await db.query("select * from public.inventory_audit_list_filtered(0, null, $1)", [staffTwoId]);
    assert.equal(otherMovements.rows.length, 0);
    await assert.rejects(db.query("select * from public.inventory_audit_list_filtered(0, '2026-13', null)"), /Mes de auditoría inválido/);
    assert.equal((await db.query("select has_function_privilege('anon', 'public.inventory_audit_users()', 'EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated', 'public.inventory_audit_users()', 'EXECUTE') as allowed")).rows[0].allowed, true);
  } finally {
    await db.close();
  }
});
