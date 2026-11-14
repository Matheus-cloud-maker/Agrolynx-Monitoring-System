import turfArea from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import kinks from '@turf/kinks';
import type { GeoPoint } from '../types/agrolynx';

export interface PolygonValidationResult {
  valid: boolean;
  error?: string;
  closedRing?: [number, number][];
}

export interface PolygonAreaResult {
  valid: boolean;
  areaHa: number | null;
  areaM2: number | null;
  error?: string;
}

function isFiniteLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isFiniteLon(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function normalizeUniqueVertices(points: GeoPoint[]): GeoPoint[] {
  if (points.length === 0) return [];
  const list = [...points];
  const first = list[0];
  const last = list[list.length - 1];
  if (list.length > 1 && first.lat === last.lat && first.lon === last.lon) {
    list.pop();
  }
  return list;
}

export function validatePolygonGeometry(points: GeoPoint[]): PolygonValidationResult {
  if (!Array.isArray(points) || points.length < 3) {
    return {
      valid: false,
      error: 'Um polígono válido exige pelo menos 3 vértices.',
    };
  }

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt || !isFiniteLat(pt.lat) || !isFiniteLon(pt.lon)) {
      return {
        valid: false,
        error: `Coordenada inválida no vértice ${i + 1}. Latitude deve estar entre -90 e 90 e longitude entre -180 e 180.`,
      };
    }
  }

  const uniquePts = normalizeUniqueVertices(points);
  if (uniquePts.length < 3) {
    return {
      valid: false,
      error: 'O polígono precisa ter pelo menos 3 vértices distintos.',
    };
  }

  // Verifica se há vértices suficientes não colineares / distintos
  const distinctCoordKeys = new Set(uniquePts.map((p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`));
  if (distinctCoordKeys.size < 3) {
    return {
      valid: false,
      error: 'Os vértices informados são idênticos ou insuficientes para formar uma área.',
    };
  }

  const ring: [number, number][] = uniquePts.map((p) => [p.lon, p.lat]);
  ring.push([uniquePts[0].lon, uniquePts[0].lat]);

  try {
    const feature = turfPolygon([ring]);
    const selfIntersections = kinks(feature);
    if (selfIntersections.features.length > 0) {
      return {
        valid: false,
        error:
          'Polígono inválido: os segmentos se cruzam (autointerseção detectada). Reordene os vértices em sentido horário ou anti-horário.',
      };
    }

    const areaM2 = turfArea(feature);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
      return {
        valid: false,
        error: 'Polígono degenerado: a área calculada é nula.',
      };
    }

    return { valid: true, closedRing: ring };
  } catch {
    return {
      valid: false,
      error: 'Não foi possível validar a geometria do polígono informado.',
    };
  }
}

export function calculatePolygonAreaHa(points: GeoPoint[] | undefined): PolygonAreaResult {
  if (!points || points.length === 0) {
    return {
      valid: false,
      areaHa: null,
      areaM2: null,
      error: 'Nenhum polígono informado.',
    };
  }

  const validation = validatePolygonGeometry(points);
  if (!validation.valid || !validation.closedRing) {
    return {
      valid: false,
      areaHa: null,
      areaM2: null,
      error: validation.error,
    };
  }

  const feature = turfPolygon([validation.closedRing]);
  const areaM2 = turfArea(feature);
  const areaHa = areaM2 / 10000;

  return {
    valid: true,
    areaHa: Number(areaHa.toFixed(2)),
    areaM2: Number(areaM2.toFixed(2)),
  };
}

export function getPolygonCentroid(points: GeoPoint[]): GeoPoint {
  const unique = normalizeUniqueVertices(points);
  if (unique.length === 0) {
    return { lat: 0, lon: 0 };
  }
  if (unique.length < 3) {
    const lat = unique.reduce((s, p) => s + p.lat, 0) / unique.length;
    const lon = unique.reduce((s, p) => s + p.lon, 0) / unique.length;
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < unique.length; i++) {
    const p1 = unique[i];
    const p2 = unique[(i + 1) % unique.length];
    const f = p1.lon * p2.lat - p2.lon * p1.lat;
    twiceArea += f;
    cx += (p1.lon + p2.lon) * f;
    cy += (p1.lat + p2.lat) * f;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const lat = unique.reduce((s, p) => s + p.lat, 0) / unique.length;
    const lon = unique.reduce((s, p) => s + p.lon, 0) / unique.length;
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  }

  return {
    lat: Number((cy / (3 * twiceArea)).toFixed(6)),
    lon: Number((cx / (3 * twiceArea)).toFixed(6)),
  };
}

export function getPolygonBoundingBox(points: GeoPoint[]): [number, number, number, number] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

export interface RealGeometryCheckResult {
  valid: boolean;
  reason?: string;
  areaHa?: number;
  bbox?: [number, number, number, number];
  centroid?: GeoPoint;
}

export function hasValidRealGeometry(
  property?: {
    boundaryPolygon?: GeoPoint[];
    boundarySource?: 'usuario_geo' | 'estimado_area' | 'demo';
  } | null
): RealGeometryCheckResult {
  if (!property) {
    return { valid: false, reason: 'Nenhuma propriedade selecionada.' };
  }
  if (!property.boundaryPolygon || property.boundaryPolygon.length < 3) {
    return {
      valid: false,
      reason:
        'A propriedade não possui um perímetro poligonal salvo. Cadastre ou desenhe o polígono real antes de executar consultas geográficas.',
    };
  }
  if (property.boundarySource === 'estimado_area') {
    return {
      valid: false,
      reason:
        'Perímetros estimados pela área não são aceitos como limites reais. Desenhe ou informe os vértices geográficos reais da propriedade.',
    };
  }
  const area = calculatePolygonAreaHa(property.boundaryPolygon);
  if (!area.valid || area.areaHa === null) {
    return {
      valid: false,
      reason: area.error || 'O polígono salvo da propriedade é geométricamente inválido.',
    };
  }
  return {
    valid: true,
    areaHa: area.areaHa,
    bbox: getPolygonBoundingBox(property.boundaryPolygon),
    centroid: getPolygonCentroid(property.boundaryPolygon),
  };
}

