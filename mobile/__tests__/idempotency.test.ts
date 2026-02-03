import { makeIdempotencyKey } from "@/sync/idempotency";

describe("makeIdempotencyKey", () => {
  test("creates a non-empty string with prefix", () => {
    const key = makeIdempotencyKey("test");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(10);
    expect(key.startsWith("test-")).toBe(true);
  });

  test("creates different keys on subsequent calls", () => {
    const a = makeIdempotencyKey("cmd");
    const b = makeIdempotencyKey("cmd");
    expect(a).not.toBe(b);
  });
});

