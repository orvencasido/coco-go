import { Terminal, Route, RouteStop, TransferHub } from '@/types/transit';
import {
  SEED_TERMINALS,
  SEED_ROUTES,
  SEED_ROUTE_STOPS,
  SEED_HUBS,
} from './seedData';

// Attempt safe runtime resolution of @op-engineering/op-sqlite
// In Jest / CI or test environments where native C++ JSI binaries are not compiled,
// this gracefully falls back to a high-fidelity in-memory SQLite store with simulated FTS indexing.
let opSqliteModule: any = null;
try {
  opSqliteModule = require('@op-engineering/op-sqlite');
} catch {
  opSqliteModule = null;
}

export interface StopsBetweenResult {
  originStop: RouteStop;
  destStop: RouteStop;
  intermediateStops: RouteStop[];
}

export interface ITransitDatabase {
  initialize(dbPath?: string): Promise<boolean>;
  findTerminalsByNameOrAlias(query: string): Promise<Terminal[]>;
  getDirectRoutes(originTerminalId: string, destTerminalId: string): Promise<Route[]>;
  getRouteStops(routeId: string): Promise<RouteStop[]>;
  getTransferHubs(): Promise<TransferHub[]>;
  searchLandmarks(query: string): Promise<Terminal[]>;
  getTerminalById(terminalId: string): Promise<Terminal | null>;
  getAllTerminals(): Promise<Terminal[]>;
  getAllRoutes(): Promise<Route[]>;
  getRoutesForTerminal(terminalId: string): Promise<Route[]>;
  getStopsBetween(
    routeId: string,
    originTerminalId: string,
    destTerminalId: string,
  ): Promise<StopsBetweenResult | null>;
  isReady(): boolean;
  isUsingMemoryFallback(): boolean;
  close(): Promise<void>;
}

export class TransitDatabaseImpl implements ITransitDatabase {
  private db: any = null;
  private isInitialized = false;
  private isNativeMode = false;

  // In-memory fallback structures
  private memoryTerminals: Map<string, Terminal> = new Map();
  private memoryRoutes: Map<string, Route> = new Map();
  private memoryRouteStops: RouteStop[] = [];
  private memoryHubs: TransferHub[] = [];
  // Token inverted index for FTS5 simulation in memory
  private memoryTokenIndex: Map<string, Set<string>> = new Map();

  public async initialize(dbPath = 'transit.db'): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (opSqliteModule && typeof opSqliteModule.open === 'function') {
      try {
        this.db = opSqliteModule.open({ name: dbPath });
        await this.initNativeTables();
        await this.seedNativeDataIfEmpty();
        this.isNativeMode = true;
        this.isInitialized = true;
        return true;
      } catch (err) {
        console.warn(
          '[TransitDatabase] Native op-sqlite open failed. Falling back to in-memory store:',
          err,
        );
      }
    }

    // Initialize in-memory fallback store
    this.initMemoryStore();
    this.isNativeMode = false;
    this.isInitialized = true;
    return true;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public isUsingMemoryFallback(): boolean {
    return !this.isNativeMode;
  }

  public async close(): Promise<void> {
    if (this.isNativeMode && this.db) {
      try {
        if (typeof this.db.close === 'function') {
          this.db.close();
        }
      } catch (err) {
        console.warn('[TransitDatabase] Error closing native database:', err);
      }
    }
    this.db = null;
    this.memoryTerminals.clear();
    this.memoryRoutes.clear();
    this.memoryRouteStops = [];
    this.memoryHubs = [];
    this.memoryTokenIndex.clear();
    this.isInitialized = false;
    this.isNativeMode = false;
  }

  // =========================================================================
  // Native SQLite DDL & Seeding
  // =========================================================================

  private async initNativeTables(): Promise<void> {
    if (!this.db) {
      return;
    }

    // 1. Terminals table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS terminals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        province TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        aliases TEXT NOT NULL
      );
    `);

    // 2. Routes table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        operator TEXT NOT NULL,
        frequency TEXT,
        first_trip TEXT,
        last_trip TEXT
      );
    `);

    // 3. Route stops table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS route_stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id TEXT NOT NULL,
        stop_order INTEGER NOT NULL,
        terminal_id TEXT NOT NULL,
        fare_estimate REAL NOT NULL,
        travel_time_mins INTEGER NOT NULL,
        FOREIGN KEY (route_id) REFERENCES routes (id),
        FOREIGN KEY (terminal_id) REFERENCES terminals (id)
      );
    `);

    // 4. Transfer hubs table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS transfer_hubs (
        id TEXT PRIMARY KEY,
        hub_name TEXT NOT NULL,
        connecting_modes TEXT NOT NULL,
        walking_time_mins INTEGER NOT NULL,
        tips TEXT
      );
    `);

    // 5. FTS5 Virtual Table for fuzzy full-text station/landmark search
    await this.db.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS terminals_fts USING fts5(
        id UNINDEXED,
        name,
        city,
        province,
        aliases
      );
    `);
  }

  private async seedNativeDataIfEmpty(): Promise<void> {
    if (!this.db) {
      return;
    }

    const res = await this.db.execute('SELECT COUNT(*) as count FROM terminals;');
    const count = res?.rows?.[0]?.count ? Number(res.rows[0].count) : 0;
    if (count > 0) {
      return; // Already seeded
    }

    // Seed Terminals & FTS
    for (const term of SEED_TERMINALS) {
      const aliasesJson = JSON.stringify(term.aliases);
      await this.db.execute(
        `INSERT OR REPLACE INTO terminals (id, name, city, province, latitude, longitude, aliases)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          term.id,
          term.name,
          term.city,
          term.province,
          term.latitude ?? null,
          term.longitude ?? null,
          aliasesJson,
        ],
      );

      const aliasesConcat = term.aliases.join(' ');
      await this.db.execute(
        `INSERT INTO terminals_fts (id, name, city, province, aliases)
         VALUES (?, ?, ?, ?, ?);`,
        [term.id, term.name, term.city, term.province, aliasesConcat],
      );
    }

    // Seed Routes
    for (const r of SEED_ROUTES) {
      await this.db.execute(
        `INSERT OR REPLACE INTO routes (id, name, mode, operator, frequency, first_trip, last_trip)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          r.id,
          r.name,
          r.mode,
          r.operator,
          r.frequency ?? null,
          r.firstTrip ?? null,
          r.lastTrip ?? null,
        ],
      );
    }

    // Seed Route Stops
    for (const rs of SEED_ROUTE_STOPS) {
      await this.db.execute(
        `INSERT INTO route_stops (route_id, stop_order, terminal_id, fare_estimate, travel_time_mins)
         VALUES (?, ?, ?, ?, ?);`,
        [
          rs.routeId,
          rs.stopOrder,
          rs.terminalId,
          rs.fareEstimate,
          rs.travelTimeMinutes,
        ],
      );
    }

    // Seed Transfer Hubs
    for (const hub of SEED_HUBS) {
      const modesJson = JSON.stringify(hub.connectingModes);
      await this.db.execute(
        `INSERT OR REPLACE INTO transfer_hubs (id, hub_name, connecting_modes, walking_time_mins, tips)
         VALUES (?, ?, ?, ?, ?);`,
        [hub.id, hub.hubName, modesJson, hub.walkingTimeMinutes, hub.tips ?? null],
      );
    }
  }

  // =========================================================================
  // In-Memory Fallback Initialization & Indexing
  // =========================================================================

  private initMemoryStore(): void {
    this.memoryTerminals.clear();
    this.memoryRoutes.clear();
    this.memoryRouteStops = [...SEED_ROUTE_STOPS];
    this.memoryHubs = [...SEED_HUBS];
    this.memoryTokenIndex.clear();

    for (const term of SEED_TERMINALS) {
      this.memoryTerminals.set(term.id, term);
      this.indexTerminalForMemoryFts(term);
    }

    for (const route of SEED_ROUTES) {
      this.memoryRoutes.set(route.id, route);
    }
  }

  private indexTerminalForMemoryFts(terminal: Terminal): void {
    const textCorpus = [
      terminal.name,
      terminal.city,
      terminal.province,
      ...terminal.aliases,
    ].join(' ');

    const tokens = this.tokenizeText(textCorpus);
    for (const token of tokens) {
      if (!this.memoryTokenIndex.has(token)) {
        this.memoryTokenIndex.set(token, new Set());
      }
      this.memoryTokenIndex.get(token)!.add(terminal.id);
    }
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Fast fuzzy matching of station or landmark queries using FTS or inverted index.
   * Matches against terminal names, cities, provinces, and commuter aliases.
   */
  public async findTerminalsByNameOrAlias(query: string): Promise<Terminal[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return [];
    }

    if (this.isNativeMode && this.db) {
      return this.nativeFindTerminals(cleanQuery);
    }

    return this.memoryFindTerminals(cleanQuery);
  }

  public async searchLandmarks(query: string): Promise<Terminal[]> {
    return this.findTerminalsByNameOrAlias(query);
  }

  public async getTerminalById(terminalId: string): Promise<Terminal | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute(
        'SELECT * FROM terminals WHERE id = ? LIMIT 1;',
        [terminalId],
      );
      if (res?.rows && res.rows.length > 0) {
        return this.parseTerminalRow(res.rows[0]);
      }
      return null;
    }

    return this.memoryTerminals.get(terminalId) || null;
  }

  public async getAllTerminals(): Promise<Terminal[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute('SELECT * FROM terminals;');
      return (res?.rows || []).map((row: any) => this.parseTerminalRow(row));
    }

    return Array.from(this.memoryTerminals.values());
  }

  public async getAllRoutes(): Promise<Route[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute('SELECT * FROM routes;');
      return (res?.rows || []).map((row: any) => this.parseRouteRow(row));
    }

    return Array.from(this.memoryRoutes.values());
  }

  /**
   * Find routes that directly connect origin terminal to destination terminal.
   * Supports bidirectional travel along the line.
   */
  public async getDirectRoutes(
    originTerminalId: string,
    destTerminalId: string,
  ): Promise<Route[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute(
        `SELECT DISTINCT r.*
         FROM routes r
         JOIN route_stops rs1 ON r.id = rs1.route_id
         JOIN route_stops rs2 ON r.id = rs2.route_id
         WHERE rs1.terminal_id = ? AND rs2.terminal_id = ?
         ORDER BY ABS(rs2.stop_order - rs1.stop_order) ASC;`,
        [originTerminalId, destTerminalId],
      );
      return (res?.rows || []).map((row: any) => this.parseRouteRow(row));
    }

    // In-memory direct route lookup
    const matchingRouteIds = new Set<string>();
    const routeStopsByRoute = new Map<string, RouteStop[]>();

    for (const rs of this.memoryRouteStops) {
      if (!routeStopsByRoute.has(rs.routeId)) {
        routeStopsByRoute.set(rs.routeId, []);
      }
      routeStopsByRoute.get(rs.routeId)!.push(rs);
    }

    const directRoutes: Route[] = [];
    for (const [routeId, stops] of routeStopsByRoute.entries()) {
      const hasOrigin = stops.some((s) => s.terminalId === originTerminalId);
      const hasDest = stops.some((s) => s.terminalId === destTerminalId);
      if (hasOrigin && hasDest && !matchingRouteIds.has(routeId)) {
        matchingRouteIds.add(routeId);
        const route = this.memoryRoutes.get(routeId);
        if (route) {
          directRoutes.push(route);
        }
      }
    }

    return directRoutes;
  }

  /**
   * Get all ordered stops along a given route.
   */
  public async getRouteStops(routeId: string): Promise<RouteStop[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute(
        `SELECT rs.route_id, rs.stop_order, rs.terminal_id, rs.fare_estimate, rs.travel_time_mins, t.name as terminal_name
         FROM route_stops rs
         LEFT JOIN terminals t ON rs.terminal_id = t.id
         WHERE rs.route_id = ?
         ORDER BY rs.stop_order ASC;`,
        [routeId],
      );
      return (res?.rows || []).map((row: any) => ({
        routeId: row.route_id,
        stopOrder: Number(row.stop_order),
        terminalId: row.terminal_id,
        terminalName: row.terminal_name || undefined,
        fareEstimate: Number(row.fare_estimate),
        travelTimeMinutes: Number(row.travel_time_mins),
      }));
    }

    return this.memoryRouteStops
      .filter((rs) => rs.routeId === routeId)
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map((rs) => ({
        ...rs,
        terminalName: this.memoryTerminals.get(rs.terminalId)?.name,
      }));
  }

  /**
   * Returns list of configured transit transfer hubs and interchange guidance.
   */
  public async getTransferHubs(): Promise<TransferHub[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute('SELECT * FROM transfer_hubs;');
      return (res?.rows || []).map((row: any) => ({
        id: row.id,
        hubName: row.hub_name,
        connectingModes: JSON.parse(row.connecting_modes || '[]'),
        walkingTimeMinutes: Number(row.walking_time_mins),
        tips: row.tips || undefined,
      }));
    }

    return [...this.memoryHubs];
  }

  /**
   * Get all routes that call at or pass through a specific terminal.
   */
  public async getRoutesForTerminal(terminalId: string): Promise<Route[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isNativeMode && this.db) {
      const res = await this.db.execute(
        `SELECT DISTINCT r.*
         FROM routes r
         JOIN route_stops rs ON r.id = rs.route_id
         WHERE rs.terminal_id = ?;`,
        [terminalId],
      );
      return (res?.rows || []).map((row: any) => this.parseRouteRow(row));
    }

    const routeIds = new Set(
      this.memoryRouteStops
        .filter((rs) => rs.terminalId === terminalId)
        .map((rs) => rs.routeId),
    );

    return Array.from(routeIds)
      .map((id) => this.memoryRoutes.get(id))
      .filter((r): r is Route => !!r);
  }

  /**
   * Resolves the start stop, end stop, and in-between intermediate stops for a segment.
   */
  public async getStopsBetween(
    routeId: string,
    originTerminalId: string,
    destTerminalId: string,
  ): Promise<StopsBetweenResult | null> {
    const stops = await this.getRouteStops(routeId);
    const originStop = stops.find((s) => s.terminalId === originTerminalId);
    const destStop = stops.find((s) => s.terminalId === destTerminalId);

    if (!originStop || !destStop) {
      return null;
    }

    const minOrder = Math.min(originStop.stopOrder, destStop.stopOrder);
    const maxOrder = Math.max(originStop.stopOrder, destStop.stopOrder);

    let intermediateStops = stops.filter(
      (s) => s.stopOrder >= minOrder && s.stopOrder <= maxOrder,
    );

    // If reverse direction, invert order to match commuter trip sequence
    if (originStop.stopOrder > destStop.stopOrder) {
      intermediateStops = intermediateStops.reverse();
    }

    return {
      originStop,
      destStop,
      intermediateStops,
    };
  }

  // =========================================================================
  // Native Query Helpers
  // =========================================================================

  private async nativeFindTerminals(query: string): Promise<Terminal[]> {
    const rawTerms = this.tokenizeText(query);
    const ftsQuery = rawTerms.map((t) => `"${t}"*`).join(' OR ');
    const likePattern = `%${query.toLowerCase()}%`;

    const sql = `
      SELECT DISTINCT t.*
      FROM terminals t
      WHERE t.id IN (
        SELECT id FROM terminals_fts WHERE terminals_fts MATCH ?
      )
      OR LOWER(t.name) LIKE ?
      OR LOWER(t.aliases) LIKE ?
      OR LOWER(t.city) LIKE ?;
    `;

    try {
      const res = await this.db.execute(sql, [
        ftsQuery || query,
        likePattern,
        likePattern,
        likePattern,
      ]);
      const results = (res?.rows || []).map((row: any) => this.parseTerminalRow(row));
      return this.rankTerminalMatches(results, query);
    } catch {
      // Fallback to LIKE search if FTS syntax error
      const fallbackSql = `
        SELECT DISTINCT * FROM terminals
        WHERE LOWER(name) LIKE ? OR LOWER(aliases) LIKE ? OR LOWER(city) LIKE ?;
      `;
      const res = await this.db.execute(fallbackSql, [
        likePattern,
        likePattern,
        likePattern,
      ]);
      const results = (res?.rows || []).map((row: any) => this.parseTerminalRow(row));
      return this.rankTerminalMatches(results, query);
    }
  }

  private parseTerminalRow(row: any): Terminal {
    let aliases: string[] = [];
    try {
      aliases = typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases || [];
    } catch {
      aliases = typeof row.aliases === 'string' ? row.aliases.split(',') : [];
    }

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      province: row.province,
      latitude: row.latitude !== null ? Number(row.latitude) : undefined,
      longitude: row.longitude !== null ? Number(row.longitude) : undefined,
      aliases,
    };
  }

  private parseRouteRow(row: any): Route {
    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      operator: row.operator,
      frequency: row.frequency || undefined,
      firstTrip: row.first_trip || undefined,
      lastTrip: row.last_trip || undefined,
    };
  }

  // =========================================================================
  // In-Memory Search & Ranking
  // =========================================================================

  private static readonly GENERIC_TRANSIT_TOKENS = new Set([
    'terminal',
    'station',
    'bus',
    'stop',
    'center',
    'avenue',
    'ave',
    'street',
    'st',
    'transit',
    'rotunda',
  ]);

  private memoryFindTerminals(query: string): Terminal[] {
    const qLower = query.toLowerCase().trim();
    const queryTokens = this.tokenizeText(query);
    const candidateIds = new Set<string>();

    // 1. Direct inverted index token lookups (FTS simulation)
    for (const [indexToken, idSet] of this.memoryTokenIndex.entries()) {
      for (const qToken of queryTokens) {
        if (indexToken.startsWith(qToken) || qToken.startsWith(indexToken)) {
          for (const id of idSet) {
            candidateIds.add(id);
          }
        }
      }
    }

    // 2. Substring & alias matching across all terminals
    for (const term of this.memoryTerminals.values()) {
      if (
        term.name.toLowerCase().includes(qLower) ||
        term.city.toLowerCase().includes(qLower) ||
        term.province.toLowerCase().includes(qLower) ||
        term.aliases.some((a) => a.toLowerCase().includes(qLower))
      ) {
        candidateIds.add(term.id);
      }
    }

    const matchedTerminals = Array.from(candidateIds)
      .map((id) => this.memoryTerminals.get(id)!)
      .filter(Boolean);

    return this.rankTerminalMatches(matchedTerminals, query);
  }

  private rankTerminalMatches(terminals: Terminal[], rawQuery: string): Terminal[] {
    const q = rawQuery.toLowerCase().trim();

    return terminals
      .map((term) => ({
        terminal: term,
        score: this.calculateTerminalScore(term, q),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.terminal);
  }

  private calculateTerminalScore(terminal: Terminal, q: string): number {
    let score = 0;
    const nameLower = terminal.name.toLowerCase();
    const queryTokens = this.tokenizeText(q);

    // Exact alias match = highest score
    if (terminal.aliases.some((a) => a.toLowerCase() === q)) {
      return 100;
    }

    // Exact name match
    if (nameLower === q) {
      return 90;
    }

    // Name starts with query
    if (nameLower.startsWith(q)) {
      score += 50;
    }

    // Name contains query
    if (nameLower.includes(q)) {
      score += 40;
    }

    // Alias contains query
    if (terminal.aliases.some((a) => a.toLowerCase().includes(q))) {
      score += 45;
    }

    // City matches
    if (terminal.city.toLowerCase() === q) {
      score += 35;
    } else if (terminal.city.toLowerCase().includes(q)) {
      score += 20;
    }

    // Token-based matching when full query substring isn't matched
    if (score === 0 && queryTokens.length > 0) {
      let matchedDistinctTokens = 0;
      let nonGenericTokensCount = 0;

      for (const token of queryTokens) {
        const isGeneric = TransitDatabaseImpl.GENERIC_TRANSIT_TOKENS.has(token);
        if (!isGeneric) {
          nonGenericTokensCount++;
        }

        const matchesTerminal =
          nameLower.includes(token) ||
          terminal.city.toLowerCase().includes(token) ||
          terminal.province.toLowerCase().includes(token) ||
          terminal.aliases.some((a) => a.toLowerCase().includes(token));

        if (matchesTerminal) {
          if (!isGeneric) {
            matchedDistinctTokens++;
            score += 25;
          } else {
            score += 5;
          }
        }
      }

      // If distinctive keywords were provided but none matched this station, reject match
      if (nonGenericTokensCount > 0 && matchedDistinctTokens === 0) {
        return 0;
      }
    }

    return score;
  }
}

export const TransitDatabase = new TransitDatabaseImpl();
