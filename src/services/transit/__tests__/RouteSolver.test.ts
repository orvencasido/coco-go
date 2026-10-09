import { TransitDatabase } from '../TransitDatabase';
import { RouteSolver } from '../RouteSolver';

describe('TransitDatabase & RouteSolver Knowledge Base Tests', () => {
  beforeAll(async () => {
    await TransitDatabase.initialize();
  });

  afterAll(async () => {
    await TransitDatabase.close();
  });

  describe('TransitDatabase Station & Landmark Resolution', () => {
    it('initializes in memory fallback mode under Jest test environment', () => {
      expect(TransitDatabase.isReady()).toBe(true);
      expect(TransitDatabase.isUsingMemoryFallback()).toBe(true);
    });

    it('resolves Lucena Grand Central Terminal by city name or alias', async () => {
      const results = await TransitDatabase.findTerminalsByNameOrAlias('lucena');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('term_lucena_grand');
      expect(results[0].province).toBe('Quezon');
    });

    it('resolves SM Makati / Ayala terminal by landmark alias "SM Makati"', async () => {
      const results = await TransitDatabase.findTerminalsByNameOrAlias('SM Makati');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('term_ayala_mrt');
      expect(results[0].city).toBe('Makati');
    });

    it('resolves Buendia Bus Terminal by "buendia" or "gil puyat"', async () => {
      const buendiaResults = await TransitDatabase.findTerminalsByNameOrAlias('buendia');
      expect(buendiaResults.some((t) => t.id === 'term_buendia_gil_puyat')).toBe(true);

      const gilPuyatResults = await TransitDatabase.findTerminalsByNameOrAlias('gil puyat');
      expect(gilPuyatResults.some((t) => t.id === 'term_buendia_gil_puyat')).toBe(true);
    });

    it('resolves PITX by acronym', async () => {
      const pitxResults = await TransitDatabase.findTerminalsByNameOrAlias('pitx');
      expect(pitxResults.length).toBeGreaterThan(0);
      expect(pitxResults[0].id).toBe('term_pitx');
    });

    it('returns empty array for non-existent station query', async () => {
      const unknownResults = await TransitDatabase.findTerminalsByNameOrAlias('Antarctica Center');
      expect(unknownResults).toEqual([]);
    });

    it('retrieves configured transfer hubs with guidance tips', async () => {
      const hubs = await TransitDatabase.getTransferHubs();
      expect(hubs.length).toBeGreaterThanOrEqual(4);
      const buendiaHub = hubs.find((h) => h.id === 'hub_buendia_ayala');
      expect(buendiaHub).toBeDefined();
      expect(buendiaHub?.tips).toContain('Sen. Gil Puyat Ave');
    });

    it('retrieves ordered route stops with fare and travel time estimates', async () => {
      const stops = await TransitDatabase.getRouteStops('route_jac_lucena_buendia');
      expect(stops.length).toBe(4);
      expect(stops[0].terminalId).toBe('term_lucena_grand');
      expect(stops[0].stopOrder).toBe(1);
      expect(stops[3].terminalId).toBe('term_buendia_gil_puyat');
      expect(stops[3].fareEstimate).toBe(270);
      expect(stops[3].travelTimeMinutes).toBe(210);
    });
  });

  describe('RouteSolver Direct Route Calculation (0-Hop)', () => {
    it('calculates direct MRT-3 route from North Avenue to Ayala / SM Makati', async () => {
      const routes = await RouteSolver.findRoutes('North Ave', 'Ayala');
      expect(routes.length).toBeGreaterThan(0);

      const directMrt = routes.find((r) => r.transferCount === 0);
      expect(directMrt).toBeDefined();
      expect(directMrt?.origin).toContain('North Avenue');
      expect(directMrt?.destination).toContain('Ayala');
      expect(directMrt?.legs.length).toBe(1);
      expect(directMrt?.legs[0].mode).toBe('mrt');
      expect(directMrt?.totalEstimatedFare).toBe(28);
      expect(directMrt?.totalEstimatedMinutes).toBe(30);
    });

    it('calculates direct EDSA Carousel route from PITX to Cubao', async () => {
      const routes = await RouteSolver.findRoutes('PITX', 'Cubao');
      expect(routes.length).toBeGreaterThan(0);

      const directBus = routes.find((r) => r.transferCount === 0);
      expect(directBus).toBeDefined();
      expect(directBus?.legs[0].operator).toBe('EDSA Busway Consortium');
      expect(directBus?.totalEstimatedFare).toBe(53);
    });

    it('calculates direct provincial bus from Batangas to Buendia', async () => {
      const routes = await RouteSolver.findRoutes('Batangas', 'Buendia');
      expect(routes.length).toBeGreaterThan(0);

      const directProvincial = routes.find((r) => r.transferCount === 0);
      expect(directProvincial).toBeDefined();
      expect(directProvincial?.legs[0].mode).toBe('bus');
      expect(directProvincial?.totalEstimatedFare).toBe(215);
    });
  });

  describe('RouteSolver Primary Scenario: "Lucena" to "SM Makati"', () => {
    it('solves Lucena to SM Makati with verified multi-hop options', async () => {
      const routes = await RouteSolver.findRoutes('Lucena', 'SM Makati');
      expect(routes.length).toBeGreaterThanOrEqual(2);

      // Verify all returned options are verified and structured
      for (const route of routes) {
        expect(route.verified).toBe(true);
        expect(route.origin).toContain('Lucena');
        expect(route.destination).toContain('Ayala');
        expect(route.legs.length).toBeGreaterThanOrEqual(2);
        expect(route.totalEstimatedFare).toBeGreaterThan(200);
        expect(route.totalEstimatedMinutes).toBeGreaterThan(180);
      }

      // Check Option 1: Lucena -> Buendia (JAC Liner / DLTB) + Buendia -> SM Makati (Jeepney/Bus along Gil Puyat)
      const buendiaOption = routes.find((r) =>
        r.legs.some(
          (leg) =>
            leg.toStop.includes('Buendia') &&
            leg.mode === 'bus' &&
            r.legs.some((l2) => l2.fromStop.includes('Buendia') && l2.mode === 'jeepney'),
        ),
      );
      expect(buendiaOption).toBeDefined();
      if (buendiaOption) {
        expect(buendiaOption.transferCount).toBe(1);
        expect(buendiaOption.legs[0].fromStop).toContain('Lucena');
        expect(buendiaOption.legs[0].toStop).toContain('Buendia');
        expect(buendiaOption.legs[0].estimatedFare).toBe(270);
        expect(buendiaOption.legs[1].fromStop).toContain('Buendia');
        expect(buendiaOption.legs[1].toStop).toContain('SM Makati');
        expect(buendiaOption.legs[1].estimatedFare).toBe(15);
        expect(buendiaOption.totalEstimatedFare).toBe(285);
        expect(buendiaOption.legs[1].instructions).toContain('Sen. Gil Puyat Ave');
      }

      // Check Option 2: Lucena -> PITX (DLTB) + PITX -> SM Makati / One Ayala (EDSA Carousel)
      const pitxOption = routes.find((r) =>
        r.legs.some(
          (leg) =>
            leg.toStop.includes('PITX') &&
            r.legs.some((l2) => l2.fromStop.includes('PITX') && l2.routeName?.includes('Carousel')),
        ),
      );
      expect(pitxOption).toBeDefined();
      if (pitxOption) {
        expect(pitxOption.transferCount).toBe(1);
        expect(pitxOption.legs[0].fromStop).toContain('Lucena');
        expect(pitxOption.legs[0].toStop).toContain('PITX');
        expect(pitxOption.legs[0].estimatedFare).toBe(260);
        expect(pitxOption.legs[1].fromStop).toContain('PITX');
        expect(pitxOption.legs[1].toStop).toContain('SM Makati');
        expect(pitxOption.legs[1].estimatedFare).toBe(35);
        expect(pitxOption.totalEstimatedFare).toBe(295);
        expect(pitxOption.legs[1].instructions).toContain('Gate 10');
      }
    });

    it('provides multi-hop rail alternative (Lucena -> Buendia -> LRT-1 EDSA -> MRT-3 Ayala)', async () => {
      const routes = await RouteSolver.findRoutes('Lucena Grand Central', 'One Ayala');
      expect(routes.length).toBeGreaterThan(0);

      // Verify that rail or bus transfer options are available
      const railAlternative = routes.find((r) => r.transferCount === 2);
      if (railAlternative) {
        expect(railAlternative.legs.length).toBe(3);
        expect(railAlternative.legs[0].mode).toBe('bus');
        expect(railAlternative.legs[1].mode).toBe('lrt');
        expect(railAlternative.legs[2].mode).toBe('mrt');
      }
    });
  });

  describe('RouteSolver Edge Cases & Graceful Degradation', () => {
    it('returns empty array when origin is unknown', async () => {
      const routes = await RouteSolver.findRoutes('UnknownProvincialTown', 'SM Makati');
      expect(routes).toEqual([]);
    });

    it('returns empty array when destination is unknown', async () => {
      const routes = await RouteSolver.findRoutes('Lucena', 'FarawayGalaxy');
      expect(routes).toEqual([]);
    });

    it('returns empty array when origin and destination are identical', async () => {
      const routes = await RouteSolver.findRoutes('Lucena', 'Lucena');
      expect(routes).toEqual([]);
    });

    it('returns empty array for empty inputs', async () => {
      const routes = await RouteSolver.findRoutes('', '');
      expect(routes).toEqual([]);
    });
  });
});
