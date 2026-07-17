const BRIDGE_URL = process.env.NEXT_PUBLIC_RESEARCH_BRIDGE_URL || "http://127.0.0.1:8788";

export async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload as T;
}

export { BRIDGE_URL };
