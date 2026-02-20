import { ObjectId } from 'mongodb';

export type TierConfig = {
  concurrency: number;
  requests: number;
};

export type BenchmarkConfig = {
  targetBaseUrl: string;
  runtimeLabel: string;
  managedServer: {
    enabled: boolean;
    port: number;
  };
  tiers: Record<string, TierConfig>;
  warmup: {
    requestsPerEndpoint: number;
  };
  timeouts: {
    requestMs: number;
  };
  endpoints: {
    apiCore: Array<{ name: string; path: string; actor: 'ownerA' | 'ownerB' | 'staffA' }>;
    apiWrite: {
      clients: { name: string; path: string; actor: 'ownerA' | 'ownerB' | 'staffA' };
      teamInvite: { name: string; path: string; actor: 'ownerA' | 'ownerB' | 'staffA' };
      readAfterWritePath: string;
    };
    uiPages: Array<{ name: string; path: string; actor: 'ownerA' | 'ownerB' | 'staffA' }>;
  };
  authUsers: {
    ownerA: { email: string; password: string };
    ownerB: { email: string; password: string };
    staffA: { email: string; password: string };
  };
  dataSetup: {
    tenantA: { name: string; slug: string };
    tenantB: { name: string; slug: string };
    minimums: {
      services: number;
      clients: number;
      conversations: number;
      messages: number;
      appointments: number;
    };
  };
  artifacts: {
    rootDir: string;
  };
  compare: {
    neutralThresholdPct: number;
  };
};

export type RunMetadata = {
  timestampIso: string;
  runId: string;
  runtimeLabel: string;
  targetBaseUrl: string;
  gitCommit: string;
  nodeVersion: string;
  benchmarkConfigPath: string;
  benchmarkConfigHash: string;
  envFlags: {
    redisConfigured: boolean;
    cronConfigured: boolean;
    sentryConfigured: boolean;
  };
};

export type EndpointMetric = {
  endpointName: string;
  method: string;
  path: string;
  tier: string;
  requests: number;
  successCount: number;
  errorCount: number;
  errorRatePct: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
  statuses: Record<string, number>;
};

export type SnapshotMetric = {
  name: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ok: boolean;
  details?: Record<string, unknown>;
};

export type ModuleMetrics = {
  endpointMetrics: EndpointMetric[];
  snapshots?: SnapshotMetric[];
};

export type EdgeCheckResult = {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
};

export type DeltaMetric = {
  endpointName: string;
  tier: string;
  path: string;
  p95BeforeMs: number;
  p95AfterMs: number;
  p95DeltaPct: number;
  throughputBeforeRps: number;
  throughputAfterRps: number;
  throughputDeltaPct: number;
  errorRateBeforePct: number;
  errorRateAfterPct: number;
  errorRateDeltaPct: number;
  status: 'improved' | 'regressed' | 'neutral';
};

export type BenchmarkDelta = {
  againstRunId: string;
  neutralThresholdPct: number;
  metrics: DeltaMetric[];
};

export type BenchmarkResult = {
  metadata: RunMetadata;
  modules: {
    apiCore?: ModuleMetrics;
    apiWrite?: ModuleMetrics;
    uiPages?: ModuleMetrics;
    edgeChecks?: { checks: EdgeCheckResult[] };
  };
  delta?: BenchmarkDelta;
};

export type CookieJar = Map<string, string>;

export type AuthSession = {
  cookieHeader: string;
  jar: CookieJar;
};

export type BenchmarkActors = {
  ownerA: AuthSession;
  ownerB: AuthSession;
  staffA: AuthSession;
};

export type DataSetupResult = {
  tenantAId: ObjectId;
  tenantBId: ObjectId;
  ownerAUserId: ObjectId;
  ownerBUserId: ObjectId;
  staffAUserId: ObjectId;
};

export type BenchmarkContext = {
  config: BenchmarkConfig;
  baseUrl: string;
  actors: BenchmarkActors;
  data: DataSetupResult;
};
