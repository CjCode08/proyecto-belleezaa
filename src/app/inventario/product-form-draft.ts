const controlledFields = new Set(["skuBase", "size", "color", "stock", "colorCode", "category"]);

export function restoreProductFormDraft(form: HTMLFormElement, draft: FormData) {
  const valuesByName = new Map<string, FormDataEntryValue[]>();
  for (const [name, value] of draft.entries()) {
    const values = valuesByName.get(name) ?? [];
    values.push(value);
    valuesByName.set(name, values);
  }

  const positions = new Map<string, number>();
  for (const element of Array.from(form.elements)) {
    if (!("name" in element) || typeof element.name !== "string" || !element.name) continue;
    const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (controlledFields.has(field.name) || field.disabled || ("readOnly" in field && field.readOnly)) continue;
    const values = valuesByName.get(field.name) ?? [];

    if (field.tagName === "INPUT" && (field as HTMLInputElement).type === "checkbox") {
      (field as HTMLInputElement).checked = values.some((value) => value === field.value);
      continue;
    }

    if (field.tagName === "INPUT" && (field as HTMLInputElement).type === "file") {
      const files = values.filter((value): value is File => typeof value !== "string" && value.size > 0);
      if (files.length && typeof DataTransfer !== "undefined") {
        try {
          const transfer = new DataTransfer();
          files.forEach((file) => transfer.items.add(file));
          (field as HTMLInputElement).files = transfer.files;
        } catch { /* Algunos navegadores no permiten restaurar la selección de archivos. */ }
      }
      continue;
    }

    const index = positions.get(field.name) ?? 0;
    positions.set(field.name, index + 1);
    const value = values[index];
    if (typeof value === "string") field.value = value;
  }
}