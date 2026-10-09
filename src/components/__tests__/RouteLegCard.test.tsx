import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { RouteLegCard } from '../RouteLegCard';
import { RouteLeg } from '@/types/transit';

describe('RouteLegCard', () => {
  const sampleBusLeg: RouteLeg = {
    stepOrder: 1,
    mode: 'bus',
    routeName: 'Lucena to Buendia Express',
    operator: 'JAC Liner',
    fromStop: 'Lucena Grand Central Terminal',
    toStop: 'JAC Liner Buendia Terminal',
    estimatedFare: 270,
    estimatedMinutes: 180,
    instructions: 'Board bus with signboard LRT/Buendia via SLEX.',
  };

  const sampleMrtLeg: RouteLeg = {
    stepOrder: 2,
    mode: 'mrt',
    routeName: 'MRT-3 Blue Line',
    operator: 'DOTr MRT-3',
    fromStop: 'Ayala Station',
    toStop: 'Cubao Station',
    estimatedFare: 20,
    estimatedMinutes: 15,
    instructions: 'Take northbound train towards North Avenue.',
  };

  it('renders bus transit leg with step, fare, and instructions', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<RouteLegCard leg={sampleBusLeg} />);
    });

    const root = renderer!.root;
    const card = root.findByProps({ testID: 'route-leg-1' });
    expect(card).toBeDefined();

    const fareText = root.findByProps({ testID: 'leg-fare' });
    expect(fareText.props.children).toBe('₱270');

    const timeText = root.findByProps({ testID: 'leg-time' });
    expect(timeText.props.children).toContain(180);
  });

  it('renders MRT-3 transit leg properly', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<RouteLegCard leg={sampleMrtLeg} />);
    });

    const root = renderer!.root;
    const fareText = root.findByProps({ testID: 'leg-fare' });
    expect(fareText.props.children).toBe('₱20');
  });

  it('handles free transfer legs (fare 0)', () => {
    const walkLeg: RouteLeg = {
      stepOrder: 3,
      mode: 'walk',
      routeName: 'Transfer walkway',
      fromStop: 'MRT-3 Taft Avenue',
      toStop: 'LRT-1 EDSA',
      estimatedFare: 0,
      estimatedMinutes: 5,
      instructions: 'Use the elevated covered footbridge linking the stations.',
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<RouteLegCard leg={walkLeg} />);
    });

    const fareText = renderer!.root.findByProps({ testID: 'leg-fare' });
    expect(fareText.props.children).toBe('Free Transfer');
  });
});
