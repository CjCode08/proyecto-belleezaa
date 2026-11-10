import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InventoryDashboardData = {
  totalProducts: number;
  activeProducts: number;
  criticalVariants: number;
  totalStockUnits: number;
  totalInventoryValueUsd: number;
  latestMovements: {
    id: string;
    actionType: string;
    quantityChange: number | null;
    comment: string | null;
    createdAt: string;
  }[];
  lowStockVariants: {
    id: string;
    size: string;
    color: string;
    stock: number;
    sku: string | null;
    productName: string;
  }[];
};

export async function getInventoryDashboardData(): Promise<InventoryDashboardData> {
  const supabase = await createSupabaseServerClient();

  const [productsResult, variantsResult, movementsResult] = await Promise.all([
    supabase.from("products").select("id, name, unit_price, status"),
    supabase
      .from("product_variants")
      .select("id, size, color, stock, sku, product_id, products(name, unit_price)"),
    supabase
      .from("inventory_movements")
      .select("id, action_type, quantity_change, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (productsResult.error) throw new Error("No se pudieron consultar los productos.", { cause: productsResult.error });
  if (variantsResult.error) throw new Error("No se pudieron consultar las variantes.", { cause: variantsResult.error });
  if (movementsResult.error) throw new Error("No se pudieron consultar los movimientos.", { cause: movementsResult.error });
  if (!productsResult.data || !variantsResult.data || !movementsResult.data) {
    throw new Error("La consulta de inventario no devolvió datos.");
  }

  const productList = productsResult.data;
  const variantsList = variantsResult.data;

  const totalProducts = productList.length;
  const activeProducts = productList.filter((p) => (p.status ?? "activo") === "activo").length;

  const criticalVariants = variantsList.filter((v) => v.stock <= 3).length;
  const totalStockUnits = variantsList.reduce((acc, v) => acc + (v.stock ?? 0), 0);

  const totalInventoryValueUsd = variantsList.reduce((acc, v) => {
    const rel = Array.isArray(v.products) ? v.products[0] : v.products;
    const unitPrice = rel?.unit_price ?? 0;
    return acc + unitPrice * (v.stock ?? 0);
  }, 0);

  const lowStockVariants = variantsList
    .filter((v) => v.stock <= 5)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8)
    .map((v) => {
      const rel = Array.isArray(v.products) ? v.products[0] : v.products;
      return {
        id: v.id,
        size: v.size,
        color: v.color,
        stock: v.stock,
        sku: v.sku,
        productName: rel?.name ?? "Producto",
      };
    });

  return {
    totalProducts,
    activeProducts,
    criticalVariants,
    totalStockUnits,
    totalInventoryValueUsd,
    latestMovements:
      movementsResult.data.map((m) => ({
        id: m.id,
        actionType: m.action_type,
        quantityChange: m.quantity_change,
        comment: m.comment,
        createdAt: m.created_at,
      })),
    lowStockVariants,
  };
}
