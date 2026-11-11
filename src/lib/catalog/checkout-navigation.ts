import type { CheckoutRequest } from "./checkout-validation.ts";

export type SavedCheckoutSession = {
  kind: "saved";
  orderId: string;
  whatsappUrl: string;
  request: CheckoutRequest | null;
  cartHandled: boolean;
  cartError?: boolean;
};

type NavigationResult =
  | { ok: true }
  | { ok: false; reason: "navigation" | "session"; error: unknown }
  | { ok: false; reason: "cart" };

export function prepareCheckoutWindow(open: () => Window | null): Window | null {
  const popup = open();
  if (!popup) return null;
  try {
    popup.opener = null;
    return popup;
  } catch (error) {
    popup.close();
    throw error;
  }
}

export function openSavedCheckout(
  saved: SavedCheckoutSession,
  actions: {
    navigate: (url: string) => void;
    save: (session: SavedCheckoutSession) => void;
    clear: (items: CheckoutRequest["items"]) => boolean;
  },
): NavigationResult {
  try {
    actions.navigate(saved.whatsappUrl);
  } catch (error) {
    return { ok: false, reason: "navigation", error };
  }
  if (!saved.cartHandled && saved.request) {
    try {
      actions.save({ ...saved, cartHandled: true });
    } catch (error) {
      return { ok: false, reason: "session", error };
    }
    if (!actions.clear(saved.request.items)) {
      try {
        actions.save({ ...saved, cartHandled: true, cartError: true });
      } catch (error) {
        return { ok: false, reason: "session", error };
      }
      return { ok: false, reason: "cart" };
    }
  }
  return { ok: true };
}
