import { kvDelete, kvGet, kvSet } from "@/db/kv";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { formatMoney, parseMoney } from "@/util/money";

const KEY = "pos_cart_v1";

export type HeldCartLine = {
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
};

export type HeldCart = {
  location_id: string;
  lines: HeldCartLine[];
  /** ISO 8601 — when the cart was last touched, so a stale one can be recognised. */
  updated_at: string;
};

/**
 * The cart a cashier has started but not charged, kept on the device.
 *
 * A finalised sale is durable because it is a real row in `sales`; a half-rung cart was only React
 * state until now, so closing the app between the second and third item lost it. In a shop that
 * means re-scanning a basket with a queue watching, which is the sort of thing that stops people
 * trusting the till.
 *
 * It lives in `kv` rather than a table: there is exactly one per device, nothing queries across
 * carts, and it is scratch state — the moment it is charged it becomes a sale and this is cleared.
 */
export async function cartSave(cart: { location_id: string; lines: HeldCartLine[] }): Promise<void> {
  if (cart.lines.length === 0) {
    // An emptied cart is not a cart. Leaving it behind would restore a blank one forever.
    await cartClear();
    return;
  }

  const held: HeldCart = {
    location_id: cart.location_id,
    lines: cart.lines.map(normalizeLine),
    updated_at: new Date().toISOString(),
  };
  await kvSet(KEY, JSON.stringify(held));
}

/** Malformed or partial state means "no held cart", never a crash on the way into the till. */
export async function cartLoad(): Promise<HeldCart | null> {
  const raw = await kvGet(KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<HeldCart>;
    const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
    const kept = lines
      .filter((line): line is HeldCartLine => Boolean(line && typeof line === "object" && line.variant_id))
      .map(normalizeLine);
    if (kept.length === 0) return null;

    return {
      location_id: typeof parsed.location_id === "string" ? parsed.location_id : "",
      lines: kept,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function cartClear(): Promise<void> {
  await kvDelete(KEY);
}

function normalizeLine(line: HeldCartLine): HeldCartLine {
  return {
    variant_id: line.variant_id,
    sku: typeof line.sku === "string" ? line.sku : "",
    product_name: typeof line.product_name === "string" ? line.product_name : "",
    // Quantity is stored as typed, so a half-entered "1." survives a restart the way it survives
    // a re-render — but a value that is not a number at all comes back as 1 rather than breaking
    // the totals.
    quantity: formatQuantity(parseQuantity(line.quantity) ?? 1),
    unit_price: formatMoney(parseMoney(line.unit_price) ?? 0),
  };
}
