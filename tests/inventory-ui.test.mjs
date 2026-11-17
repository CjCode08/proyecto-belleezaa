import assert from "node:assert/strict";
import { test } from "node:test";
import { productStatusClass } from "../src/app/inventario/ui.ts";
import { readFileSync } from "node:fs";

test("los estados de inventario se distinguen por color", () => {
  assert.match(productStatusClass("activo"), /bg-emerald-100/);
  assert.match(productStatusClass("inhabilitado"), /bg-red-100/);
  assert.match(productStatusClass("reabastecer"), /bg-amber-100/);
  assert.match(productStatusClass(" Reabastecer "), /bg-amber-100/);
});

test("un estado desconocido se muestra con color neutro", () => {
  assert.match(productStatusClass(null), /bg-slate-100/);
  assert.match(productStatusClass("otro"), /bg-slate-100/);
});

test("la paleta oscura conserva contraste en superficies y estados", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  function color(name) {
    const match = css.match(new RegExp(`--dark-${name}: #(\\w{6})`));
    assert.ok(match, `Falta el color ${name}`);
    return match[1];
  }
  function luminance(hex) {
    const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  for (const [background, foreground] of [["page", "text"], ["surface", "text"], ["surface", "muted"], ["surface", "accent"], ["success-bg", "success-text"], ["error-bg", "error-text"], ["warning-bg", "warning-text"]]) {
    const values = [luminance(color(background)), luminance(color(foreground))].sort((a, b) => a - b);
    assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `${background}/${foreground} sin contraste suficiente`);
  }
});
