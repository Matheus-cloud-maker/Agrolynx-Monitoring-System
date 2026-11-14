import { fromArrayBuffer } from 'geotiff';

export type RasterKind = 'ndvi' | 'evi' | 'soil_moisture' | 'lst' | 'quality' | 'generic';

export interface DecodedRasterInfo {
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [west, south, east, north]
  noDataValue: number | null;
  kind: RasterKind;
  unitLabel: string;
  isQualityMask: boolean;
  validCount: number;
  totalCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  values: Float64Array;
  dataUrl?: string;
}

function interpolateRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

export function mapVegetationColor(val: number): [number, number, number] {
  if (val <= 0.1) {
    return interpolateRgb([153, 27, 27], [220, 38, 38], (val + 0.2) / 0.3);
  }
  if (val <= 0.35) {
    return interpolateRgb([234, 88, 12], [250, 204, 21], (val - 0.1) / 0.25);
  }
  if (val <= 0.6) {
    return interpolateRgb([250, 204, 21], [101, 163, 13], (val - 0.35) / 0.25);
  }
  return interpolateRgb([101, 163, 13], [20, 83, 45], (val - 0.6) / 0.35);
}

export function mapSoilMoistureColor(val: number): [number, number, number] {
  // 0.05 (seco) -> 0.22 (moderado) -> 0.45+ (úmido/saturado)
  if (val <= 0.15) {
    return interpolateRgb([180, 83, 9], [245, 158, 11], (val - 0.03) / 0.12);
  }
  if (val <= 0.3) {
    return interpolateRgb([245, 158, 11], [14, 165, 233], (val - 0.15) / 0.15);
  }
  return interpolateRgb([14, 165, 233], [29, 78, 216], (val - 0.3) / 0.2);
}

export function mapLstCelsiusColor(val: number): [number, number, number] {
  // 15 °C (frio) -> 27 °C (moderado) -> 36 °C (quente) -> 45 °C+ (estresse térmico)
  if (val <= 24) {
    return interpolateRgb([2, 132, 199], [56, 189, 248], (val - 12) / 12);
  }
  if (val <= 33) {
    return interpolateRgb([250, 204, 21], [245, 158, 11], (val - 24) / 9);
  }
  return interpolateRgb([234, 88, 12], [185, 28, 28], (val - 33) / 12);
}

export function mapLinearColor(val: number, min: number, max: number): [number, number, number] {
  const span = max - min || 1;
  const t = (val - min) / span;
  if (t <= 0.5) {
    return interpolateRgb([14, 116, 144], [250, 204, 21], t * 2);
  }
  return interpolateRgb([250, 204, 21], [185, 28, 28], (t - 0.5) * 2);
}

export function detectRasterKind(fileName: string): RasterKind {
  const lower = fileName.toLowerCase();
  if (
    lower.includes('quality') ||
    lower.includes('fmask') ||
    lower.includes('_qc') ||
    lower.includes('cloud') ||
    lower.includes('reliability')
  ) {
    return 'quality';
  }
  if (lower.includes('evi')) return 'evi';
  if (lower.includes('ndvi')) return 'ndvi';
  if (
    lower.includes('sm_surface') ||
    lower.includes('sm_rootzone') ||
    lower.includes('soil_moisture') ||
    lower.includes('spl4smgp') ||
    lower.includes('spl3smp')
  ) {
    return 'soil_moisture';
  }
  if (lower.includes('lst') && !lower.includes('err')) {
    return 'lst';
  }
  return 'generic';
}

export function colorForRasterPixel(
  kind: RasterKind,
  val: number,
  min: number,
  max: number
): [number, number, number] {
  if (kind === 'ndvi' || kind === 'evi') return mapVegetationColor(val);
  if (kind === 'soil_moisture') return mapSoilMoistureColor(val);
  if (kind === 'lst') return mapLstCelsiusColor(val);
  return mapLinearColor(val, min, max);
}

export function renderRasterToCanvas(
  raster: DecodedRasterInfo,
  canvas: HTMLCanvasElement
): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imgData = ctx.createImageData(raster.width, raster.height);
  const data = imgData.data;
  const min = raster.min ?? 0;
  const max = raster.max ?? 1;

  for (let i = 0; i < raster.totalCount; i += 1) {
    const val = raster.values[i];
    const offset = i * 4;
    if (Number.isNaN(val)) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      continue;
    }

    const [r, g, b] = colorForRasterPixel(raster.kind, val, min, max);
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}

export async function decodeGeoTiffRaster(
  buffer: ArrayBuffer,
  fileName: string,
  options?: { createDataUrl?: boolean }
): Promise<DecodedRasterInfo> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const rawBbox = image.getBoundingBox();
  const bbox: [number, number, number, number] = [
    Number(rawBbox[0]),
    Number(rawBbox[1]),
    Number(rawBbox[2]),
    Number(rawBbox[3]),
  ];

  const kind = detectRasterKind(fileName);
  const isViLayer = kind === 'ndvi' || kind === 'evi';
  const isQualityMask = kind === 'quality';
  const isLstLayer = kind === 'lst';
  const isMoistureLayer = kind === 'soil_moisture';

  const gdalNoData = image.getGDALNoData();
  const noDataValue =
    gdalNoData !== null && Number.isFinite(gdalNoData)
      ? gdalNoData
      : isViLayer
      ? -3000
      : isMoistureLayer
      ? -9999
      : isQualityMask
      ? 65535
      : null;

  // Amostra floating-point IEEE (SampleFormat === 3) já está em unidade física ou Kelvin direto
  const sampleFormat = image.getSampleFormat?.(0);
  const isFloatSample = sampleFormat === 3;
  const viScaleFactor = isFloatSample ? 1 : 0.0001;

  const unitLabel =
    kind === 'ndvi'
      ? 'NDVI'
      : kind === 'evi'
      ? 'EVI'
      : isLstLayer
      ? '°C'
      : isMoistureLayer
      ? 'm³/m³'
      : isQualityMask
      ? 'QA Bitmask'
      : 'valor bruto';

  const bands = await image.readRasters({ samples: [0] });
  const rawBand = bands[0] as ArrayLike<number>;
  const totalCount = width * height;
  const values = new Float64Array(totalCount);

  let validCount = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < totalCount; i += 1) {
    const raw = Number(rawBand[i]);
    const isGdalNoData = noDataValue !== null && raw === noDataValue;
    const isViMissing =
      isViLayer && (isGdalNoData || (!isFloatSample && raw <= -2500) || (isFloatSample && raw <= -1.5));
    const isMoistureMissing = isMoistureLayer && (isGdalNoData || raw < 0 || raw > 1.0);
    const isLstMissing = isLstLayer && (isGdalNoData || raw === 0);

    if (!Number.isFinite(raw) || isGdalNoData || isViMissing || isMoistureMissing || isLstMissing) {
      values[i] = Number.NaN;
      continue;
    }

    let scaled = raw;
    if (isViLayer) {
      scaled = raw * viScaleFactor;
      if (scaled < -1.05 || scaled > 1.05) {
        values[i] = Number.NaN;
        continue;
      }
    } else if (isLstLayer) {
      // ECO_L2T_LSTE V002 é float32 em Kelvin (ex: 302.4 K -> scale=1); legado ECO2LSTE V001 era uint16 * 0.02
      const kelvin = raw > 1000 ? raw * 0.02 : raw;
      scaled = kelvin - 273.15;
      if (!Number.isFinite(scaled) || scaled < -60 || scaled > 90) {
        values[i] = Number.NaN;
        continue;
      }
    }

    values[i] = scaled;
    validCount += 1;
    if (scaled < min) min = scaled;
    if (scaled > max) max = scaled;
    sum += scaled;
  }

  const info: DecodedRasterInfo = {
    width,
    height,
    bbox,
    noDataValue,
    kind,
    unitLabel,
    isQualityMask,
    validCount,
    totalCount,
    min: validCount > 0 ? min : null,
    max: validCount > 0 ? max : null,
    mean: validCount > 0 ? sum / validCount : null,
    values,
  };

  if (options?.createDataUrl && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    renderRasterToCanvas(info, canvas);
    info.dataUrl = canvas.toDataURL('image/png');
  }

  return info;
}
