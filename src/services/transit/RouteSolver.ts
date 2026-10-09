import { TransitRouteOption } from '@/types/transit';
import { TransitDatabase } from './TransitDatabase';

export interface IRouteSolver {
  findRoutes(origin: string, destination: string): Promise<TransitRouteOption[]>;
}

/**
 * RouteSolver calculates deterministic multi-hop transit routes
 * (direct lines, 1-transfer connections via PITX, Buendia, Cubao, MRT/LRT).
 * Concrete algorithm will be developed by 03-transit-data-engineer.
 */
class RouteSolverImpl implements IRouteSolver {
  public async findRoutes(origin: string, destination: string): Promise<TransitRouteOption[]> {
    // Scaffold stub
    return [];
  }
}

export const RouteSolver = new RouteSolverImpl();
