import type { NoiseContours, NoiseKind } from '../../../src/noise/types';
export interface TestNoiseContour {
    airport: string;
    year: number;
    bandLowerDb: number;
    metric: string;
    kind: NoiseKind;
    coordinates: number[][][] | number[][][][];
    geometryType: 'Polygon' | 'MultiPolygon';
    properties: {
        source: string;
        license: string;
        date: string;
    };
}
export declare const SCHIPHOL_CONTOURS: TestNoiseContour[];
export declare const ROTTERDAM_CONTOURS: TestNoiseContour[];
export declare const EINDHOVEN_CONTOURS: TestNoiseContour[];
export declare const MULTI_POLYGON_TEST_CONTOUR: TestNoiseContour;
export declare function createSchipholNoiseContours(): NoiseContours;
export declare function createRotterdamNoiseContours(): NoiseContours;
export declare function createEindhovenNoiseContours(): NoiseContours;
export declare function createAllNoiseContours(): NoiseContours;
export declare function createMultiPolygonTestContours(): NoiseContours;
export declare const TEST_POINTS: {
    SCHIPHOL_CENTER: {
        x: number;
        y: number;
    };
    SCHIPHOL_INSIDE_70DB: {
        x: number;
        y: number;
    };
    SCHIPHOL_INSIDE_56DB: {
        x: number;
        y: number;
    };
    SCHIPHOL_INSIDE_48DB: {
        x: number;
        y: number;
    };
    SCHIPHOL_OUTSIDE: {
        x: number;
        y: number;
    };
    ROTTERDAM_CENTER: {
        x: number;
        y: number;
    };
    ROTTERDAM_INSIDE_56DB: {
        x: number;
        y: number;
    };
    ROTTERDAM_OUTSIDE: {
        x: number;
        y: number;
    };
    EINDHOVEN_CENTER: {
        x: number;
        y: number;
    };
    EINDHOVEN_INSIDE_48DB: {
        x: number;
        y: number;
    };
    EINDHOVEN_OUTSIDE: {
        x: number;
        y: number;
    };
    MULTI_POLY_INSIDE_FIRST: {
        x: number;
        y: number;
    };
    MULTI_POLY_INSIDE_SECOND: {
        x: number;
        y: number;
    };
    MULTI_POLY_OUTSIDE: {
        x: number;
        y: number;
    };
};
