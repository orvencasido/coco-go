// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((dict) => dict.android),
  },
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
  DocumentDirectoryPath: '/mock/documents',
}));

// Mock llama.rn
jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    id: 1,
    gpu: false,
    completion: jest.fn().mockResolvedValue({
      text: 'Mock response',
      content: 'Mock response',
      tokens_predicted: 10,
      timings: {
        prompt_n: 5,
        prompt_ms: 10,
        prompt_per_second: 500,
        predicted_n: 10,
        predicted_ms: 100,
        predicted_per_second: 100,
      },
    }),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    clearCache: jest.fn().mockResolvedValue(undefined),
  }),
  releaseAllLlama: jest.fn().mockResolvedValue(undefined),
}));

import { ChatOrchestratorImpl } from '../ChatOrchestrator';
import { extractEntities, extractEntitiesViaPatterns } from '../entityExtractor';
import { RouteSolverImpl } from '../../transit/RouteSolver';
import { TransitDatabaseImpl } from '../../transit/TransitDatabase';
import { LlamaServiceImpl } from '../LlamaService';
import { TransitRouteOption } from '@/types/transit';

describe('ChatOrchestrator & Offline RAG Pipeline', () => {
  let db: TransitDatabaseImpl;
  let solver: RouteSolverImpl;
  let llamaService: LlamaServiceImpl;
  let orchestrator: ChatOrchestratorImpl;

  beforeAll(async () => {
    db = new TransitDatabaseImpl();
    await db.initialize();
    solver = new RouteSolverImpl(db);
    llamaService = new LlamaServiceImpl();
    // Initialize LlamaService in mock/dev mode
    await llamaService.initModel({
      allowMockMode: true, modelPath: '/dummy/model.gguf',
    });
    orchestrator = new ChatOrchestratorImpl(llamaService, solver, db);
  });

  afterAll(async () => {
    await llamaService.releaseModel();
    await db.close();
  });

  describe('Entity & Intent Extraction (entityExtractor)', () => {
    it('extracts origin and destination from English query "how can i go from lucena to sm makati"', async () => {
      const extracted = await extractEntities(
        'how can i go from lucena to sm makati',
        llamaService,
      );
      expect(extracted.intent).toBe('find_route');
      expect(extracted.origin?.toLowerCase()).toContain('lucena');
      expect(extracted.destination?.toLowerCase()).toContain('makati');
    });

    it('extracts origin and destination from Filipino "mula X hanggang Y" phrasing', () => {
      const extracted = extractEntitiesViaPatterns(
        'paano pumunta mula lucena hanggang buendia',
      );
      expect(extracted.intent).toBe('find_route');
      expect(extracted.origin?.toLowerCase()).toBe('lucena');
      expect(extracted.destination?.toLowerCase()).toBe('buendia');
    });

    it('extracts destination and origin from inverted Filipino "pa-Y galing X" phrasing', () => {
      const extracted = extractEntitiesViaPatterns(
        'saan sakayan pa-Batangas galing Buendia',
      );
      expect(extracted.intent).toBe('find_route');
      expect(extracted.origin?.toLowerCase()).toBe('buendia');
      expect(extracted.destination?.toLowerCase()).toBe('batangas');
    });

    it('extracts shorthand "PITX to Cubao" with bus preferred mode', () => {
      const extracted = extractEntitiesViaPatterns('PITX to Cubao gamit ang EDSA Carousel');
      expect(extracted.intent).toBe('find_route');
      expect(extracted.origin?.toLowerCase()).toBe('pitx');
      expect(extracted.destination?.toLowerCase()).toBe('cubao');
      expect(extracted.preferredMode).toBe('bus');
    });

    it('detects conversational greeting without transit query', async () => {
      const extracted = await extractEntities('kumusta', llamaService);
      expect(extracted.intent).toBe('greeting');
      expect(extracted.origin).toBeUndefined();
      expect(extracted.destination).toBeUndefined();
    });

    it('detects missing origin when destination is provided', () => {
      const extracted = extractEntitiesViaPatterns('paano pumunta sa sm makati');
      expect(extracted.intent).toBe('clarification');
      expect(extracted.destination?.toLowerCase()).toContain('sm makati');
      expect(extracted.origin).toBeUndefined();
    });

    it('detects missing destination when origin is provided', () => {
      const extracted = extractEntitiesViaPatterns('galing akong Lucena');
      expect(extracted.intent).toBe('clarification');
      expect(extracted.origin?.toLowerCase()).toContain('lucena');
      expect(extracted.destination).toBeUndefined();
    });
  });

  describe('Full Multi-Stage Pipeline Execution', () => {
    it('executes full pipeline for "how can i go from lucena to sm makati"', async () => {
      const streamedTokens: string[] = [];
      let routesFoundCallbackInvoked = false;
      let capturedRoutes: TransitRouteOption[] = [];

      const result = await orchestrator.handleUserMessage(
        'how can i go from lucena to sm makati',
        {
          onToken: (token) => {
            streamedTokens.push(token);
          },
          onRoutesFound: (routes) => {
            routesFoundCallbackInvoked = true;
            capturedRoutes = routes;
          },
        },
      );

      // Verify entity extraction
      expect(result.extractedQuery.intent).toBe('find_route');
      expect(result.extractedQuery.origin?.toLowerCase()).toContain('lucena');
      expect(result.extractedQuery.destination?.toLowerCase()).toContain('makati');

      // Verify route solver callback & results
      expect(routesFoundCallbackInvoked).toBe(true);
      expect(capturedRoutes.length).toBeGreaterThanOrEqual(2);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(2);
      expect(result.routeResult).toBeDefined();
      expect(result.routeResult?.origin).toContain('Lucena');
      expect(result.routeResult?.destination).toContain('Ayala');
      expect(result.routeResult?.totalEstimatedFare).toBeGreaterThan(200);

      // Verify streamed synthesis response
      expect(streamedTokens.length).toBeGreaterThan(0);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.tokensGenerated).toBeGreaterThan(0);
    });

    it('handles conversational greeting "kumusta" with warm Filipino welcome', async () => {
      const streamedTokens: string[] = [];
      const result = await orchestrator.handleUserMessage('kumusta', {
        onToken: (token) => {
          streamedTokens.push(token);
        },
      });

      expect(result.intent).toBe('greeting');
      expect(result.routeOptions).toEqual([]);
      expect(result.routeResult).toBeUndefined();
      expect(result.content.toLowerCase()).toContain('coco');
      expect(streamedTokens.length).toBeGreaterThan(0);
    });

    it('handles missing origin query "paano pumunta sa SM Makati" by requesting clarification', async () => {
      const result = await orchestrator.handleUserMessage('paano pumunta sa SM Makati');

      expect(result.intent).toBe('clarification');
      expect(result.routeOptions).toEqual([]);
      expect(result.extractedQuery.destination?.toLowerCase()).toContain('sm makati');
      expect(result.extractedQuery.origin).toBeUndefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('handles missing destination query "galing akong Lucena" by requesting clarification', async () => {
      const result = await orchestrator.handleUserMessage('galing akong Lucena');

      expect(result.intent).toBe('clarification');
      expect(result.routeOptions).toEqual([]);
      expect(result.extractedQuery.origin?.toLowerCase()).toContain('lucena');
      expect(result.extractedQuery.destination).toBeUndefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('gracefully handles unknown route "Lucena to Antarctica" with offline fallback notice', async () => {
      const result = await orchestrator.handleUserMessage('Lucena to Antarctica');

      expect(result.intent).toBe('route_not_found');
      expect(result.routeOptions).toEqual([]);
      expect(result.routeResult).toBeUndefined();
      expect(result.content.length).toBeGreaterThan(0);
      // Response explains route is not in database
      expect(result.content.toLowerCase()).toContain('offline database');
    });

    it('solves direct corridor query "saan sakayan pa-Batangas galing Buendia"', async () => {
      const result = await orchestrator.handleUserMessage(
        'saan sakayan pa-Batangas galing Buendia',
      );

      expect(result.intent).toBe('find_route');
      expect(result.routeOptions.length).toBeGreaterThan(0);
      expect(result.routeResult?.origin).toContain('Buendia');
      expect(result.routeResult?.destination).toContain('Batangas');
      expect(result.routeResult?.legs[0].mode).toBe('bus');
      expect(result.content.length).toBeGreaterThan(0);
    });
  });
});
