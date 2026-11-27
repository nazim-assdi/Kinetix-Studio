/** Prefer a server-managed key; fall back to the current user's request key. */
export function resolveGeminiApiKey(
  serverKey?: string | null,
  requestKey?: string | null
): string | null {
  const configuredServerKey = serverKey?.trim();
  if (configuredServerKey) return configuredServerKey;

  const suppliedRequestKey = requestKey?.trim();
  return suppliedRequestKey || null;
}
