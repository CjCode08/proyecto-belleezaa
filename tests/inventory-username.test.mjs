import assert from "node:assert/strict";
import { test } from "node:test";
import { usernameToInternalEmail } from "../src/lib/auth/username.ts";

test("convierte el usuario a un identificador interno sin correo real", () => {
  assert.equal(usernameToInternalEmail("  Operador_1  "), "6f70657261646f725f31@belleza.invalid");
  assert.equal(usernameToInternalEmail("admin"), "61646d696e@belleza.invalid");
  assert.equal(usernameToInternalEmail("a.."), "612e2e@belleza.invalid");
});

test("rechaza usuarios incompatibles con la regla de perfiles", () => {
  for (const username of ["ab", ".usuario", "nombre con espacio", "usuario@correo.com", "área", "a".repeat(33)]) {
    assert.equal(usernameToInternalEmail(username), null);
  }
});
