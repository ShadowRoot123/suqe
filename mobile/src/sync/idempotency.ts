export function makeIdempotencyKey(prefix = "cmd"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

