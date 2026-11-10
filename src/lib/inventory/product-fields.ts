export const audiences = [
  { value: "hombres", label: "Hombres" },
  { value: "mujeres", label: "Mujeres" },
  { value: "ninos", label: "Niños" },
  { value: "ninas", label: "Niñas" },
] as const;

export function validAudiences(values: FormDataEntryValue[], required: boolean): values is string[] {
  return (!required || values.length > 0) && values.length <= audiences.length &&
    values.every((value) => typeof value === "string" && audiences.some((option) => option.value === value)) &&
    new Set(values).size === values.length;
}

export function normalizeSize(value: string) {
  return value.trim().toLocaleUpperCase("es");
}

export function normalizeColor(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase("es") + trimmed.slice(1).toLocaleLowerCase("es") : "";
}

export function capitalizeInitial(value: string) {
  return value.replace(/^(\s*)(\p{L})/u, (_, spaces: string, letter: string) =>
    spaces + letter.toLocaleUpperCase("es"));
}

export function normalizeSku(value: string) {
  return value.trim().toLocaleUpperCase("es");
}

export function isValidSku(value: string) {
  return value.length <= 100 && (value === "" || /^[\p{L}\p{M}0-9-]+$/u.test(value));
}
