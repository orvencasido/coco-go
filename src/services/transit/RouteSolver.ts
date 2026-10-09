import {
  TransitRouteOption,
  RouteLeg,
  Terminal,
  TransferHub,
} from '@/types/transit';
import { TransitDatabase, ITransitDatabase } from './TransitDatabase';

export interface IRouteSolver {
  findRoutes(origin: string, destination: string): Promise<TransitRouteOption[]>;
}

/**
 * RouteSolver calculates deterministic multi-hop transit routes across Southern Luzon
 * and Metro Manila transit corridors.
 *
 * Capabilities:
 * - Direct zero-transfer route lookup (e.g. MRT-3 North Ave -> Ayala, PITX -> Cubao)
 * - 1-transfer corridor resolution (e.g. Lucena -> Buendia + Buendia -> SM Makati jeepney)
 * - 2-transfer multimodal resolution (e.g. Lucena -> Buendia + LRT-1 EDSA + MRT-3 Ayala)
 * - Realistic fare aggregation (in PHP), estimated transit times, and commuter interchange tips.
 */
export class RouteSolverImpl implements IRouteSolver {
  private db: ITransitDatabase;

  constructor(database: ITransitDatabase = TransitDatabase) {
    this.db = database;
  }

  public async findRoutes(
    origin: string,
    destination: string,
  ): Promise<TransitRouteOption[]> {
    const originQuery = origin?.trim();
    const destQuery = destination?.trim();

    if (!originQuery || !destQuery) {
      return [];
    }

    if (originQuery.toLowerCase() === destQuery.toLowerCase()) {
      return [];
    }

    // Step 1: Resolve origin & destination stations/landmarks using FTS / alias lookup
    const originCandidates = await this.resolveTerminals(originQuery);
    const destCandidates = await this.resolveTerminals(destQuery);

    if (originCandidates.length === 0 || destCandidates.length === 0) {
      return [];
    }

    const originTerm = originCandidates[0];
    const destTerm = destCandidates[0];

    if (originTerm.id === destTerm.id) {
      return [];
    }

    const hubs = await this.db.getTransferHubs();
    const collectedOptions: TransitRouteOption[] = [];
    const seenOptionSignatures = new Set<string>();

    // Step 2: Check Direct Routes (0 Transfers)
    const directRoutes = await this.db.getDirectRoutes(originTerm.id, destTerm.id);
    for (const route of directRoutes) {
      const segment = await this.db.getStopsBetween(route.id, originTerm.id, destTerm.id);
      if (!segment) {
        continue;
      }

      const fare = Math.abs(segment.destStop.fareEstimate - segment.originStop.fareEstimate);
      const minutes = Math.abs(
        segment.destStop.travelTimeMinutes - segment.originStop.travelTimeMinutes,
      );

      const leg: RouteLeg = {
        stepOrder: 1,
        mode: route.mode,
        routeId: route.id,
        routeName: route.name,
        operator: route.operator,
        fromStop: originTerm.name,
        toStop: destTerm.name,
        estimatedFare: fare,
        estimatedMinutes: minutes,
        instructions: `Board ${route.operator} (${route.name}) at ${originTerm.name}. Alight directly at ${destTerm.name}.`,
      };

      const signature = `direct_${route.id}_${originTerm.id}_${destTerm.id}`;
      if (!seenOptionSignatures.has(signature)) {
        seenOptionSignatures.add(signature);
        collectedOptions.push({
          id: `opt_${signature}`,
          origin: originTerm.name,
          destination: destTerm.name,
          totalEstimatedFare: fare,
          totalEstimatedMinutes: minutes,
          transferCount: 0,
          legs: [leg],
          verified: true,
        });
      }
    }

    // Step 3: Check 1-Transfer Routes (Origin -> M -> Destination)
    const allTerminals = await this.db.getAllTerminals();
    for (const midTerm of allTerminals) {
      if (midTerm.id === originTerm.id || midTerm.id === destTerm.id) {
        continue;
      }

      const leg1Routes = await this.db.getDirectRoutes(originTerm.id, midTerm.id);
      if (leg1Routes.length === 0) {
        continue;
      }

      const leg2Routes = await this.db.getDirectRoutes(midTerm.id, destTerm.id);
      if (leg2Routes.length === 0) {
        continue;
      }

      // Group and pick primary route option per corridor to avoid duplicate variations
      for (const r1 of leg1Routes) {
        for (const r2 of leg2Routes) {
          if (r1.id === r2.id) {
            continue;
          }

          const seg1 = await this.db.getStopsBetween(r1.id, originTerm.id, midTerm.id);
          const seg2 = await this.db.getStopsBetween(r2.id, midTerm.id, destTerm.id);
          if (!seg1 || !seg2) {
            continue;
          }

          const fare1 = Math.abs(seg1.destStop.fareEstimate - seg1.originStop.fareEstimate);
          const time1 = Math.abs(
            seg1.destStop.travelTimeMinutes - seg1.originStop.travelTimeMinutes,
          );

          const fare2 = Math.abs(seg2.destStop.fareEstimate - seg2.originStop.fareEstimate);
          const time2 = Math.abs(
            seg2.destStop.travelTimeMinutes - seg2.originStop.travelTimeMinutes,
          );

          // Find transfer hub tips if applicable
          const matchingHub = this.findMatchingHub(midTerm.id, hubs);
          const walkingMinutes = matchingHub?.walkingTimeMinutes || 5;

          const leg1: RouteLeg = {
            stepOrder: 1,
            mode: r1.mode,
            routeId: r1.id,
            routeName: r1.name,
            operator: r1.operator,
            fromStop: originTerm.name,
            toStop: midTerm.name,
            estimatedFare: fare1,
            estimatedMinutes: time1,
            instructions: `Board ${r1.operator} (${r1.name}) at ${originTerm.name}. Alight at ${midTerm.name}.`,
          };

          const transferTipText = matchingHub?.tips
            ? `${matchingHub.tips} `
            : `Transfer at ${midTerm.name} (~${walkingMinutes} mins walk). `;

          const leg2: RouteLeg = {
            stepOrder: 2,
            mode: r2.mode,
            routeId: r2.id,
            routeName: r2.name,
            operator: r2.operator,
            fromStop: midTerm.name,
            toStop: destTerm.name,
            estimatedFare: fare2,
            estimatedMinutes: time2,
            instructions: `${transferTipText}Board ${r2.operator} (${r2.name}) and alight at ${destTerm.name}.`,
          };

          // Signature keys by intermediate hub and mode sequence to present diverse options
          const corridorSig = `1x_${midTerm.id}_${r1.mode}_${r2.mode}_${r1.operator}_${r2.operator}`;

          // Keep at most 2 operator variants per transfer corridor
          if (!seenOptionSignatures.has(corridorSig)) {
            seenOptionSignatures.add(corridorSig);
            collectedOptions.push({
              id: `opt_${corridorSig}`,
              origin: originTerm.name,
              destination: destTerm.name,
              totalEstimatedFare: fare1 + fare2,
              totalEstimatedMinutes: time1 + time2 + walkingMinutes,
              transferCount: 1,
              legs: [leg1, leg2],
              verified: true,
            });
          }
        }
      }
    }

    // Step 4: Check 2-Transfer Routes (Origin -> M1 -> M2 -> Destination)
    // Useful for provincial -> LRT-1 -> MRT-3 rail connections
    for (const m1 of allTerminals) {
      if (m1.id === originTerm.id || m1.id === destTerm.id) {
        continue;
      }

      const r1List = await this.db.getDirectRoutes(originTerm.id, m1.id);
      if (r1List.length === 0) {
        continue;
      }

      for (const m2 of allTerminals) {
        if (
          m2.id === originTerm.id ||
          m2.id === destTerm.id ||
          m2.id === m1.id
        ) {
          continue;
        }

        const r2List = await this.db.getDirectRoutes(m1.id, m2.id);
        if (r2List.length === 0) {
          continue;
        }

        const r3List = await this.db.getDirectRoutes(m2.id, destTerm.id);
        if (r3List.length === 0) {
          continue;
        }

        const r1 = r1List[0];
        const r2 = r2List[0];
        const r3 = r3List[0];

        if (r1.id === r2.id || r2.id === r3.id || r1.id === r3.id) {
          continue;
        }

        const seg1 = await this.db.getStopsBetween(r1.id, originTerm.id, m1.id);
        const seg2 = await this.db.getStopsBetween(r2.id, m1.id, m2.id);
        const seg3 = await this.db.getStopsBetween(r3.id, m2.id, destTerm.id);
        if (!seg1 || !seg2 || !seg3) {
          continue;
        }

        const f1 = Math.abs(seg1.destStop.fareEstimate - seg1.originStop.fareEstimate);
        const t1 = Math.abs(
          seg1.destStop.travelTimeMinutes - seg1.originStop.travelTimeMinutes,
        );

        const f2 = Math.abs(seg2.destStop.fareEstimate - seg2.originStop.fareEstimate);
        const t2 = Math.abs(
          seg2.destStop.travelTimeMinutes - seg2.originStop.travelTimeMinutes,
        );

        const f3 = Math.abs(seg3.destStop.fareEstimate - seg3.originStop.fareEstimate);
        const t3 = Math.abs(
          seg3.destStop.travelTimeMinutes - seg3.originStop.travelTimeMinutes,
        );

        const hub1 = this.findMatchingHub(m1.id, hubs);
        const hub2 = this.findMatchingHub(m2.id, hubs);
        const walk1 = hub1?.walkingTimeMinutes || 5;
        const walk2 = hub2?.walkingTimeMinutes || 5;

        const leg1: RouteLeg = {
          stepOrder: 1,
          mode: r1.mode,
          routeId: r1.id,
          routeName: r1.name,
          operator: r1.operator,
          fromStop: originTerm.name,
          toStop: m1.name,
          estimatedFare: f1,
          estimatedMinutes: t1,
          instructions: `Board ${r1.operator} (${r1.name}) at ${originTerm.name}. Alight at ${m1.name}.`,
        };

        const leg2: RouteLeg = {
          stepOrder: 2,
          mode: r2.mode,
          routeId: r2.id,
          routeName: r2.name,
          operator: r2.operator,
          fromStop: m1.name,
          toStop: m2.name,
          estimatedFare: f2,
          estimatedMinutes: t2,
          instructions: `${hub1?.tips ? `${hub1.tips} ` : `Transfer at ${m1.name}. `}Take ${r2.operator} (${r2.name}) to ${m2.name}.`,
        };

        const leg3: RouteLeg = {
          stepOrder: 3,
          mode: r3.mode,
          routeId: r3.id,
          routeName: r3.name,
          operator: r3.operator,
          fromStop: m2.name,
          toStop: destTerm.name,
          estimatedFare: f3,
          estimatedMinutes: t3,
          instructions: `${hub2?.tips ? `${hub2.tips} ` : `Transfer at ${m2.name}. `}Take ${r3.operator} (${r3.name}) to ${destTerm.name}.`,
        };

        const twoHopSig = `2x_${m1.id}_${m2.id}_${r1.mode}_${r2.mode}_${r3.mode}`;
        if (!seenOptionSignatures.has(twoHopSig)) {
          seenOptionSignatures.add(twoHopSig);
          collectedOptions.push({
            id: `opt_${twoHopSig}`,
            origin: originTerm.name,
            destination: destTerm.name,
            totalEstimatedFare: f1 + f2 + f3,
            totalEstimatedMinutes: t1 + t2 + t3 + walk1 + walk2,
            transferCount: 2,
            legs: [leg1, leg2, leg3],
            verified: true,
          });
        }
      }
    }

    // Step 5: Rank and prune options
    return this.rankAndPruneOptions(collectedOptions);
  }

  private async resolveTerminals(query: string): Promise<Terminal[]> {
    let matches = await this.db.findTerminalsByNameOrAlias(query);
    if (matches.length === 0) {
      matches = await this.db.searchLandmarks(query);
    }
    return matches;
  }

  private findMatchingHub(terminalId: string, hubs: TransferHub[]): TransferHub | null {
    if (terminalId === 'term_buendia_gil_puyat') {
      return hubs.find((h) => h.id === 'hub_buendia_ayala') || null;
    }
    if (terminalId === 'term_pitx') {
      return hubs.find((h) => h.id === 'hub_pitx_carousel') || null;
    }
    if (
      terminalId === 'term_lrt1_edsa' ||
      terminalId === 'term_mrt3_taft_ave'
    ) {
      return hubs.find((h) => h.id === 'hub_edsa_taft_interchange') || null;
    }
    if (terminalId === 'term_cubao_bus') {
      return hubs.find((h) => h.id === 'hub_cubao_interchange') || null;
    }
    if (terminalId === 'term_alabang_vtx') {
      return hubs.find((h) => h.id === 'hub_alabang_oneayala') || null;
    }
    return null;
  }

  private rankAndPruneOptions(options: TransitRouteOption[]): TransitRouteOption[] {
    // Sort primarily by transfer count (fewest first), then by travel time, then fare
    const sorted = options.sort((a, b) => {
      if (a.transferCount !== b.transferCount) {
        return a.transferCount - b.transferCount;
      }
      if (a.totalEstimatedMinutes !== b.totalEstimatedMinutes) {
        return a.totalEstimatedMinutes - b.totalEstimatedMinutes;
      }
      return a.totalEstimatedFare - b.totalEstimatedFare;
    });

    // Deduplicate options that have identical leg mode profiles and transfers
    const uniqueOptions: TransitRouteOption[] = [];
    const seenSummaries = new Set<string>();

    for (const opt of sorted) {
      const summary = opt.legs
        .map((l) => `${l.fromStop}->${l.toStop} via ${l.operator}`)
        .join(' | ');

      if (!seenSummaries.has(summary)) {
        seenSummaries.add(summary);
        uniqueOptions.push(opt);
      }
    }

    // Limit to top 5 most actionable options
    return uniqueOptions.slice(0, 5);
  }
}

export const RouteSolver = new RouteSolverImpl();
