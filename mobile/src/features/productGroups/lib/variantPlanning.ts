import { generateVariantCombinations, type VariantOptionInput } from "./variantGeneration";

export type ExistingVariant = { sku: string; attrs_json: string };

export type PlannedVariant = { sku: string; attrs: Record<string, string> };

function normalizeAttrs(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs)
    .map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function parseAttrsJson(json: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

export function skuSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function variantOptionsToInputs(variantOptions: Record<string, string[]>): VariantOptionInput[] {
  return Object.entries(variantOptions).map(([key, values]) => ({ key, values: values ?? [] }));
}

export function planVariantGeneration(args: {
  productName: string;
  variantOptions: Record<string, string[]>;
  existing: ExistingVariant[];
}): PlannedVariant[] {
  const combos = generateVariantCombinations(variantOptionsToInputs(args.variantOptions));
  if (combos.length === 0) return [];

  const existingAttrKeys = new Set<string>();
  const takenSkus = new Set<string>();
  for (const v of args.existing) {
    takenSkus.add(v.sku.trim().toUpperCase());
    const attrs = parseAttrsJson(v.attrs_json);
    if (attrs && Object.keys(attrs).length > 0) existingAttrKeys.add(normalizeAttrs(attrs));
  }

  const baseSlug = skuSlug(args.productName) || "VARIANT";
  const planned: PlannedVariant[] = [];
  const plannedAttrKeys = new Set<string>();

  for (const combo of combos) {
    const attrKey = normalizeAttrs(combo);
    if (existingAttrKeys.has(attrKey) || plannedAttrKeys.has(attrKey)) continue;
    plannedAttrKeys.add(attrKey);

    const valueSlug = Object.entries(combo)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => skuSlug(v))
      .filter((s) => s.length > 0)
      .join("-");
    let sku = valueSlug ? `${baseSlug}-${valueSlug}` : baseSlug;
    if (takenSkus.has(sku.toUpperCase())) {
      let n = 2;
      while (takenSkus.has(`${sku}-${n}`.toUpperCase())) n += 1;
      sku = `${sku}-${n}`;
    }
    takenSkus.add(sku.toUpperCase());

    planned.push({ sku, attrs: combo });
  }

  return planned;
}
