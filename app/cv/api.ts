// The dashboard's client for /api/cv (functions/cv/api.js), sending the
// signed-in user's ID token with every request.
import { useAuth } from "@/composables/useAuth";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function api<T>(path: string, method = "GET", body?: unknown) {
  const token = await useAuth().idToken();
  const res = await fetch(`/api/cv/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // no JSON body (a gateway error page, say)
  }
  if (!res.ok) throw new ApiError(data.error || res.statusText, res.status);
  return data as T;
}
