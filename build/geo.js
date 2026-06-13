"use strict";
/** Geodesic helpers. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversine = haversine;
exports.pointInPolygon = pointInPolygon;
exports.centroid = centroid;
exports.uuidv4 = uuidv4;
const R = 6371000; // earth radius, metres
function haversine(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
/** Point-in-polygon (ray casting) — vertices as [lat, lon]. */
function pointInPolygon(lat, lon, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [yi, xi] = vertices[i];
        const [yj, xj] = vertices[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}
/** Centroid of a polygon's vertices ([lat, lon]). */
function centroid(vertices) {
    const n = vertices.length || 1;
    let lat = 0;
    let lon = 0;
    for (const [vLat, vLon] of vertices) {
        lat += vLat;
        lon += vLon;
    }
    return { latitude: lat / n, longitude: lon / n };
}
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
