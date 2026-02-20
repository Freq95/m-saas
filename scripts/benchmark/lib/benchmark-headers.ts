export function getBenchmarkBypassHeaders(): Record<string, string> {
  const enabled = process.env.BENCHMARK_MODE === 'true';
  const token = process.env.BENCHMARK_TOKEN;
  if (!enabled || !token) return {};
  return { 'x-benchmark-token': token };
}

export function withBenchmarkBypassHeaders(
  headers?: Record<string, string>
): Record<string, string> {
  return {
    ...(headers || {}),
    ...getBenchmarkBypassHeaders(),
  };
}
