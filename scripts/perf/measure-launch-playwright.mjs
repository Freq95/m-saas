import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

function summarize(results) {
  const launchToRoute = results
    .map((result) => result.launchToRouteMs)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const responseToDomComplete = results
    .map((result) => result.responseToDomCompleteMs)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  return {
    runs: results.length,
    successfulCalendarRuns: results.filter((result) => result.finalUrl.includes('/calendar')).length,
    launchToRouteMs: {
      p50: percentile(launchToRoute, 50),
      p75: percentile(launchToRoute, 75),
      p95: percentile(launchToRoute, 95),
    },
    responseToDomCompleteMs: {
      p50: percentile(responseToDomComplete, 50),
      p75: percentile(responseToDomComplete, 75),
      p95: percentile(responseToDomComplete, 95),
    },
  };
}

function renderMarkdown(summary, results) {
  const rows = results.map((result) => (
    `| ${result.run} | ${result.finalUrl} | ${result.launchToRouteMs ?? '-'} | ${result.responseToDomCompleteMs ?? '-'} |`
  ));
  return [
    '# Launch Performance',
    '',
    `- Runs: ${summary.runs}`,
    `- Calendar runs: ${summary.successfulCalendarRuns}`,
    `- Launch to route p50/p75/p95: ${summary.launchToRouteMs.p50 ?? '-'} / ${summary.launchToRouteMs.p75 ?? '-'} / ${summary.launchToRouteMs.p95 ?? '-'} ms`,
    `- Response to DOM complete p50/p75/p95: ${summary.responseToDomCompleteMs.p50 ?? '-'} / ${summary.responseToDomCompleteMs.p75 ?? '-'} / ${summary.responseToDomCompleteMs.p95 ?? '-'} ms`,
    '',
    '| Run | Final URL | Launch to route (ms) | Response to DOM complete (ms) |',
    '|---:|---|---:|---:|',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const baseUrl = (args.url || process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const runs = Number.parseInt(args.runs || process.env.RUNS || '10', 10);
  const storageState = args.storageState || process.env.PLAYWRIGHT_STORAGE_STATE;
  const outputDir = args.output || process.env.OUTPUT_DIR || path.join('reports', 'perf-launch', 'latest');
  const channel = args.channel || process.env.PLAYWRIGHT_CHANNEL || undefined;

  let browser;
  const launchCandidates = channel
    ? [channel]
    : [undefined, 'msedge', 'chrome'];
  let launchError;
  for (const candidate of launchCandidates) {
    try {
      browser = await chromium.launch({
        headless: true,
        ...(candidate ? { channel: candidate } : {}),
      });
      break;
    } catch (error) {
      launchError = error;
    }
  }
  if (!browser) {
    console.error('Unable to launch Playwright Chromium.');
    console.error('Run `npx playwright install chromium`, or pass `--channel chrome` / `--channel msedge` if you use an installed browser.');
    throw launchError;
  }

  const results = [];
  try {
    for (let run = 1; run <= runs; run += 1) {
      const context = await browser.newContext({
        ...(storageState ? { storageState } : {}),
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const startedAt = Date.now();
      await page.goto(`${baseUrl}/launch`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/(calendar|login)(\?|$)/, { timeout: 20_000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => null);
      const snapshot = await page.evaluate(() => window.__densaPerf?.getSnapshot?.() ?? null);
      const finalUrl = page.url();
      const navigation = snapshot?.navigation ?? null;
      const launchVisible = snapshot?.events?.find((event) => event.name === 'densa:launch-visible')?.at;
      const routeReady = [...(snapshot?.events ?? [])].reverse().find((event) =>
        event.name === 'densa:navigation-complete' || event.name === 'densa:route-ready'
      )?.at;

      results.push({
        run,
        finalUrl,
        wallMs: Date.now() - startedAt,
        launchToRouteMs:
          typeof launchVisible === 'number' && typeof routeReady === 'number'
            ? Math.round((routeReady - launchVisible) * 100) / 100
            : null,
        responseToDomCompleteMs:
          navigation && navigation.domComplete && navigation.responseStart
            ? Math.round((navigation.domComplete - navigation.responseStart) * 100) / 100
            : null,
        snapshot,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summary = summarize(results);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'raw.json'), JSON.stringify({ baseUrl, summary, results }, null, 2));
  await fs.writeFile(path.join(outputDir, 'summary.md'), renderMarkdown(summary, results));
  console.log(renderMarkdown(summary, results));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
