import { apiForSession } from "@/api/endpoints";

describe("api endpoints", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://example.test/api/v1";
  });

  test("syncPull passes device_id and cursor params", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" } as any,
      text: async () =>
        JSON.stringify({ cursor: null, next_cursor: new Date().toISOString(), changes: [], acks: [] }),
    })) as any;
    (global as any).fetch = fetchMock;

    const api = apiForSession({ accessToken: "t", orgId: "org-1" });
    await api.syncPull({ device_id: "dev-1", cursor: "2025-01-01T00:00:00.000Z", limit: 123 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/sync/pull?");
    expect(url).toContain("device_id=dev-1");
    expect(url).toContain("cursor=2025-01-01T00%3A00%3A00.000Z");
    expect(url).toContain("limit=123");
  });
});

