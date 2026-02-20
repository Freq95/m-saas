import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loginWithCredentials } from './lib/auth';
import { ensureBenchmarkData } from './lib/data-setup';
import { BenchmarkConfig, BenchmarkContext, BenchmarkResult, RunMetadata } from './lib/types';
import { runApiCoreModule } from './modules/api-core';
import { runApiWriteModule, runEdgeChecks } from './modules/api-write';
import { runUiPagesModule } from './modules/ui-pages';
import { computeDelta, renderDeltaMarkdown, renderSummaryMarkdown } from './report';
import { withBenchmarkBypassHeaders } from './lib/benchmark-headers';

type Args = {
  config: string;
  against?: string;
  output?: string;
  module?: string;
};

function parseArgs(argv: string[]): Args {
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
  return {
    config: args.config || 'scripts/benchmark/config.baseline.json',
    against: args.against,
    output: args.output,
    module: args.module,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function hashConfig(config: BenchmarkConfig): string {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12);
}

function formatRunId(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function resolveAgainstPath(against: string, artifactsRoot: string): string {
  if (!against) return '';
  if (fs.existsSync(against) && fs.statSync(against).isFile()) {
    return against;
  }
  const asRunDir = path.join(artifactsRoot, against, 'raw.json');
  if (fs.existsSync(asRunDir)) return asRunDir;
  throw new Error(`Unable to resolve --against ${against}. Expected file path or run id under ${artifactsRoot}`);
}

async function preflight(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: 'GET',
    headers: withBenchmarkBypassHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Preflight failed at ${baseUrl}/api/auth/csrf with status ${response.status}. Start app in prod mode (next build + next start).`);
  }
}

function pickModules(moduleArg?: string): Set<string> {
  if (!moduleArg) return new Set(['api-core', 'api-write', 'ui-pages', 'edge-checks']);
  return new Set(moduleArg.split(',').map((value) => value.trim()).filter(Boolean));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }

  const config = readJson<BenchmarkConfig>(configPath);
  const baseUrl = (config.targetBaseUrl || process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000').replace('localhost', '127.0.0.1');
  await preflight(baseUrl);

  const now = new Date();
  const runId = formatRunId(now);
  const metadata: RunMetadata = {
    timestampIso: now.toISOString(),
    runId,
    runtimeLabel: config.runtimeLabel,
    targetBaseUrl: baseUrl,
    gitCommit: getGitCommit(),
    nodeVersion: process.version,
    benchmarkConfigPath: configPath,
    benchmarkConfigHash: hashConfig(config),
    envFlags: {
      redisConfigured: Boolean(process.env.REDIS_URL),
      cronConfigured: Boolean(process.env.CRON_SECRET),
      sentryConfigured: Boolean(process.env.SENTRY_DSN),
    },
  };

  const data = await ensureBenchmarkData(config);
  const actors = {
    ownerA: await loginWithCredentials(baseUrl, config.authUsers.ownerA.email, config.authUsers.ownerA.password),
    ownerB: await loginWithCredentials(baseUrl, config.authUsers.ownerB.email, config.authUsers.ownerB.password),
    staffA: await loginWithCredentials(baseUrl, config.authUsers.staffA.email, config.authUsers.staffA.password),
  };

  const context: BenchmarkContext = { config, baseUrl, actors, data };
  const selectedModules = pickModules(args.module);
  const result: BenchmarkResult = {
    metadata,
    modules: {},
  };

  if (selectedModules.has('api-core')) {
    result.modules.apiCore = await runApiCoreModule(context);
  }
  if (selectedModules.has('api-write')) {
    result.modules.apiWrite = await runApiWriteModule(context);
  }
  if (selectedModules.has('ui-pages')) {
    result.modules.uiPages = await runUiPagesModule(context);
  }
  if (selectedModules.has('edge-checks')) {
    result.modules.edgeChecks = { checks: await runEdgeChecks(context, runId) };
  }

  const rootDir = path.resolve(args.output || config.artifacts.rootDir);
  const runDir = path.join(rootDir, runId);
  const latestDir = path.join(rootDir, 'latest');
  fs.mkdirSync(runDir, { recursive: true });

  const rawPath = path.join(runDir, 'raw.json');
  fs.writeFileSync(rawPath, JSON.stringify(result, null, 2), 'utf8');

  const summaryMarkdown = renderSummaryMarkdown(result);
  const summaryPath = path.join(runDir, 'summary.md');
  fs.writeFileSync(summaryPath, summaryMarkdown, 'utf8');

  if (args.against) {
    const againstPath = resolveAgainstPath(args.against, rootDir);
    const baseline = readJson<BenchmarkResult>(againstPath);
    const delta = computeDelta(result, baseline, config.compare.neutralThresholdPct);
    result.delta = delta;
    fs.writeFileSync(rawPath, JSON.stringify(result, null, 2), 'utf8');
    const deltaPath = path.join(runDir, `delta-vs-${baseline.metadata.runId}.md`);
    fs.writeFileSync(deltaPath, renderDeltaMarkdown(delta), 'utf8');
  }

  fs.mkdirSync(latestDir, { recursive: true });
  fs.copyFileSync(rawPath, path.join(latestDir, 'raw.json'));
  fs.copyFileSync(summaryPath, path.join(latestDir, 'summary.md'));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ runId, rawPath, summaryPath }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
