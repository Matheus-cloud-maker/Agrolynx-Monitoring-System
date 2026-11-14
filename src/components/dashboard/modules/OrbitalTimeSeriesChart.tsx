import React, { useMemo, useState } from 'react';
import type { OrbitalObservationPoint } from '../../../types/nasa';
import { formatDateBr, formatDateTimeBr } from '../../../utils/validation';

interface SeriesInput {
  label: string;
  color: string;
  points: OrbitalObservationPoint[];
}

interface OrbitalTimeSeriesChartProps {
  title: string;
  subtitle: string;
  unit: string;
  series: SeriesInput[];
  emptyMessage?: string;
  onInspectGeoTiff?: (pt: OrbitalObservationPoint) => void;
}

export const OrbitalTimeSeriesChart: React.FC<OrbitalTimeSeriesChartProps> = ({
  title,
  subtitle,
  unit,
  series,
  emptyMessage = 'Nenhuma observação real extraída no período selecionado.',
  onInspectGeoTiff,
}) => {
  const [hovered, setHovered] = useState<{
    seriesLabel: string;
    point: OrbitalObservationPoint;
    x: number;
    y: number;
  } | null>(null);

  const nonEmptySeries = useMemo(
    () => series.map((s) => ({ ...s, points: s.points.filter((p) => p.mean !== null) })).filter((s) => s.points.length > 0),
    [series]
  );

  const chartModel = useMemo(() => {
    if (nonEmptySeries.length === 0) return null;

    const allPoints = nonEmptySeries.flatMap((s) => s.points);
    const timestamps = allPoints.map((p) => new Date(p.observedAt).getTime()).filter(Number.isFinite);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const tsSpan = maxTs - minTs || 1;

    const values = allPoints.flatMap((p) => {
      const arr: number[] = [];
      if (p.mean !== null) arr.push(p.mean);
      if (nonEmptySeries.length === 1) {
        if (p.min !== null) arr.push(p.min);
        if (p.max !== null) arr.push(p.max);
      }
      return arr;
    });

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = (rawMax - rawMin || Math.abs(rawMax) * 0.1 || 0.1) * 0.12;
    const minVal = rawMin - pad;
    const maxVal = rawMax + pad;
    const valSpan = maxVal - minVal || 1;

    const width = 640;
    const height = 210;
    const padL = 48;
    const padR = 16;
    const padT = 16;
    const padB = 28;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const mapX = (ts: number) =>
      timestamps.length <= 1 || maxTs === minTs
        ? padL + innerW / 2
        : padL + ((ts - minTs) / tsSpan) * innerW;

    const mapY = (v: number) => padT + innerH - ((v - minVal) / valSpan) * innerH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = minVal + t * valSpan;
      return { val: v, y: mapY(v) };
    });

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH,
      minTs,
      maxTs,
      yTicks,
      mappedSeries: nonEmptySeries.map((s) => {
        const coords = s.points.map((pt) => {
          const ts = new Date(pt.observedAt).getTime();
          const x = mapX(Number.isFinite(ts) ? ts : minTs);
          const y = mapY(pt.mean ?? minVal);
          const yMin = pt.min !== null ? mapY(pt.min) : y;
          const yMax = pt.max !== null ? mapY(pt.max) : y;
          return { pt, x, y, yMin, yMax };
        });
        const linePath = coords
          .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ');
        const areaPath =
          nonEmptySeries.length === 1 && coords.length >= 2
            ? `${coords
                .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.yMax.toFixed(1)}`)
                .join(' ')} ${[...coords]
                .reverse()
                .map((c) => `L ${c.x.toFixed(1)} ${c.yMin.toFixed(1)}`)
                .join(' ')} Z`
            : null;
        return {
          label: s.label,
          color: s.color,
          coords,
          linePath,
          areaPath,
        };
      }),
    };
  }, [nonEmptySeries]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {nonEmptySeries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            {nonEmptySeries.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: s.color }}
                />
                {s.label} ({s.points.length})
              </span>
            ))}
          </div>
        )}
      </div>

      {!chartModel ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-8 px-4 text-center text-xs text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
              className="w-full h-auto min-w-[360px] select-none"
              role="img"
              aria-label={title}
            >
              {chartModel.yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={chartModel.padL}
                    x2={chartModel.width - chartModel.padR}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={chartModel.padL - 6}
                    y={tick.y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {unit === '°C' ? tick.val.toFixed(1) : tick.val.toFixed(2)}
                  </text>
                </g>
              ))}

              {chartModel.mappedSeries.map((s) => (
                <g key={s.label}>
                  {s.areaPath && (
                    <path d={s.areaPath} fill={s.color} fillOpacity={0.12} stroke="none" />
                  )}
                  {s.coords.length >= 2 && (
                    <path
                      d={s.linePath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2.2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {s.coords.map((c, idx) => (
                    <circle
                      key={`${s.label}-${c.pt.observedAt}-${idx}`}
                      cx={c.x}
                      cy={c.y}
                      r={s.coords.length > 25 ? 3 : 4.2}
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth={2}
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setHovered({ seriesLabel: s.label, point: c.pt, x: c.x, y: c.y })
                      }
                      onClick={() => {
                        setHovered({ seriesLabel: s.label, point: c.pt, x: c.x, y: c.y });
                        if (onInspectGeoTiff && c.pt.geotiffFileId) {
                          onInspectGeoTiff(c.pt);
                        }
                      }}
                    />
                  ))}
                </g>
              ))}

              <text
                x={chartModel.padL}
                y={chartModel.height - 8}
                fontSize="10"
                fill="#64748b"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {formatDateBr(new Date(chartModel.minTs).toISOString().slice(0, 10))}
              </text>
              {chartModel.maxTs > chartModel.minTs && (
                <text
                  x={chartModel.width - chartModel.padR}
                  y={chartModel.height - 8}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {formatDateBr(new Date(chartModel.maxTs).toISOString().slice(0, 10))}
                </text>
              )}
            </svg>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 flex flex-wrap items-center justify-between gap-2">
            {hovered ? (
              <>
                <span>
                  {hovered.seriesLabel} ·{' '}
                  {hovered.point.observedAt.includes('T')
                    ? formatDateTimeBr(hovered.point.observedAt)
                    : formatDateBr(hovered.point.date)}
                </span>
                <span className="font-semibold text-navy-900">
                  Média: {hovered.point.mean} {hovered.point.unit}
                  {hovered.point.min !== null && hovered.point.max !== null
                    ? ` (Mín ${hovered.point.min} · Máx ${hovered.point.max})`
                    : ''}
                  {' · '}
                  {hovered.point.pixelCount} px
                </span>
              </>
            ) : (
              <span>
                Passe o cursor ou clique sobre um ponto para ver estatísticas da observação ({unit}).
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
