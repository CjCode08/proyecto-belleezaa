export default function checkoutRateLimit() {
  return undefined;
}

export const config = {
  path: ["/api/checkout", "/api/checkout/"],
  rateLimit: {
    windowLimit: 5,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
