import assert from "node:assert/strict";
import { test } from "node:test";
import { openSavedCheckout, prepareCheckoutWindow } from "../src/lib/catalog/checkout-navigation.ts";

const saved = {
  kind: "saved",
  orderId: "order",
  whatsappUrl: "https://wa.me/584120000000?text=prueba",
  request: { items: [{ variantId: "v1", quantity: 2 }] },
  cartHandled: false,
};

test("prepara una pestaña independiente y detecta el bloqueo del navegador", () => {
  const popup = { opener: {}, close() {} };
  assert.equal(prepareCheckoutWindow(() => popup), popup);
  assert.equal(popup.opener, null);
  assert.equal(prepareCheckoutWindow(() => null), null);
  let closed = false;
  const blocked = {
    set opener(value) { throw new Error(`No se puede aislar: ${value}`); },
    close() { closed = true; },
  };
  assert.throws(() => prepareCheckoutWindow(() => blocked), /No se puede aislar/);
  assert.equal(closed, true);
});

test("abre WhatsApp y retira el pedido solo una vez", () => {
  const calls = [];
  let updated;
  const actions = {
    navigate: (url) => calls.push(["navigate", url]),
    save: (session) => { updated = session; calls.push(["save", session.cartHandled]); },
    clear: (items) => { calls.push(["clear", items]); return true; },
  };
  assert.deepEqual(openSavedCheckout(saved, actions), { ok: true });
  assert.deepEqual(calls, [
    ["navigate", saved.whatsappUrl],
    ["save", true],
    ["clear", saved.request.items],
  ]);
  calls.length = 0;
  assert.deepEqual(openSavedCheckout(updated, actions), { ok: true });
  assert.deepEqual(calls, [["navigate", saved.whatsappUrl]]);
});

test("conserva el carrito si falla la navegación o el registro de limpieza", () => {
  let cleared = false;
  const actions = {
    navigate: () => { throw new Error("Navegación bloqueada"); },
    save: () => {},
    clear: () => { cleared = true; return true; },
  };
  assert.equal(openSavedCheckout(saved, actions).reason, "navigation");
  assert.equal(cleared, false);
  actions.navigate = () => {};
  actions.save = () => { throw new Error("Almacenamiento bloqueado"); };
  assert.equal(openSavedCheckout(saved, actions).reason, "session");
  assert.equal(cleared, false);
});

test("informa si falla la limpieza y conserva sesiones antiguas", () => {
  let updated;
  const actions = { navigate: () => {}, save: (session) => { updated = session; }, clear: () => false };
  assert.equal(openSavedCheckout(saved, actions).reason, "cart");
  assert.equal(updated.cartError, true);
  const old = { ...saved, request: null, cartHandled: true };
  assert.deepEqual(openSavedCheckout(old, actions), { ok: true });
});
