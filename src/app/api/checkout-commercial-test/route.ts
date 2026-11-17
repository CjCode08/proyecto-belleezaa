import { commercialCheckoutRoute } from "@/lib/catalog/commercial-checkout-route";

export async function POST(request: Request) { return commercialCheckoutRoute(request, "test"); }