import { runEndpointBenchmark, warmupBenchmark } from '../lib/http-bench';
import { BenchmarkContext, EndpointMetric, ModuleMetrics } from '../lib/types';

export async function runUiPagesModule(context: BenchmarkContext): Promise<ModuleMetrics> {
  const metrics: EndpointMetric[] = [];

  for (const page of context.config.endpoints.uiPages) {
    const actor = context.actors[page.actor];

    await warmupBenchmark(
      context.config.warmup.requestsPerEndpoint,
      async () => ({
        method: 'GET',
        url: `${context.baseUrl}${page.path}`,
        headers: { cookie: actor.cookieHeader },
        expectedStatus: 200,
      }),
      context.config.timeouts.requestMs
    );

    for (const [tierName, tierConfig] of Object.entries(context.config.tiers)) {
      const metric = await runEndpointBenchmark({
        endpointName: page.name,
        path: page.path,
        tier: tierName,
        requests: tierConfig.requests,
        concurrency: tierConfig.concurrency,
        timeoutMs: context.config.timeouts.requestMs,
        requestFactory: async () => ({
          method: 'GET',
          url: `${context.baseUrl}${page.path}`,
          headers: { cookie: actor.cookieHeader },
          expectedStatus: 200,
        }),
      });
      metrics.push(metric);
    }
  }

  return { endpointMetrics: metrics };
}
