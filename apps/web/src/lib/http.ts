export function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("studentos_csrf="));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice("studentos_csrf=".length));
  } catch {
    return undefined;
  }
}

export function mutationHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const token = csrfToken();
  return { ...headers, ...(token ? { "x-studentos-csrf": token } : {}) };
}
