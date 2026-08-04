import { COMMAND_PERMISSIONS, canIssueCommand, permissionForCommand } from "@/auth/commandPermissions";
import { hasAllPermissions, hasPermission } from "@/auth/permissions";

function session(permissions?: string[]) {
  return { accessToken: "t", orgId: "o", permissions } as any;
}

/**
 * The mirror of `OfflineSync::CommandPermissions::RULES`. `permission_gates_spec.rb` asserts from
 * the Ruby side that every entity and key in the server's map appears in this file, so the pair
 * cannot drift; what is asserted here is that the lookup itself behaves the way the server's does.
 */
describe("command permissions", () => {
  test("an entity maps to one key, whatever the operation", () => {
    for (const operation of ["create", "update", "delete"]) {
      expect(permissionForCommand("variant", operation)).toBe("catalog.write");
      expect(permissionForCommand("purchase_receipt", operation)).toBe("purchasing.receive");
    }
  });

  // Selling and undoing a sale are different jobs — the whole reason `pos.void_sale` exists.
  test("a sale splits on the operation, because a void is not a sale", () => {
    expect(permissionForCommand("sale", "create")).toBe("pos.sell");
    expect(permissionForCommand("sale", "update")).toBe("pos.void_sale");
  });

  // Fails closed, the same way the server does: an entity nobody can name is a bug, not a
  // permission question.
  test("an entity the map does not cover is refused, not waved through", () => {
    expect(permissionForCommand("wormhole", "create")).toBeNull();
    expect(canIssueCommand(session(["catalog.write"]), "wormhole", "create")).toBe(false);
    // Not even for a session that is otherwise unrestricted.
    expect(canIssueCommand(session(undefined), "wormhole", "create")).toBe(false);
  });

  test("a session is asked for exactly the key the command needs", () => {
    const cashier = session(["pos.sell"]);
    expect(canIssueCommand(cashier, "sale", "create")).toBe(true);
    expect(canIssueCommand(cashier, "sale", "update")).toBe(false);
    expect(canIssueCommand(cashier, "category", "create")).toBe(false);

    const supervisor = session(["pos.sell", "pos.void_sale"]);
    expect(canIssueCommand(supervisor, "sale", "update")).toBe(true);
  });

  test("no session issues nothing", () => {
    expect(canIssueCommand(null, "sale", "create")).toBe(false);
  });

  /**
   * `hasPermission` treats a session with no `permissions` array as unrestricted — that is how a
   * token issued before the identity call returns behaves, and every screen depends on it not
   * locking the app out mid-hydration. Pinned because `canIssueCommand` inherits it.
   */
  test("a session whose permissions have not loaded yet is not locked out", () => {
    expect(hasPermission(session(undefined), "anything")).toBe(true);
    expect(hasAllPermissions(session(undefined), ["a", "b"])).toBe(true);
    expect(canIssueCommand(session(undefined), "sale", "update")).toBe(true);
  });

  test("every entity resolves to a non-empty key", () => {
    for (const entity of Object.keys(COMMAND_PERMISSIONS)) {
      expect(permissionForCommand(entity, "create")).toEqual(expect.any(String));
      expect(permissionForCommand(entity, "create")).not.toBe("");
    }
  });
});
