import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessAdministration, canAccessPos, staffDestination } from "../src/lib/auth/staff-destination.ts";

test("mantiene el acceso de inventario independiente de la vista previa", () => {
  for (const role of ["admin", "personal"]) {
    for (const enabled of [true, false]) {
      assert.equal(staffDestination({ role, is_active: true }, enabled), "/inventario/panel");
    }
  }
});

test("envia al vendedor activo a su modulo solo con la vista previa habilitada", () => {
  const profile = { role: "vendedor", is_active: true };
  assert.equal(staffDestination(profile, true), "/vendedores");
  assert.equal(staffDestination(profile, false), null);
});

test("rechaza perfiles inactivos, faltantes o de roles no habilitados", () => {
  for (const role of ["admin", "personal", "vendedor"]) {
    assert.equal(staffDestination({ role, is_active: false }, true), null);
  }
  assert.equal(staffDestination({ role: "cajero", is_active: true }, true), null);
  assert.equal(staffDestination({ role: "vendedor", is_active: null }, true), null);
  assert.equal(staffDestination(null, true), null);
});

test("POS admite solo cajero o administrador activo y requiere habilitacion", () => {
  for (const role of ["admin", "cajero"]) {
    assert.equal(canAccessPos({ role, is_active: true }, true), true);
    assert.equal(canAccessPos({ role, is_active: true }, false), false);
    assert.equal(canAccessPos({ role, is_active: false }, true), false);
  }
  for (const role of ["personal", "vendedor", "dueno"]) {
    assert.equal(canAccessPos({ role, is_active: true }, true), false);
  }
  assert.equal(canAccessPos(null, true), false);
});

test("Administracion admite unicamente al administrador activo", () => {
  assert.equal(canAccessAdministration({ role: "admin", is_active: true }), true);
  for (const role of ["personal", "vendedor", "cajero", "dueno"]) {
    assert.equal(canAccessAdministration({ role, is_active: true }), false);
  }
  assert.equal(canAccessAdministration({ role: "admin", is_active: false }), false);
  assert.equal(canAccessAdministration({ role: "admin", is_active: null }), false);
  assert.equal(canAccessAdministration(null), false);
});