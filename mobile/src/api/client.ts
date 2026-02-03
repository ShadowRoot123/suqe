import { getApiBaseUrl } from "@/config/apiBaseUrl";
import { ApiError, ApiErrorBody } from "@/api/errors";

async function readTextSafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${baseUrl}${path}`;
}

export type ApiClientOptions = {
  getAccessToken?: () => string | null;
};

export function createApiClient(options: ApiClientOptions) {
  async function request<T>(args: { path: string; method?: string; body?: unknown; headers?: Record<string, string> }) {
    const baseUrl = getApiBaseUrl();
    const url = joinUrl(baseUrl, args.path);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(args.headers ?? {}),
    };

    const accessToken = options.getAccessToken?.();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let body: BodyInit | undefined;
    if (args.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(args.body);
    }

    const res = await fetch(url, { method: args.method ?? "GET", headers, body });
    const requestId = res.headers.get("x-request-id") ?? undefined;

    if (res.status === 204) return { data: undefined as T, requestId };

    const text = await readTextSafe(res);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!res.ok) {
      let parsed: ApiErrorBody | null = null;
      if (isJson && text) {
        try {
          parsed = JSON.parse(text) as ApiErrorBody;
        } catch {
          parsed = null;
        }
      }
      if (parsed?.code && parsed?.message) {
        throw new ApiError({
          status: res.status,
          code: parsed.code,
          message: parsed.message,
          details: parsed.details,
          requestId,
        });
      }
      throw new ApiError({
        status: res.status,
        code: "http_error",
        message: text || res.statusText || "Request failed",
        requestId,
      });
    }

    if (!text) return { data: undefined as T, requestId };

    if (isJson) {
      return { data: JSON.parse(text) as T, requestId };
    }

    return { data: text as unknown as T, requestId };
  }

  return { request };
}
