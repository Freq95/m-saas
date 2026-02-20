import { runEndpointBenchmark, warmupBenchmark } from '../lib/http-bench';
import { BenchmarkContext, EndpointMetric, ModuleMetrics } from '../lib/types';

export async function runApiCoreModule(context: BenchmarkContext): Promise<ModuleMetrics> {
  const metrics: EndpointMetric[] = [];
  const endpoints = context.config.endpoints.apiCore;

  for (const endpoint of endpoints) {
    const actor = context.actors[endpoint.actor];

    await warmupBenchmark(
      context.config.warmup.requestsPerEndpoint,
      async () => ({
        method: 'GET',
        url: `${context.baseUrl}${endpoint.path}`,
        headers: { cookie: actor.cookieHeader },
      }),
      context.config.timeouts.requestMs
    );

    for (const [tierName, tierConfig] of Object.entries(context.config.tiers)) {
      const metric = await runEndpointBenchmark({
        endpointName: endpoint.name,
        path: endpoint.path,
        tier: tierName,
        requests: tierConfig.requests,
        concurrency: tierConfig.concurrency,
        timeoutMs: context.config.timeouts.requestMs,
        requestFactory: async () => ({
          method: 'GET',
          url: `${context.baseUrl}${endpoint.path}`,
          headers: { cookie: actor.cookieHeader },
        }),
      });
      metrics.push(metric);
    }
  }

  return { endpointMetrics: metrics };
}
