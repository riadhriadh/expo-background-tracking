"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const geo_1 = require("../geo");
describe('haversine', () => {
    it('returns 0 for identical coordinates', () => {
        expect((0, geo_1.haversine)(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
    });
    it('calculates Paris → London (~341 km) within 1 km', () => {
        const dist = (0, geo_1.haversine)(48.8566, 2.3522, 51.5074, -0.1278);
        expect(dist).toBeGreaterThan(340000);
        expect(dist).toBeLessThan(346000);
    });
    it('calculates a short distance (~111 m per 0.001°) correctly', () => {
        // 0.001° latitude ≈ 111 m
        const dist = (0, geo_1.haversine)(48.0, 2.0, 48.001, 2.0);
        expect(dist).toBeGreaterThan(100);
        expect(dist).toBeLessThan(120);
    });
    it('is symmetric (A→B === B→A)', () => {
        const ab = (0, geo_1.haversine)(48.0, 2.0, 49.0, 3.0);
        const ba = (0, geo_1.haversine)(49.0, 3.0, 48.0, 2.0);
        expect(ab).toBeCloseTo(ba, 3);
    });
    it('handles antipodal points (~20 015 km)', () => {
        const dist = (0, geo_1.haversine)(0, 0, 0, 180);
        expect(dist).toBeGreaterThan(20000000);
        expect(dist).toBeLessThan(20100000);
    });
});
describe('pointInPolygon', () => {
    // Simple square: (0,0)→(0,1)→(1,1)→(1,0)  (lat,lon)
    const square = [[0, 0], [0, 1], [1, 1], [1, 0]];
    it('returns true for a point clearly inside', () => {
        expect((0, geo_1.pointInPolygon)(0.5, 0.5, square)).toBe(true);
    });
    it('returns false for a point clearly outside', () => {
        expect((0, geo_1.pointInPolygon)(2, 2, square)).toBe(false);
    });
    it('returns false for a point outside on an axis', () => {
        expect((0, geo_1.pointInPolygon)(0.5, 2, square)).toBe(false);
    });
    it('handles a triangle', () => {
        // triangle: apex at (0, 0.5), base at lat=1 from lon=0 to lon=1
        const triangle = [[0, 0.5], [1, 0], [1, 1]];
        expect((0, geo_1.pointInPolygon)(0.8, 0.5, triangle)).toBe(true); // deep inside
        expect((0, geo_1.pointInPolygon)(0.1, 0.1, triangle)).toBe(false); // left of left edge at lat=0.1
    });
    it('handles a real-world bounding box (Paris)', () => {
        const paris = [
            [48.815, 2.224], [48.815, 2.470],
            [48.902, 2.470], [48.902, 2.224],
        ];
        expect((0, geo_1.pointInPolygon)(48.8566, 2.3522, paris)).toBe(true); // Eiffel Tower
        expect((0, geo_1.pointInPolygon)(51.5074, -0.1278, paris)).toBe(false); // London
    });
});
describe('centroid', () => {
    it('returns the midpoint for two vertices', () => {
        const result = (0, geo_1.centroid)([[0, 0], [2, 4]]);
        expect(result.latitude).toBeCloseTo(1);
        expect(result.longitude).toBeCloseTo(2);
    });
    it('returns the single vertex for one vertex', () => {
        const result = (0, geo_1.centroid)([[48.8566, 2.3522]]);
        expect(result.latitude).toBeCloseTo(48.8566);
        expect(result.longitude).toBeCloseTo(2.3522);
    });
    it('returns the geometric center of a square', () => {
        const result = (0, geo_1.centroid)([[0, 0], [0, 2], [2, 2], [2, 0]]);
        expect(result.latitude).toBeCloseTo(1);
        expect(result.longitude).toBeCloseTo(1);
    });
});
describe('uuidv4', () => {
    it('matches the UUID v4 format', () => {
        const uuid = (0, geo_1.uuidv4)();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
    it('generates unique values', () => {
        const ids = new Set(Array.from({ length: 1000 }, () => (0, geo_1.uuidv4)()));
        expect(ids.size).toBe(1000);
    });
});
