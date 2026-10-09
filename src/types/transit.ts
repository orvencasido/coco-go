/**
 * Transit Knowledge Base & Routing Types for coco-go
 */

export type TransitMode =
  | 'bus'
  | 'mrt'
  | 'lrt'
  | 'jeepney'
  | 'uv'
  | 'pnr'
  | 'ferry'
  | 'walk';

export interface Terminal {
  id: string;
  name: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
  aliases: string[];
}

export interface Route {
  id: string;
  name: string;
  mode: TransitMode;
  operator: string;
  frequency?: string;
  firstTrip?: string;
  lastTrip?: string;
}

export interface RouteStop {
  routeId: string;
  stopOrder: number;
  terminalId: string;
  terminalName?: string;
  fareEstimate: number;
  travelTimeMinutes: number;
}

export interface TransferHub {
  id: string;
  hubName: string;
  connectingModes: TransitMode[];
  walkingTimeMinutes: number;
  tips?: string;
}

export interface RouteLeg {
  stepOrder: number;
  mode: TransitMode;
  routeId?: string;
  routeName?: string;
  operator?: string;
  fromStop: string;
  toStop: string;
  estimatedFare: number;
  estimatedMinutes: number;
  instructions: string;
}

export interface TransitRouteOption {
  id: string;
  totalEstimatedFare: number;
  totalEstimatedMinutes: number;
  transferCount: number;
  legs: RouteLeg[];
  origin: string;
  destination: string;
  verified: boolean;
}

export interface TransitQueryResult {
  query: string;
  found: boolean;
  options: TransitRouteOption[];
  rawNotes?: string;
  missingRouteNotice?: string;
}
