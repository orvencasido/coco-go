// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((dict) => dict.android),
  },
}));

import {
  runEvaluationBenchmark,
  formatMarkdownSummaryTable,
  BenchmarkSummary,
} from './eval-runner';

describe('coco-go Phase 6: Automated Evaluation & Accuracy Benchmark Suite', () => {
  let summary: BenchmarkSummary;

  beforeAll(async () => {
    summary = await runEvaluationBenchmark();
    // Print comprehensive score report to standard output
    const markdownReport = formatMarkdownSummaryTable(summary);
    console.log('\n' + markdownReport + '\n');
  }, 60000);

  it('evaluates at least 20+ realistic commuter benchmark queries', () => {
    expect(summary.totalQueries).toBeGreaterThanOrEqual(20);
    expect(summary.results.length).toBe(summary.totalQueries);
  });

  it('achieves >= 95% overall benchmark pass rate', () => {
    expect(summary.overallPassRatePct).toBeGreaterThanOrEqual(95.0);
  });

  it('achieves >= 95% entity and intent extraction accuracy', () => {
    expect(summary.entityExtractionAccuracyPct).toBeGreaterThanOrEqual(95.0);
  });

  it('achieves >= 95% deterministic route resolution accuracy', () => {
    expect(summary.routeResolutionAccuracyPct).toBeGreaterThanOrEqual(95.0);
  });

  it('enforces ZERO (0.0%) hallucination rate across all transit queries', () => {
    expect(summary.hallucinationRatePct).toBe(0.0);
  });

  it('verifies core user query "Lucena to SM Makati" produces verified routes', () => {
    const coreResult = summary.results.find((r) => r.id === 'tc-001');
    expect(coreResult).toBeDefined();
    expect(coreResult?.passed).toBe(true);
    expect(coreResult?.routeCount).toBeGreaterThanOrEqual(2);
    expect(coreResult?.totalFare).toBeGreaterThan(200);
    expect(coreResult?.transferCount).toBeLessThanOrEqual(2);
  });

  it('verifies direct corridor queries (PITX to Cubao, Buendia to Ayala) resolve zero transfers', () => {
    const pitxCubao = summary.results.find((r) => r.id === 'tc-009');
    expect(pitxCubao).toBeDefined();
    expect(pitxCubao?.passed).toBe(true);
    expect(pitxCubao?.transferCount).toBe(0);

    const buendiaAyala = summary.results.find((r) => r.id === 'tc-010');
    expect(buendiaAyala).toBeDefined();
    expect(buendiaAyala?.passed).toBe(true);
    expect(buendiaAyala?.transferCount).toBe(0);
  });

  it('gracefully handles negative control query "Tokyo to New York" with route_not_found', () => {
    const negative = summary.results.find((r) => r.id === 'tc-028');
    expect(negative).toBeDefined();
    expect(negative?.passed).toBe(true);
    expect(negative?.routeCount).toBe(0);
    expect(negative?.actualIntent).toBe('route_not_found');
  });

  it('maintains memory stability with no unbounded leaks across full benchmark run', () => {
    // Net heap memory growth across 28 queries must remain bounded (< 25 MB)
    expect(summary.netMemoryDeltaMB).toBeLessThan(25.0);
  });
});
