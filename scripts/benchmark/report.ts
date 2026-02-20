import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BenchmarkDelta,
  BenchmarkResult,
  DeltaMetric,
  EndpointMetric,
} from './lib/types';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function flattenMetrics(result: BenchmarkResult): EndpointMetric[] {
  return [
    ...(result.modules.apiCore?.endpointMetrics || []),
    ...(result.modules.apiWrite?.endpointMetrics || []),
    ...(result.modules.uiPages?.endpointMetrics || []),
  ];
}

function pctDelta(before: number, after: number): number {
  if (before === 0 && after === 0) return 0;
  if (before === 0) return 100;
  return Number((((after - before) / before) * 100).toFixed(2));
}

function classifyDelta(delta: DeltaMetric, neutralThresholdPct: number): DeltaMetric['status'] {
  const improved =
    delta.p95DeltaPct <= -neutralThresholdPct ||
    delta.throughputDeltaPct >= neutralThresholdPct ||
    delta.errorRateDeltaPct <= -neutralThresholdPct;
  const regressed =
    delta.p95DeltaPct >= neutralThresholdPct ||
    delta.throughputDeltaPct <= -neutralThresholdPct ||
    delta.errorRateDeltaPct >= neutralThresholdPct;
  if (improved && !regressed) return 'improved';
  if (regressed && !improved) return 'regressed';
  return 'neutral';
}

export function computeDelta(
  current: BenchmarkResult,
  baseline: BenchmarkResult,
  neutralThresholdPct: number
): BenchmarkDelta {
  const baselineMap = new Map<string, EndpointMetric>();
  for (const metric of flattenMetrics(baseline)) {
    baselineMap.set(`${metric.endpointName}::${metric.path}::${metric.tier}`, metric);
  }

  const metrics: DeltaMetric[] = [];
  for (const currentMetric of flattenMetrics(current)) {
    const key = `${currentMetric.endpointName}::${currentMetric.path}::${currentMetric.tier}`;
    const baselineMetric = baselineMap.get(key);
    if (!baselineMetric) continue;

    const delta: DeltaMetric = {
      endpointName: currentMetric.endpointName,
      tier: currentMetric.tier,
      path: currentMetric.path,
      p95BeforeMs: baselineMetric.p95Ms,
      p95AfterMs: currentMetric.p95Ms,
      p95DeltaPct: pctDelta(baselineMetric.p95Ms, currentMetric.p95Ms),
      throughputBeforeRps: baselineMetric.throughputRps,
      throughputAfterRps: currentMetric.throughputRps,
      throughputDeltaPct: pctDelta(baselineMetric.throughputRps, currentMetric.throughputRps),
      errorRateBeforePct: baselineMetric.errorRatePct,
      errorRateAfterPct: currentMetric.errorRatePct,
      errorRateDeltaPct: pctDelta(baselineMetric.errorRatePct, currentMetric.errorRatePct),
      status: 'neutral',
    };
    delta.status = classifyDelta(delta, neutralThresholdPct);
    metrics.push(delta);
  }

  return {
    againstRunId: baseline.metadata.runId,
    neutralThresholdPct,
    metrics,
  };
}

function moduleSection(name: string, metrics: EndpointMetric[] | undefined): string {
  if (!metrics || metrics.length === 0) return `## ${name}\nNo metrics captured.\n`;
  const rows = [
    '| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |',
    '|---|---:|---|---:|---:|---:|---:|',
    ...metrics.map((metric) =>
      `| ${metric.endpointName} | ${metric.tier} | ${metric.method} | ${metric.p95Ms} | ${metric.avgMs} | ${metric.throughputRps} | ${metric.errorRatePct} |`
    ),
  ];
  return `## ${name}\n${rows.join('\n')}\n`;
}

function edgeChecksSection(result: BenchmarkResult): string {
  const checks = result.modules.edgeChecks?.checks || [];
  if (checks.length === 0) return '## Edge Checks\nNo edge checks captured.\n';
  const rows = [
    '| Check | Passed | Details |',
    '|---|---|---|',
    ...checks.map((check) => `| ${check.name} | ${check.passed ? 'yes' : 'no'} | ${JSON.stringify(check.details)} |`),
  ];
  return `## Edge Checks\n${rows.join('\n')}\n`;
}

export function renderSummaryMarkdown(result: BenchmarkResult): string {
  const lines = [
    '# Benchmark Summary',
    '',
    `- Run ID: \`${result.metadata.runId}\``,
    `- Timestamp: \`${result.metadata.timestampIso}\``,
    `- Runtime: \`${result.metadata.runtimeLabel}\``,
    `- Target: \`${result.metadata.targetBaseUrl}\``,
    `- Commit: \`${result.metadata.gitCommit}\``,
    `- Node: \`${result.metadata.nodeVersion}\``,
    '',
    moduleSection('API Core', result.modules.apiCore?.endpointMetrics),
    moduleSection('API Write', result.modules.apiWrite?.endpointMetrics),
    moduleSection('UI Pages', result.modules.uiPages?.endpointMetrics),
    edgeChecksSection(result),
  ];
  return `${lines.join('\n')}\n`;
}

export function renderDeltaMarkdown(delta: BenchmarkDelta): string {
  const rows = [
    '| Endpoint | Tier | p95 Δ% | Throughput Δ% | Error Δ% | Status |',
    '|---|---:|---:|---:|---:|---|',
    ...delta.metrics.map(
      (metric) =>
        `| ${metric.endpointName} | ${metric.tier} | ${metric.p95DeltaPct} | ${metric.throughputDeltaPct} | ${metric.errorRateDeltaPct} | ${metric.status} |`
    ),
  ];
  return [
    '# Benchmark Delta',
    '',
    `- Against Run: \`${delta.againstRunId}\``,
    `- Neutral Threshold: \`${delta.neutralThresholdPct}%\``,
    '',
    ...rows,
    '',
  ].join('\n');
}

function loadResult(filePath: string): BenchmarkResult {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as BenchmarkResult;
}

function writeFile(targetPath: string, contents: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;
  if (!input) {
    throw new Error('Missing required --input <raw.json>');
  }

  const result = loadResult(input);
  const summary = renderSummaryMarkdown(result);
  const outputSummary = args.output || path.join(path.dirname(input), 'summary.md');
  writeFile(outputSummary, summary);

  const against = args.against;
  if (against) {
    const baseline = loadResult(against);
    const neutralThreshold = Number(args.threshold || 5);
    const delta = computeDelta(result, baseline, neutralThreshold);
    const deltaMarkdown = renderDeltaMarkdown(delta);
    const deltaPath = path.join(path.dirname(outputSummary), `delta-vs-${baseline.metadata.runId}.md`);
    writeFile(deltaPath, deltaMarkdown);
  }

  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputSummary}`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const current = fileURLToPath(import.meta.url);
if (entry === current) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
