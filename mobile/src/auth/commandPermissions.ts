import { hasPermission } from "@/auth/permissions";
import type { Session } from "@/auth/session";

/**
 * A pure mirror of `OfflineSync::CommandPermissions::RULES` in
 * `backend/app/domains/offline_sync/command_permissions.rb`. Keep the two in step.
 *
 * Same reasoning as `purchasing/lib/orderLifecycle.ts` and `sales/lib/saleStatus.ts`: the device
 * should refuse what the server would refuse, while the user is looking at the screen, rather
 * than queueing a command that comes back rejected at the next push.
 *
 * The specific job here is that a screen must not offer a button whose command the caller may not
 * issue. Screens ask `canIssueCommand(session, entity, operation)` instead of naming a permission
 * string, so a gate cannot drift from the key the server actually checks — the failure mode this
 * replaced was a screen gated on `catalog.read` that offered "Delete variant".
 */
type Rule = string | { default: string; [operation: string]: string };

export const COMMAND_PERMISSIONS: Record<string, Rule> = {
  category: "catalog.write",
  product: "catalog.write",
  variant: "catalog.write",
  product_group: "catalog.write",
  product_group_membership: "catalog.write",
  location: "locations.write",
  inventory_adjustment: "inventory.adjust",
  stock_threshold: "inventory.adjust",
  supplier: "purchasing.write",
  purchase_order: "purchasing.write",
  purchase_receipt: "purchasing.receive",
  // Selling and undoing a sale are different jobs, which is why `pos.void_sale` exists at all.
  sale: { default: "pos.sell", update: "pos.void_sale" },
};

/** The permission key this command needs, or null for an entity the server does not know. */
export function permissionForCommand(entity: string, operation: string): string | null {
  const rule = COMMAND_PERMISSIONS[entity];
  if (rule === undefined) return null;
  if (typeof rule === "string") return rule;
  return rule[operation] ?? rule.default;
}

/**
 * Whether this session may issue the command. An entity the map does not cover is refused, the
 * same way the server fails closed on one — a screen offering a command nobody can name is a bug,
 * not a permission question.
 */
export function canIssueCommand(session: Session | null, entity: string, operation: string): boolean {
  const key = permissionForCommand(entity, operation);
  if (!key) return false;
  return hasPermission(session, key);
}
