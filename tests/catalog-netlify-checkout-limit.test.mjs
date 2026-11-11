import assert from "node:assert/strict";
import { test } from "node:test";
import checkoutRateLimit, { config } from "../netlify/edge-functions/checkout-rate-limit.js";

test("declara el límite por IP para la futura ruta de checkout", () => {
  assert.deepEqual(config.path, ["/api/checkout", "/api/checkout/"]);
  assert.deepEqual(config.rateLimit, {
    windowLimit: 5,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  });
  assert.equal(checkoutRateLimit(), undefined);
});
