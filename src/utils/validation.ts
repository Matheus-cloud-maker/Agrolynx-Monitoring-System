import type { GeoPoint } from '../types/agrolynx';
import { validatePolygonGeometry } from './geospatial';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

export function buildReferencePolygonFromArea(centroid: GeoPoint, areaHa: number): GeoPoint[] {
  const safeHa = Math.max(areaHa, 1);
  const sideMeters = Math.sqrt(safeHa * 10000);
  const halfMeters = sideMeters / 2;
  const latRad = (centroid.lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLon = Math.max(111320 * Math.cos(latRad), 10000);
  const dLat = halfMeters / metersPerDegLat;
  const dLon = halfMeters / metersPerDegLon;

  return [
    { lat: Number((centroid.lat + dLat).toFixed(6)), lon: Number((centroid.lon - dLon).toFixed(6)) },
    { lat: Number((centroid.lat + dLat).toFixed(6)), lon: Number((centroid.lon + dLon).toFixed(6)) },
    { lat: Number((centroid.lat - dLat).toFixed(6)), lon: Number((centroid.lon + dLon).toFixed(6)) },
    { lat: Number((centroid.lat - dLat).toFixed(6)), lon: Number((centroid.lon - dLon).toFixed(6)) },
  ];
}

export function parsePolygonCoordinates(raw: string): { points: GeoPoint[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { points: [] };

  // Suporte opcional a GeoJSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      let ring: unknown = null;
      const extractGeometryRing = (geom: { type?: string; coordinates?: unknown[] } | undefined) => {
        if (!geom) return null;
        if (geom.type === 'Polygon') return geom.coordinates?.[0] ?? null;
        if (geom.type === 'MultiPolygon') {
          const firstPoly = geom.coordinates?.[0];
          return Array.isArray(firstPoly) ? firstPoly[0] ?? null : null;
        }
        return null;
      };

      if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        const polyFeature = parsed.features.find(
          (f: { geometry?: { type?: string } }) =>
            f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon'
        );
        ring = extractGeometryRing(polyFeature?.geometry);
      } else if (parsed?.type === 'Feature') {
        ring = extractGeometryRing(parsed.geometry);
      } else if (parsed?.type === 'Polygon' || parsed?.type === 'MultiPolygon') {
        ring = extractGeometryRing(parsed);
      } else if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        ring = Array.isArray(parsed[0][0]) ? parsed[0] : parsed;
      }

      if (Array.isArray(ring)) {
        const pts: GeoPoint[] = [];
        for (const coord of ring) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const lon = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
              return {
                points: [],
                error: 'Coordenada fora dos limites WGS84 no GeoJSON informado.',
              };
            }
            pts.push({ lat, lon });
          }
        }
        const geomCheck = validatePolygonGeometry(pts);
        if (!geomCheck.valid) {
          return { points: [], error: geomCheck.error };
        }
        return { points: pts };
      }
      return { points: [], error: 'GeoJSON inválido. Esperado Polygon com pelo menos 3 vértices.' };
    } catch {
      return { points: [], error: 'JSON inválido ao interpretar geometria GeoJSON.' };
    }
  }

  // Formato linha por linha: "lat, lon" ou "lat; lon"
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const points: GeoPoint[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/[;,\s]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      return {
        points: [],
        error: `Linha ${i + 1} inválida. Informe "latitude, longitude" por linha.`,
      };
    }
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
      return {
        points: [],
        error: `Coordenada fora dos limites WGS84 na linha ${i + 1}.`,
      };
    }
    points.push({ lat, lon });
  }

  const geomCheck = validatePolygonGeometry(points);
  if (!geomCheck.valid) {
    return { points: [], error: geomCheck.error };
  }

  return { points };
}

export function formatDateBr(isoOrDate: string): string {
  if (!isoOrDate) return '—';
  const date = isoOrDate.includes('T')
    ? new Date(isoOrDate)
    : new Date(`${isoOrDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatDateTimeBr(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatArea(ha: number, unit: 'ha' | 'alqueire_paulista' = 'ha'): string {
  if (!Number.isFinite(ha)) return '—';
  if (unit === 'alqueire_paulista') {
    const alq = ha / 2.42;
    return `${alq.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} alq`;
  }
  return `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`;
}

export function formatCoord(val: number, axis: 'lat' | 'lon'): string {
  if (!Number.isFinite(val)) return '—';
  const suffix = axis === 'lat' ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'L' : 'O';
  return `${Math.abs(val).toFixed(4)}° ${suffix}`;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
