import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  Compass,
  Droplets,
  RefreshCw,
  SunMedium,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { EmptyState, ErrorBanner } from '../../ui/StateViews';
import { nasaClient, NasaApiError } from '../../../services/nasaClient';
import { hasValidRealGeometry } from '../../../utils/geospatial';
import { formatArea, formatCoord, formatDateBr, formatDateTimeBr } from '../../../utils/validation';
import type { AgrolynxWorkspaceData } from '../../../types/agrolynx';
import type { NasaPowerDailyPoint, NasaPowerSeriesResponse } from '../../../types/nasa';

interface WeatherModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtVal(val: number | null, decimals = 1): string {
  if (val === null || !Number.isFinite(val)) return 'N/D';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const TemperatureChart: React.FC<{ series: NasaPowerDailyPoint[] }> = ({ series }) => {
  const validPoints = series.filter(
    (p) => p.t2mMaxC !== null || p.t2mMinC !== null || p.t2mC !== null
  );
  if (validPoints.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-8 text-center">
        Nenhuma leitura de temperatura publicada pela grade NASA POWER para o período selecionado.
      </p>
    );
  }

  const allTemps = validPoints.flatMap((p) =>
    [p.t2mMaxC, p.t2mC, p.t2mMinC].filter((v): v is number => v !== null)
  );
  const minT = Math.floor(Math.min(...allTemps) - 2);
  const maxT = Math.ceil(Math.max(...allTemps) + 2);
  const spanT = Math.max(maxT - minT, 4);

  const width = 760;
  const height = 210;
  const padL = 38;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xForIndex = (idx: number) =>
    series.length <= 1 ? padL + plotW / 2 : padL + (idx / (series.length - 1)) * plotW;
  const yForTemp = (temp: number) => padT + ((maxT - temp) / spanT) * plotH;

  const buildPath = (getter: (d: NasaPowerDailyPoint) => number | null) => {
    let dStr = '';
    series.forEach((pt, idx) => {
      const val = getter(pt);
      if (val === null) return;
      const x = xForIndex(idx).toFixed(1);
      const y = yForTemp(val).toFixed(1);
      const prevValid = idx > 0 && getter(series[idx - 1]) !== null;
      dStr += `${prevValid ? 'L' : 'M'}${x},${y} `;
    });
    return dStr.trim();
  };

  const yTicks = [minT, Math.round((minT + maxT) / 2), maxT];
  const labelStep = Math.max(1, Math.ceil(series.length / 6));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-rose-600 inline-block" /> T. Máxima (°C)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-navy-900 inline-block" /> T. Média (°C)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-600 inline-block" /> T. Mínima (°C)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible"
        role="img"
        aria-label="Gráfico histórico de temperatura máxima, média e mínima NASA POWER"
      >
        {yTicks.map((t) => {
          const y = yForTemp(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="#64748b"
                fontFamily="JetBrains Mono, monospace"
              >
                {t}°
              </text>
            </g>
          );
        })}

        <path d={buildPath((d) => d.t2mMaxC)} fill="none" stroke="#dc2626" strokeWidth="2" />
        <path d={buildPath((d) => d.t2mC)} fill="none" stroke="#0b1f3a" strokeWidth="2" />
        <path d={buildPath((d) => d.t2mMinC)} fill="none" stroke="#0284c7" strokeWidth="2" />

        {series.map((pt, idx) => {
          if (idx % labelStep !== 0 && idx !== series.length - 1) return null;
          return (
            <text
              key={pt.date}
              x={xForIndex(idx)}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
              fontFamily="JetBrains Mono, monospace"
            >
              {pt.date.slice(5).split('-').reverse().join('/')}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const PrecipitationAndSolarChart: React.FC<{ series: NasaPowerDailyPoint[] }> = ({ series }) => {
  const validPrecip = series.filter((s) => s.precipMm !== null);
  if (validPrecip.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-8 text-center">
        Nenhuma leitura de precipitação publicada pela grade NASA POWER para o período.
      </p>
    );
  }

  const maxP = Math.max(...validPrecip.map((d) => d.precipMm ?? 0), 10);
  const labelStep = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span>Precipitação diária corrigida (PRECTOTCORR · mm/dia)</span>
        <span className="font-mono">Escala máx.: {maxP.toFixed(1)} mm</span>
      </div>

      <div className="h-44 flex items-end gap-1 pt-4 px-1 border-b border-slate-200">
        {series.map((row) => {
          const val = row.precipMm;
          const pct = val !== null ? Math.round((val / maxP) * 100) : 0;
          return (
            <div
              key={row.date}
              className="flex-1 min-w-[4px] h-full flex flex-col justify-end items-center group"
              title={
                val !== null
                  ? `${formatDateBr(row.date)}: ${val.toFixed(2)} mm`
                  : `${formatDateBr(row.date)}: ainda não publicado (-999)`
              }
            >
              {val === null ? (
                <div className="w-full h-1 bg-slate-200 rounded-xs" />
              ) : (
                <div
                  className="w-full bg-navy-800 hover:bg-agro-700 rounded-t-xs transition-colors"
                  style={{ height: `${val > 0 ? Math.max(pct, 4) : 2}%`, opacity: val > 0 ? 1 : 0.2 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] font-mono text-slate-500">
        {series.map((row, idx) =>
          idx % labelStep === 0 || idx === series.length - 1 ? (
            <span key={row.date}>{row.date.slice(5).split('-').reverse().join('/')}</span>
          ) : null
        )}
      </div>
    </div>
  );
};

export const WeatherModule: React.FC<WeatherModuleProps> = ({
  workspace,
  selectedPropertyId,
  onSelectProperty,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [startDate, setStartDate] = useState<string>(() => addDaysIso(getTodayIso(), -29));
  const [endDate, setEndDate] = useState<string>(() => getTodayIso());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [powerData, setPowerData] = useState<NasaPowerSeriesResponse | null>(null);

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const geometryGate = useMemo(
    () => hasValidRealGeometry(activeProperty),
    [activeProperty]
  );

  const fetchPowerData = useCallback(async () => {
    if (!activeProperty) return;
    if (!geometryGate.valid) {
      setPowerData(null);
      setError(geometryGate.reason || 'Propriedade sem polígono real válido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await nasaClient.fetchNasaPowerSeries({
        property: activeProperty,
        startDate,
        endDate,
      });
      setPowerData(result);
    } catch (err) {
      setPowerData(null);
      setError(
        err instanceof NasaApiError
          ? err.message
          : 'Erro ao consultar o serviço oficial NASA POWER.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeProperty, geometryGate, startDate, endDate]);

  useEffect(() => {
    if (activeProperty && geometryGate.valid) {
      fetchPowerData();
    } else {
      setPowerData(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProperty?.id, geometryGate.valid]);

  const applyPreset = (days: number) => {
    const end = getTodayIso();
    const start = addDaysIso(end, -(days - 1));
    setStartDate(start);
    setEndDate(end);
  };

  if (!activeProperty) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-navy-900 font-display">
          Clima e Histórico Meteorológico (NASA POWER)
        </h1>
        <EmptyState
          title="Nenhuma propriedade cadastrada"
          description="Cadastre uma propriedade com perímetro real válido para consultar séries históricas NASA POWER."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Clima e Séries Históricas (NASA POWER)
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Consulta real à API oficial NASA POWER (dados históricos observacionais e de reanálise
            em grade ~55 km). Não representa previsão do tempo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Selecionar propriedade para consulta NASA POWER"
            value={activeProperty.id}
            onChange={(e) => onSelectProperty(e.target.value)}
            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-navy-900"
          >
            {workspace.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {[15, 30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => applyPreset(d)}
                className="px-2.5 py-1 text-xs font-medium rounded-md text-slate-700 hover:bg-white cursor-pointer"
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aviso explícito: Histórico vs Previsão */}
      <div className="rounded-xl border border-navy-200 bg-slate-100/90 px-4 py-3 text-xs text-slate-800 flex items-start gap-3">
        <Compass className="w-4 h-4 text-navy-900 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold text-navy-900">
            Dados Históricos NASA POWER — NÃO é previsão meteorológica
          </p>
          <p className="text-slate-600 mt-0.5 leading-relaxed">
            As séries diárias retornadas pela NASA POWER representam observações e reanálise
            atmosférica passada/quase em tempo real (com latência típica de 2 a 3 dias nos últimos
            registros). Dias ainda não consolidados são exibidos como &ldquo;N/D&rdquo;.
          </p>
        </div>
      </div>

      {/* Bloqueio geográfico obrigatório se não houver perímetro real válido */}
      {!geometryGate.valid && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-xs text-slate-800 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-navy-900">
              Consulta geográfica bloqueada para &ldquo;{activeProperty.name}&rdquo;
            </p>
            <p className="text-slate-700">{geometryGate.reason}</p>
          </div>
        </div>
      )}

      {/* Barra de período e execução da consulta real */}
      <DataCard
        title="Parâmetros da consulta NASA POWER"
        subtitle={
          geometryGate.valid && geometryGate.centroid
            ? `Centróide validado do polígono (${formatArea(
                geometryGate.areaHa ?? 0,
                workspace.preferences.areaUnit
              )}): ${formatCoord(geometryGate.centroid.lat, 'lat')} · ${formatCoord(
                geometryGate.centroid.lon,
                'lon'
              )}`
            : 'Defina ou desenhe um polígono real válido para liberar a consulta'
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="power-start" className="block text-xs font-medium text-slate-700 mb-1">
              Data inicial (histórico)
            </label>
            <input
              id="power-start"
              type="date"
              max={endDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-navy-900"
            />
          </div>

          <div>
            <label htmlFor="power-end" className="block text-xs font-medium text-slate-700 mb-1">
              Data final (até hoje)
            </label>
            <input
              id="power-end"
              type="date"
              min={startDate}
              max={todayIso}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-navy-900"
            />
          </div>

          <Button
            variant="primary"
            size="md"
            loading={loading}
            disabled={!geometryGate.valid}
            onClick={fetchPowerData}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Consultar NASA POWER
          </Button>
        </div>
      </DataCard>

      {error && <ErrorBanner message={error} onRetry={geometryGate.valid ? fetchPowerData : undefined} />}

      {powerData && (
        <>
          {/* KPIs do Período Consultado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Temperatura do ar</span>
                <Thermometer className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-navy-900">
                {powerData.summary.avgTempC !== null ? `${fmtVal(powerData.summary.avgTempC)} °C` : 'N/D'}
              </p>
              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                Máx {fmtVal(powerData.summary.maxTempC)}° · Mín {fmtVal(powerData.summary.minTempC)}°
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Precipitação acumulada</span>
                <CloudRain className="w-4 h-4 text-navy-800" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-navy-900">
                {powerData.summary.totalPrecipMm !== null
                  ? `${fmtVal(powerData.summary.totalPrecipMm)} mm`
                  : 'N/D'}
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                PRECTOTCORR ({powerData.units.precipMm})
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Umidade relativa média</span>
                <Droplets className="w-4 h-4 text-sky-600" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-navy-900">
                {powerData.summary.avgRh2mPercent !== null
                  ? `${fmtVal(powerData.summary.avgRh2mPercent)} %`
                  : 'Indisponível'}
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                RH2M a 2 m ({powerData.units.rh2mPercent})
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Radiação solar média</span>
                <SunMedium className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-navy-900">
                {powerData.summary.avgSolarRadMJm2 !== null
                  ? `${fmtVal(powerData.summary.avgSolarRadMJm2)} MJ/m²`
                  : 'Indisponível'}
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                ALLSKY_SFC_SW_DWN ({powerData.units.solarRadMJm2})
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Velocidade do vento</span>
                <Wind className="w-4 h-4 text-agro-700" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-navy-900">
                {powerData.summary.avgWindSpeedMs !== null
                  ? `${fmtVal(powerData.summary.avgWindSpeedMs)} m/s`
                  : 'N/D'}
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                WS2M a 2 m ({powerData.units.windSpeedMs})
              </p>
            </div>
          </div>

          {/* Gráficos da Série Histórica */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataCard
              title="Temperatura diária histórica (°C)"
              subtitle={`Período: ${formatDateBr(powerData.period.startDate)} a ${formatDateBr(
                powerData.period.endDate
              )} · Não é previsão`}
            >
              <TemperatureChart series={powerData.series} />
            </DataCard>

            <DataCard
              title="Precipitação diária histórica (mm/dia)"
              subtitle={`Período: ${formatDateBr(powerData.period.startDate)} a ${formatDateBr(
                powerData.period.endDate
              )} · Fonte NASA POWER`}
            >
              <PrecipitationAndSolarChart series={powerData.series} />
            </DataCard>
          </div>

          {/* Metadados da Fonte e Tabela Diária Completa */}
          <DataCard
            title="Série diária detalhada e metadados da fonte"
            subtitle={`Atualizado em ${formatDateTimeBr(powerData.fetchedAt)} · Fontes internas: ${powerData.sources.join(
              ', '
            )}`}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Fonte oficial</span>
                  <span className="font-medium text-navy-900">{powerData.sourceOrganization}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Período consultado</span>
                  <span className="font-mono text-navy-900">
                    {formatDateBr(powerData.period.startDate)} –{' '}
                    {formatDateBr(powerData.period.endDate)} ({powerData.period.validDaysCount}/
                    {powerData.period.totalDays} dias com dados)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Resolução / Célula NASA</span>
                  <span className="font-mono text-navy-900">
                    {powerData.spatialResolution}
                    {powerData.gridCoordinates
                      ? ` (${powerData.gridCoordinates.lat.toFixed(3)}°, ${powerData.gridCoordinates.lon.toFixed(
                          3
                        )}°)`
                      : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Atualização da consulta</span>
                  <span className="font-mono text-navy-900">
                    {formatDateTimeBr(powerData.fetchedAt)} (API {powerData.apiVersion})
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Data</th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        T. Média ({powerData.units.t2mC})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        T. Máx ({powerData.units.t2mMaxC})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        T. Mín ({powerData.units.t2mMinC})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Chuva ({powerData.units.precipMm})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        UR ({powerData.units.rh2mPercent})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Radiação ({powerData.units.solarRadMJm2})
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        Vento ({powerData.units.windSpeedMs})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {[...powerData.series].reverse().map((d) => (
                      <tr key={d.date} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-sans text-slate-800 whitespace-nowrap">
                          {formatDateBr(d.date)}
                        </td>
                        <td className="py-2 px-3 text-right text-navy-900">{fmtVal(d.t2mC)}</td>
                        <td className="py-2 px-3 text-right text-rose-700">{fmtVal(d.t2mMaxC)}</td>
                        <td className="py-2 px-3 text-right text-sky-700">{fmtVal(d.t2mMinC)}</td>
                        <td className="py-2 px-3 text-right text-navy-800">{fmtVal(d.precipMm, 2)}</td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {fmtVal(d.rh2mPercent)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {fmtVal(d.solarRadMJm2, 2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {fmtVal(d.windSpeedMs, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DataCard>
        </>
      )}
    </div>
  );
};
