import { ApiError } from "@/api/errors";
import { createApiClient } from "@/api/client";

function mockResponse(args: {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
  statusText?: string;
}): Response {
  const headers = new Map<string, string>();
  headers.set("content-type", "application/json");
  for (const [k, v] of Object.entries(args.headers ?? {})) headers.set(k.toLowerCase(), v);

  return {
    ok: args.ok,
    status: args.status,
    statusText: args.statusText ?? "",
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null } as any,
    text: async () => args.body,
  } as any;
}

describe("createApiClient", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://example.test/api/v1";
  });

  test("injects Authorization header when access token exists", async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse({ ok: true, status: 200, body: JSON.stringify({ ok: true }) })
    );
    (global as any).fetch = fetchMock;

    const client = createApiClient({ getAccessToken: () => "token-123" });
    await client.request({ path: "/health" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as any[];
    const init = call[1] as any;
    expect(init?.headers?.Authorization).toBe("Bearer token-123");
  });

  test("parses backend JSON error into ApiError", async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse({
        ok: false,
        status: 401,
        body: JSON.stringify({ code: "invalid_credentials", message: "Invalid credentials", details: { a: 1 } }),
        headers: { "x-request-id": "req-1" },
        statusText: "Unauthorized",
      })
    );
    (global as any).fetch = fetchMock;

    const client = createApiClient({ getAccessToken: () => null });

    await expect(client.request({ path: "/auth/login", method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "invalid_credentials",
      message: "Invalid credentials",
      requestId: "req-1",
    });
    await client
      .request({ path: "/auth/login", method: "POST", body: {} })
      .catch((e) => expect(e).toBeInstanceOf(ApiError));
  });
});
