/** Geodesic helpers. */
export declare function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number;
/** Point-in-polygon (ray casting) — vertices as [lat, lon]. */
export declare function pointInPolygon(lat: number, lon: number, vertices: Array<[number, number]>): boolean;
/** Centroid of a polygon's vertices ([lat, lon]). */
export declare function centroid(vertices: Array<[number, number]>): {
    latitude: number;
    longitude: number;
};
export declare function uuidv4(): string;
