import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedCheckoutTestOrigin, isCheckoutTestEnabled } from "../src/lib/catalog/checkout-origin.ts";

test("permite checkout test local solo en localhost durante desarrollo", () => {
  assert.equal(isAllowedCheckoutTestOrigin("http://localhost:3000", "development"), true);
  assert.equal(isAllowedCheckoutTestOrigin("http://localhost:3002", "development"), true);
  assert.equal(isAllowedCheckoutTestOrigin("https://localhost:3000", "development"), false);
  assert.equal(isAllowedCheckoutTestOrigin("http://127.0.0.1:3000", "development"), false);
});

test("permite checkout test de producción solo en Deploy Preview de Netlify", () => {
  assert.equal(isAllowedCheckoutTestOrigin("https://deploy-preview-42--belleezaa.netlify.app", "production"), true);
  assert.equal(isAllowedCheckoutTestOrigin("https://www.belleezaa.com", "production"), false);
  assert.equal(isAllowedCheckoutTestOrigin("https://belleezaa.netlify.app", "production"), false);
  assert.equal(isAllowedCheckoutTestOrigin("http://deploy-preview-42--belleezaa.netlify.app", "production"), false);
  assert.equal(isAllowedCheckoutTestOrigin("https://deploy-preview-42--belleezaa.netlify.app/path", "production"), false);
  assert.equal(isAllowedCheckoutTestOrigin("https://deploy-preview-42--belleezaa.netlify.app", "test"), false);
});

test("activa checkout test de preview solo con origen y credenciales aisladas", () => {
  const origin = "https://deploy-preview-42--belleezaa.netlify.app";
  const config = {
    enabled: "true",
    configuredOrigin: origin,
    publicSupabaseUrl: "https://test-project.supabase.co",
    testSupabaseUrl: "https://test-project.supabase.co",
    testServiceRoleKey: "test-service-role",
    testTurnstileSecret: "test-turnstile-secret",
    testTurnstileSiteKey: "test-turnstile-site-key",
    testWhatsappNumber: "584120000000",
  };
  assert.equal(isCheckoutTestEnabled(origin, "production", config), true);
  assert.equal(isCheckoutTestEnabled("https://www.belleezaa.com", "production", config), false);
  assert.equal(isCheckoutTestEnabled(origin, "production", { ...config, testSupabaseUrl: "https://production.supabase.co" }), false);
  assert.equal(isCheckoutTestEnabled(origin, "production", { ...config, testServiceRoleKey: undefined }), false);
  assert.equal(isCheckoutTestEnabled(origin, "production", { ...config, enabled: undefined }), false);
});
