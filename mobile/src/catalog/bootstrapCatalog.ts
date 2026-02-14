import { apiForSession, type Session } from "@/api/endpoints";
import { categoriesUpsert } from "@/catalog/categories";
import { productsUpsert } from "@/catalog/products";
import { variantsUpsert } from "@/catalog/variants";
import { kvGet, kvSet } from "@/db/kv";

function bootKey(orgId: string) {
  return `catalog_bootstrap_v1.${orgId}`;
}

export async function bootstrapCatalogIfNeeded(session: Session) {
  const existing = await kvGet(bootKey(session.orgId));
  if (existing) return;

  const api = apiForSession(session);
  const [cats, prods, vars] = await Promise.all([api.categoriesIndex(), api.productsIndex(), api.variantsIndex()]);

  for (const c of cats.categories) {
    await categoriesUpsert({ id: c.id, name: c.name, parent_id: c.parent_id, updated_at: c.updated_at });
  }
  for (const p of prods.products) {
    await productsUpsert({
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      status: p.status,
      updated_at: p.updated_at,
    });
  }
  for (const v of vars.variants) {
    await variantsUpsert({
      id: v.id,
      product_id: v.product_id,
      sku: v.sku,
      barcode: v.barcode,
      attrs: v.attrs,
      price: v.price,
      cost_price: v.cost_price,
      updated_at: v.updated_at,
    });
  }

  await kvSet(bootKey(session.orgId), new Date().toISOString());
}

