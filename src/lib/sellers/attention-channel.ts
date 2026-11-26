export type AttentionChannel = "online" | "tienda";

export function isAttentionChannel(value: unknown): value is AttentionChannel {
  return value === "online" || value === "tienda";
}

export function attentionChannelLabel(value: unknown): string {
  return value === "online" ? "Online" : value === "tienda" ? "En tienda" : "Sin clasificar";
}