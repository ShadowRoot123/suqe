import { applyFilters, applyQuery, applySort, paginate } from "@/ui/table/useTableState";

type Row = { id: string; name: string; sku: string; barcode?: string | null; qty: number };

const rows: Row[] = [
  { id: "1", name: "Cola", sku: "COLA-330", barcode: "111", qty: 5 },
  { id: "2", name: "Water", sku: "WATER-500", barcode: null, qty: 30 },
  { id: "3", name: "Orange Juice", sku: "OJ-1L", barcode: "333", qty: 12 },
];

describe("table state helpers", () => {
  test("applyQuery filters by search text", () => {
    const res = applyQuery(rows, "cola", (r) => `${r.name} ${r.sku} ${r.barcode ?? ""}`);
    expect(res.map((r) => r.id)).toEqual(["1"]);
  });

  test("applyFilters applies custom filterFns", () => {
    const res = applyFilters(
      rows,
      { hasBarcode: true, minQty: "10" },
      {
        hasBarcode: (r, v) => (v === true ? Boolean(r.barcode) : true),
        minQty: (r, v) => (typeof v === "string" ? r.qty >= Number(v) : true),
      }
    );
    expect(res.map((r) => r.id)).toEqual(["3"]);
  });

  test("applySort sorts by provided getter", () => {
    const asc = applySort(rows, "qty", "asc", { qty: (r) => r.qty });
    expect(asc.map((r) => r.id)).toEqual(["1", "3", "2"]);

    const desc = applySort(rows, "qty", "desc", { qty: (r) => r.qty });
    expect(desc.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });

  test("paginate slices by page and size", () => {
    const res = paginate(rows, 2, 2);
    expect(res.map((r) => r.id)).toEqual(["3"]);
  });
});

