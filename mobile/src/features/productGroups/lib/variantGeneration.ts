export type VariantOptionInput = { key: string; values: string[] };

export function generateVariantCombinations(options: VariantOptionInput[]): Array<Record<string, string>> {
  const valid = options.filter((o) => o.key.trim().length > 0 && o.values.some((v) => v.trim().length > 0));
  if (valid.length === 0) return [];

  const rec = (items: VariantOptionInput[]): Array<Record<string, string>> => {
    if (items.length === 0) return [{}];
    if (items.length === 1) {
      const key = items[0].key.trim();
      return items[0].values
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((v) => ({ [key]: v }));
    }

    const [first, ...rest] = items;
    const firstKey = first.key.trim();
    const restCombos = rec(rest);
    const out: Array<Record<string, string>> = [];

    first.values
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .forEach((v) => {
        restCombos.forEach((rc) => out.push({ [firstKey]: v, ...rc }));
      });

    return out;
  };

  return rec(valid);
}

