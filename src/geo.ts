/** Geodesic helpers. */

const R = 6_371_000; // earth radius, metres

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Point-in-polygon (ray casting) — vertices as [lat, lon]. */
export function pointInPolygon(
  lat: number,
  lon: number,
  vertices: Array<[number, number]>
): boolean {
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
export function centroid(
  vertices: Array<[number, number]>
): { latitude: number; longitude: number } {
  const n = vertices.length || 1;
  let lat = 0;
  let lon = 0;
  for (const [vLat, vLon] of vertices) {
    lat += vLat;
    lon += vLon;
  }
  return { latitude: lat / n, longitude: lon / n };
}

export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
