import { performance } from 'perf_hooks';
import { EndpointMetric, SnapshotMetric } from './types';
import { withBenchmarkBypassHeaders } from './benchmark-headers';

type RequestFactory = (index: number) => Promise<{
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number | number[];
}>;

type RunBenchmarkOptions = {
  endpointName: string;
  path: string;
  tier: string;
  requests: number;
  concurrency: number;
  timeoutMs: number;
  requestFactory: RequestFactory;
};

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function isExpectedStatus(status: number, expected?: number | number[]): boolean {
  if (expected === undefined) return status >= 200 && status < 300;
  if (Array.isArray(expected)) return expected.includes(status);
  return status === expected;
}

export async function runSnapshot(
  name: string,
  method: string,
  path: string,
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
  body?: string,
  expectedStatus?: number | number[]
): Promise<SnapshotMetric> {
  const started = performance.now();
  let status = 0;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method,
      headers: withBenchmarkBypassHeaders(headers),
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    status = response.status;
    return {
      name,
      method,
      path,
      status,
      durationMs: Number((performance.now() - started).toFixed(2)),
      ok: isExpectedStatus(status, expectedStatus),
    };
  } catch (error) {
    return {
      name,
      method,
      path,
      status,
      durationMs: Number((performance.now() - started).toFixed(2)),
      ok: false,
      details: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function warmupBenchmark(
  requests: number,
  requestFactory: RequestFactory,
  timeoutMs: number
): Promise<void> {
  for (let i = 0; i < requests; i++) {
    const req = await requestFactory(i);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(req.url, {
        method: req.method,
        headers: withBenchmarkBypassHeaders(req.headers),
        body: req.body,
        signal: controller.signal,
      });
    } catch {
      // warmup errors are intentionally ignored
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function runEndpointBenchmark(options: RunBenchmarkOptions): Promise<EndpointMetric> {
  const {
    endpointName,
    path,
    tier,
    requests,
    concurrency,
    timeoutMs,
    requestFactory,
  } = options;

  let nextIndex = 0;
  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  let successCount = 0;
  let errorCount = 0;
  let firstMethod = 'GET';

  const started = performance.now();

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= requests) return;

      const req = await requestFactory(index);
      if (index === 0) {
        firstMethod = req.method;
      }
      const reqStart = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(req.url, {
          method: req.method,
          headers: withBenchmarkBypassHeaders(req.headers),
          body: req.body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        statuses[String(response.status)] = (statuses[String(response.status)] || 0) + 1;

        if (isExpectedStatus(response.status, req.expectedStatus)) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        statuses['ERROR'] = (statuses.ERROR || 0) + 1;
        errorCount++;
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  const elapsedMs = performance.now() - started;
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = successCount + errorCount;
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const throughputRps = total > 0 ? total / (elapsedMs / 1000) : 0;

  return {
    endpointName,
    method: firstMethod,
    path,
    tier,
    requests,
    successCount,
    errorCount,
    errorRatePct: total > 0 ? Number(((errorCount / total) * 100).toFixed(2)) : 0,
    minMs: sorted.length ? Number(sorted[0].toFixed(2)) : 0,
    maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
    avgMs: sorted.length ? Number((sum / sorted.length).toFixed(2)) : 0,
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p90Ms: Number(percentile(sorted, 90).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    throughputRps: Number(throughputRps.toFixed(2)),
    statuses,
  };
}
