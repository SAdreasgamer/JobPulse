// Typed FastAPI fetch primitive. `baseUrl` supports relative same-origin calls or an
// explicitly configured API origin.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Serialize a flat param bag to a query string (leading "?"), dropping undefined and
// empty-string values. Booleans/numbers are stringified.
export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function request<T>(path: string, init?: RequestInit, baseUrl = ""): Promise<T> {
  // Every caller passes headers as a plain record or none, so merging the default
  // Content-Type over them is a plain spread.
  const headers = init?.headers as Record<string, string> | undefined;
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
