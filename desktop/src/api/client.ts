import createClient, { type Client } from "openapi-fetch";
import { getApiBaseUrl } from "../store/sidecar";
import type { paths } from "./generated/schema";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let cached: { client: Client<paths>; baseUrl: string } | null = null;

/**
 * Returns a type-safe OpenAPI client bound to the current sidecar URL.
 * Cached and invalidated when the sidecar base URL changes (e.g. after restart).
 */
export function api(): Client<paths> {
  const baseUrl = getApiBaseUrl();
  if (!cached || cached.baseUrl !== baseUrl) {
    cached = {
      baseUrl,
      client: createClient<paths>({ baseUrl }),
    };
  }
  return cached.client;
}

/**
 * Convenience wrapper that throws ApiError on non-2xx responses,
 * so call sites can `await unwrap(api().GET("..."))` without checking `error`.
 */
export async function unwrap<TData, TError>(
  promise: Promise<{
    data?: TData;
    error?: TError;
    response: Response;
  }>
): Promise<TData> {
  const { data, error, response } = await promise;
  if (error !== undefined || !response.ok) {
    throw new ApiError(
      `${response.url} → ${response.status}`,
      response.status,
      error ?? data
    );
  }
  return data as TData;
}
