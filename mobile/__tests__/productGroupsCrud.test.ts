import { Platform } from "react-native";

import { productGroupMembershipsFind, productGroupMembershipsListByGroup } from "@/catalog/productGroupMemberships";
import { productGroupsDelete, productGroupsGetById, productGroupsList, productGroupsUpsert } from "@/catalog/productGroups";
import { productsUpsert } from "@/catalog/products";
import { addProductToGroupOffline, createProductGroupOffline, removeProductFromGroupOffline } from "@/sync/syncEngine";

function makeMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe("product groups + memberships (web mode)", () => {
  beforeEach(() => {
    (Platform as any).OS = "web";
    (globalThis as any).localStorage = makeMemoryStorage();
  });

  test("basic product groups CRUD", async () => {
    await productGroupsUpsert({ id: "g1", name: "Group 1", updated_at: "2026-01-01T00:00:00.000Z" });
    await productGroupsUpsert({ id: "g2", name: "Group 2", updated_at: "2026-01-02T00:00:00.000Z" });

    const list1 = await productGroupsList();
    expect(list1.map((g) => g.id)).toEqual(["g2", "g1"]);

    await productGroupsUpsert({ id: "g1", name: "Group One", updated_at: "2026-01-03T00:00:00.000Z" });
    expect((await productGroupsGetById("g1"))?.name).toBe("Group One");

    await productGroupsDelete("g2");
    const list2 = await productGroupsList();
    expect(list2.map((g) => g.id)).toEqual(["g1"]);
  });

  test("syncEngine can add/remove a membership", async () => {
    const groupId = await createProductGroupOffline("Soft drinks");
    await productsUpsert({ id: "p1", name: "Cola", status: "active", updated_at: "2026-01-01T00:00:00.000Z" });

    const membershipId = await addProductToGroupOffline({ product_group_id: groupId, product_id: "p1" });

    const found = await productGroupMembershipsFind(groupId, "p1");
    expect(found?.id).toBe(membershipId);

    expect((await productGroupMembershipsListByGroup(groupId)).length).toBe(1);

    await removeProductFromGroupOffline(membershipId);
    expect((await productGroupMembershipsListByGroup(groupId)).length).toBe(0);
  });
});

