// VliegVuil core entry point
// Pure TypeScript - no DOM, no React

export * from './providers';
export * from './geometry';
export * from './interpolation';
export * from './noise';

// Re-export types for easier access
export type { AircraftPosition, BoundingBox, PositionProvider, PositionProviderConfig } from './providers/types';
export type { Point, Polygon, MultiPolygon } from './geometry/types';
export type { NoiseBand, NoiseContour, NoiseLookupResult } from './noise/types';
