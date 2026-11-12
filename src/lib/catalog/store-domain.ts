export function isStoreRoot(pathname: string, host: string | null): boolean {
  return pathname === "/" && /^(?:www\.)?belleezaa\.com(?::[0-9]{1,5})?$/i.test(host ?? "");
}
