import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { catalogAudiences, catalogPageHref, maxCatalogSearchLength, validCatalogAudience, validCatalogSearch } from "@/lib/catalog/search";

type FilterProps = {
  search: string;
  audience: string;
  category: string;
  categories: string[];
  mobile: boolean;
};

function FilterOptions({ audience, category, categories }: Pick<FilterProps, "audience" | "category" | "categories">) {
  const selectedAudience = validCatalogAudience(audience) ? audience : "";
  const selectedCategory = validCatalogSearch(category) ? category : "";
  const categoryOptions = selectedCategory && !categories.includes(selectedCategory)
    ? [...categories, selectedCategory]
    : categories;
  const radioClass = "h-4 w-4 shrink-0 accent-[#b50638]";
  const labelClass = "flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#5b4041] hover:text-[#92002a] focus-within:text-[#92002a]";
  return (
    <>
      <fieldset className="border-t border-[#efe6e8] py-4">
        <legend className="sr-only">Tipo de prenda</legend>
        <p aria-hidden="true" className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#1e1a1c]">Tipo de prenda</p>
        <label className={labelClass}><input className={radioClass} type="radio" name="tipo" value="" defaultChecked={!selectedAudience} /> Todos los tipos</label>
        {catalogAudiences.map(({ value, label }) => (
          <label key={value} className={labelClass}><input className={radioClass} type="radio" name="tipo" value={value} defaultChecked={selectedAudience === value} /> {label}</label>
        ))}
      </fieldset>
      <fieldset className="border-t border-[#efe6e8] py-4">
        <legend className="sr-only">Categoría</legend>
        <p aria-hidden="true" className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#1e1a1c]">Categoría</p>
        <label className={labelClass}><input className={radioClass} type="radio" name="categoria" value="" defaultChecked={!selectedCategory} /> Todas las categorías</label>
        {categoryOptions.map((name) => (
          <label key={name} className={labelClass}>
            <input className={radioClass} type="radio" name="categoria" value={name} defaultChecked={selectedCategory === name} />
            <span className="break-words">{name}{!categories.includes(name) ? " (sin productos disponibles)" : ""}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function CatalogFilters({ search, audience, category, categories, mobile }: FilterProps) {
  const searchId = mobile ? "catalog-search-mobile" : "catalog-search-desktop";
  const selectedCount = Number(Boolean(audience)) + Number(Boolean(category));
  const options = <FilterOptions audience={audience} category={category} categories={categories} />;
  const actions = (
    <div className="flex flex-wrap gap-2 border-t border-[#efe6e8] pt-4">
      <button className="min-h-11 flex-1 rounded-lg bg-[#b50638] px-4 text-sm font-semibold text-white hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Aplicar filtros</button>
      {(audience || category) && <Link href={catalogPageHref(1, search)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Limpiar filtros</Link>}
    </div>
  );
  return (
    <form action="/catalogo" method="get" role="search" aria-label="Buscar y filtrar catálogo">
      <label htmlFor={searchId} className="block text-sm font-semibold">Buscar por producto o categoría</label>
      <div className="mt-2 flex gap-2">
        <input id={searchId} name="buscar" type="search" defaultValue={search} maxLength={maxCatalogSearchLength}
          placeholder="Ej. vestido" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#d9c6c8] bg-white px-3 text-sm text-[#1e1a1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]" />
        <button type="submit" aria-label="Buscar" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-[#b50638] text-white hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]"><Search aria-hidden="true" size={18} /></button>
      </div>
      {(search || audience || category) && <Link href="/catalogo" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#92002a] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Limpiar todo</Link>}
      {mobile ? (
        <details className="group mt-4 rounded-xl border border-[#e3bebf] bg-white">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-[#1e1a1c] marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
            <SlidersHorizontal aria-hidden="true" size={18} className="text-[#b50638]" /> Filtros
            {selectedCount > 0 && <span className="rounded-full bg-[#fbf1f4] px-2 py-0.5 text-xs text-[#92002a]">{selectedCount} {selectedCount === 1 ? "activo" : "activos"}</span>}
            <ChevronDown aria-hidden="true" size={18} className="ml-auto group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">{options}{actions}</div>
        </details>
      ) : (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 font-semibold"><SlidersHorizontal aria-hidden="true" size={18} className="text-[#b50638]" /> Filtrar prendas</div>
          {options}
          {actions}
        </div>
      )}
    </form>
  );
}
