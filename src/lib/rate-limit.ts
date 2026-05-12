const buckets = new Map<string, { count: number; resetAt: number }>();

export function assertRateLimit(key: string, limit = 40, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new Error("Demasiadas acciones en poco tiempo. Intentá nuevamente en un minuto.");
  }

  bucket.count += 1;
}
