import React, { useEffect, useRef, useState } from 'react';
import { Download, Layers, Loader2, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { AppeearsBundleFile } from '../../../types/nasa';
import {
  decodeGeoTiffRaster,
  renderRasterToCanvas,
  type DecodedRasterInfo,
} from '../../../utils/geotiffRaster';

interface GeoTiffViewerProps {
  taskId: string;
  file: AppeearsBundleFile;
  product: string;
  resolution: string;
  onClose: () => void;
}

export const GeoTiffViewer: React.FC<GeoTiffViewerProps> = ({
  taskId,
  file,
  product,
  resolution,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raster, setRaster] = useState<DecodedRasterInfo | null>(null);
  const [hoverPixel, setHoverPixel] = useState<{
    row: number;
    col: number;
    lat: number;
    lon: number;
    value: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAndDecode() {
      setLoading(true);
      setError(null);
      setRaster(null);
      setHoverPixel(null);

      try {
        const resp = await fetch(
          `/api/nasa/appeears/bundle/${encodeURIComponent(taskId)}/file/${encodeURIComponent(
            file.fileId
          )}`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!resp.ok) {
          throw new Error(`Falha ao carregar GeoTIFF do servidor (HTTP ${resp.status}).`);
        }

        const buf = await resp.arrayBuffer();
        const decoded = await decodeGeoTiffRaster(buf, file.fileName);
        if (cancelled) return;
        setRaster(decoded);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível decodificar o arquivo GeoTIFF.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAndDecode();
    return () => {
      cancelled = true;
    };
  }, [taskId, file.fileId, file.fileName]);

  useEffect(() => {
    if (!raster || !canvasRef.current) return;
    renderRasterToCanvas(raster, canvasRef.current);
  }, [raster]);

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!raster || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(0.9999, (e.clientY - rect.top) / rect.height));
    const col = Math.floor(normX * raster.width);
    const row = Math.floor(normY * raster.height);
    const idx = row * raster.width + col;
    const rawVal = raster.values[idx];

    const [west, south, east, north] = raster.bbox;
    const lon = west + ((col + 0.5) / raster.width) * (east - west);
    const lat = north - ((row + 0.5) / raster.height) * (north - south);

    setHoverPixel({
      row,
      col,
      lat,
      lon,
      value: Number.isNaN(rawVal) ? null : rawVal,
    });
  };

  const shortFileName = file.fileName.split('/').pop() || file.fileName;
  const downloadHref = `/api/nasa/appeears/bundle/${encodeURIComponent(
    taskId
  )}/file/${encodeURIComponent(file.fileId)}?download=1`;

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-semibold text-navy-900 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-agro-700" />
            Visualizador Real de GeoTIFF ({product})
          </p>
          <p className="font-mono text-[11px] text-slate-600 mt-0.5 break-all">
            {shortFileName} · {resolution}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={downloadHref}
            download={shortFileName}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> Baixar GeoTIFF
          </a>
          <Button variant="outline" size="sm" onClick={onClose} icon={<X className="w-3.5 h-3.5" />}>
            Fechar
          </Button>
        </div>
      </div>

      {loading && (
        <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-agro-700" />
          Decodificando pixels reais do GeoTIFF AppEEARS...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
          {error}
        </div>
      )}

      {raster && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <div className="md:col-span-7 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasMove}
                onMouseLeave={() => setHoverPixel(null)}
                style={{ imageRendering: 'pixelated' }}
                className="w-full max-w-[420px] aspect-auto border border-slate-300 bg-white cursor-crosshair"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 flex flex-wrap items-center justify-between gap-2">
              {hoverPixel ? (
                <>
                  <span>
                    Pixel ({hoverPixel.col}, {hoverPixel.row}) · Lat {hoverPixel.lat.toFixed(5)},
                    Lon {hoverPixel.lon.toFixed(5)}
                  </span>
                  <span className="font-semibold text-navy-900">
                    {hoverPixel.value !== null
                      ? `${raster.unitLabel}: ${hoverPixel.value.toFixed(4)}`
                      : 'NoData / fora do polígono'}
                  </span>
                </>
              ) : (
                <span>Passe o cursor sobre o raster para inspecionar cada pixel real.</span>
              )}
            </div>
          </div>

          <div className="md:col-span-5 space-y-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <p className="font-semibold text-navy-900">Estatísticas calculadas do raster</p>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-slate-500">Dimensões</dt>
                <dd className="font-mono text-right text-navy-900">
                  {raster.width} × {raster.height} px
                </dd>
                <dt className="text-slate-500">Pixels válidos</dt>
                <dd className="font-mono text-right text-navy-900">
                  {raster.validCount} / {raster.totalCount}
                </dd>
                <dt className="text-slate-500">Mínimo ({raster.unitLabel})</dt>
                <dd className="font-mono text-right text-navy-900">
                  {raster.min !== null ? raster.min.toFixed(4) : '—'}
                </dd>
                <dt className="text-slate-500">Máximo ({raster.unitLabel})</dt>
                <dd className="font-mono text-right text-navy-900">
                  {raster.max !== null ? raster.max.toFixed(4) : '—'}
                </dd>
                <dt className="text-slate-500">Média ({raster.unitLabel})</dt>
                <dd className="font-mono text-right font-semibold text-agro-700">
                  {raster.mean !== null ? raster.mean.toFixed(4) : '—'}
                </dd>
              </dl>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="font-semibold text-navy-900">
                Legenda ({raster.unitLabel})
              </p>
              {raster.kind === 'ndvi' || raster.kind === 'evi' ? (
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <div
                    className="h-3 w-full rounded border border-slate-200"
                    style={{
                      background:
                        'linear-gradient(90deg, #991b1b 0%, #dc2626 20%, #facc15 45%, #65a30d 72%, #14532d 100%)',
                    }}
                  />
                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                    <span>-0,2 (solo/água)</span>
                    <span>0,35 (esparsa)</span>
                    <span>0,9+ (vigorosa)</span>
                  </div>
                </div>
              ) : raster.kind === 'soil_moisture' ? (
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <div
                    className="h-3 w-full rounded border border-slate-200"
                    style={{
                      background:
                        'linear-gradient(90deg, #b45309 0%, #f59e0b 30%, #0ea5e9 65%, #1d4ed8 100%)',
                    }}
                  />
                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                    <span>0,05 (seco)</span>
                    <span>0,22 (moderado)</span>
                    <span>0,45+ (úmido)</span>
                  </div>
                </div>
              ) : raster.kind === 'lst' ? (
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <div
                    className="h-3 w-full rounded border border-slate-200"
                    style={{
                      background:
                        'linear-gradient(90deg, #0284c7 0%, #38bdf8 25%, #facc15 55%, #ea580c 80%, #b91c1c 100%)',
                    }}
                  />
                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                    <span>≤15 °C (fria)</span>
                    <span>28 °C (moderada)</span>
                    <span>≥42 °C (estresse)</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <div
                    className="h-3 w-full rounded border border-slate-200"
                    style={{
                      background:
                        'linear-gradient(90deg, #0e7490 0%, #facc15 50%, #b91c1c 100%)',
                    }}
                  />
                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                    <span>{raster.min !== null ? raster.min.toFixed(2) : 'Mín'}</span>
                    <span>{raster.max !== null ? raster.max.toFixed(2) : 'Máx'}</span>
                  </div>
                </div>
              )}
              <p className="font-mono text-[10px] text-slate-500 break-all">
                BBox WGS84: [{raster.bbox.map((n) => n.toFixed(4)).join(', ')}]
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
