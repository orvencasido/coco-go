import { Terminal, Route, RouteStop, TransferHub } from '@/types/transit';

export interface ITransitDatabase {
  initialize(dbPath?: string): Promise<boolean>;
  findTerminalsByNameOrAlias(query: string): Promise<Terminal[]>;
  getDirectRoutes(originTerminalId: string, destTerminalId: string): Promise<Route[]>;
  getRouteStops(routeId: string): Promise<RouteStop[]>;
  getTransferHubs(): Promise<TransferHub[]>;
  close(): Promise<void>;
}

/**
 * TransitDatabase manages the embedded SQLite database and FTS5 place search.
 * Concrete implementation will be wired by 03-transit-data-engineer using react-native-quick-sqlite.
 */
class TransitDatabaseImpl implements ITransitDatabase {
  private isInitialized = false;

  public async initialize(dbPath?: string): Promise<boolean> {
    // Scaffold stub - 03-transit-data-engineer will hook up SQLite and pre-populated db
    this.isInitialized = true;
    return true;
  }

  public async findTerminalsByNameOrAlias(query: string): Promise<Terminal[]> {
    // Scaffold stub
    return [];
  }

  public async getDirectRoutes(
    originTerminalId: string,
    destTerminalId: string,
  ): Promise<Route[]> {
    // Scaffold stub
    return [];
  }

  public async getRouteStops(routeId: string): Promise<RouteStop[]> {
    // Scaffold stub
    return [];
  }

  public async getTransferHubs(): Promise<TransferHub[]> {
    // Scaffold stub
    return [];
  }

  public async close(): Promise<void> {
    this.isInitialized = false;
  }
}

export const TransitDatabase = new TransitDatabaseImpl();
