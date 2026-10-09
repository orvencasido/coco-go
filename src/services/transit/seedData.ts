import { Terminal, Route, TransferHub } from '@/types/transit';

/**
 * Seed data definitions for the initial transit knowledge base
 * Southern Luzon corridors <-> Metro Manila (Lucena, Batangas, Laguna <-> PITX, Buendia, Cubao)
 * and Metro Manila transit spine (MRT-3, LRT-1, LRT-2, EDSA Busway).
 */
export const SEED_TERMINALS: Terminal[] = [
  {
    id: 'term_lucena_grand',
    name: 'Lucena Grand Central Terminal',
    city: 'Lucena City',
    province: 'Quezon',
    aliases: ['Lucena Grand', 'LGCT', 'Grand Central Lucena', 'Lucena'],
  },
  {
    id: 'term_pitx',
    name: 'Parañaque Integrated Terminal Exchange',
    city: 'Parañaque',
    province: 'Metro Manila',
    aliases: ['PITX', 'Paranaque Integrated Terminal', 'Coastal Mall Terminal'],
  },
  {
    id: 'term_buendia_gil_puyat',
    name: 'Buendia Bus Terminal (Gil Puyat & Taft)',
    city: 'Pasay',
    province: 'Metro Manila',
    aliases: ['Buendia', 'Gil Puyat', 'Buendia Taft', 'JAC Liner Buendia', 'DLTB Buendia', 'JAM Buendia'],
  },
  {
    id: 'term_cubao_bus',
    name: 'Cubao Bus Terminals (EDSA)',
    city: 'Quezon City',
    province: 'Metro Manila',
    aliases: ['Cubao', 'Araneta Center Cubao', 'Cubao Bus Terminal'],
  },
  {
    id: 'term_ayala_mrt',
    name: 'MRT-3 Ayala Station / SM Makati / One Ayala',
    city: 'Makati',
    province: 'Metro Manila',
    aliases: ['SM Makati', 'Ayala', 'One Ayala', 'Ayala Center', 'Makati CBD', 'Ayala MRT'],
  },
];

export const SEED_ROUTES: Route[] = [
  {
    id: 'route_jac_lucena_buendia',
    name: 'JAC Liner: Lucena <-> Buendia (via ACTEX / SLEX)',
    mode: 'bus',
    operator: 'JAC Liner',
    frequency: 'Every 30 mins (24/7)',
  },
  {
    id: 'route_dltb_lucena_pitx',
    name: 'DLTB: Lucena <-> PITX (via SLEX)',
    mode: 'bus',
    operator: 'DLTB',
    frequency: 'Every 45 mins',
  },
  {
    id: 'route_mrt3',
    name: 'MRT-3 Metro Rail Transit',
    mode: 'mrt',
    operator: 'DOTr MRT-3',
    frequency: 'Every 4-7 mins',
    firstTrip: '04:36',
    lastTrip: '22:10',
  },
  {
    id: 'route_edsa_busway',
    name: 'EDSA Carousel Busway',
    mode: 'bus',
    operator: 'EDSA Busway Consortium',
    frequency: '24/7 Continuous',
  },
];

export const SEED_HUBS: TransferHub[] = [
  {
    id: 'hub_buendia_ayala',
    hubName: 'Buendia to Ayala Ave / SM Makati Connection',
    connectingModes: ['bus', 'jeepney', 'mrt'],
    walkingTimeMinutes: 5,
    tips: 'From Buendia bus terminals (Taft), take a Washington/Ayala jeep along Sen. Gil Puyat Ave or take LRT-1 to EDSA and transfer to MRT-3 Taft to Ayala.',
  },
];
