import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  Download,
  Droplets,
  Eye,
  Filter,
  KeyRound,
  Leaf,
  Lock,
  Play,
  RefreshCw,
  Satellite,
  Sprout,
  Thermometer,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { EmptyState, ErrorBanner } from '../../ui/StateViews';
import { GeoTiffViewer } from './GeoTiffViewer';
import { OrbitalTimeSeriesChart } from './OrbitalTimeSeriesChart';
import { nasaClient, NasaApiError } from '../../../services/nasaClient';
import { INTEGRATION_SPECS } from '../../../services/contracts/dataSources';
import { POSTGRES_BLUEPRINT_SQL } from '../../../services/contracts/postgresSchema';
import { hasValidRealGeometry } from '../../../utils/geospatial';
import { formatArea, formatDateBr, formatDateTimeBr } from '../../../utils/validation';
import type { AgrolynxWorkspaceData, ConnectorId } from '../../../types/agrolynx';
import type {
  AppeearsAuthVerifyResponse,
  AppeearsBundleFile,
  AppeearsExtractionResponse,
  AppeearsLayerSpec,
  AppeearsTaskStatusResponse,
  CmrCatalogResponse,
  ExtractionConnectorBlueprint,
  ExtractionProfileKey,
  NasaIntegrationRuntimeStatus,
  OrbitalObservationPoint,
  OrbitalObservationsQueryResponse,
  OrbitalSensorCategory,
  TrackedExtractionTask,
} from '../../../types/nasa';

interface SatellitesModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onSelectProperty?: (id: string) => void;
}

function isoToAppeearsDate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  if (!yyyy || !mm || !dd) return '10-01-2026';
  return `${mm}-${dd}-${yyyy}`;
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

interface IntegrationCardConfig {
  id: OrbitalSensorCategory;
  title: string;
  sensorLabel: string;
  profileKey: ExtractionProfileKey;
  product: string;
  layers: string[];
  layerSpecs?: AppeearsLayerSpec[];
  resolution: string;
  alternateLabel?: string;
  alternateProfileKey?: ExtractionProfileKey;
  alternateProduct?: string;
  alternateLayers?: string[];
  icon: React.ReactNode;
}

const ORBITAL_INTEGRATIONS: IntegrationCardConfig[] = [
  {
    id: 'ndvi',
    title: 'NDVI — NASA HLS L30/S30',
    sensorLabel: 'Harmonized Landsat 8/9 & Sentinel-2',
    profileKey: 'hls_ndvi',
    product: 'HLSS30_VI.020',
    layers: ['NDVI'],
    layerSpecs: [
      { product: 'HLSS30_VI.020', layer: 'NDVI' },
      { product: 'HLSL30_VI.020', layer: 'NDVI' },
    ],
    resolution: '30 m × 30 m · 2–5 dias',
    alternateLabel: 'Alternativa MODIS (250 m)',
    alternateProfileKey: 'modis_ndvi',
    alternateProduct: 'MOD13Q1.061',
    alternateLayers: ['_250m_16_days_NDVI'],
    icon: <Leaf className="w-4 h-4 text-agro-700" />,
  },
  {
    id: 'evi',
    title: 'EVI — NASA HLS L30/S30 & MODIS',
    sensorLabel: 'Realçado para dossel denso (LP DAAC)',
    profileKey: 'hls_evi',
    product: 'HLSS30_VI.020',
    layers: ['EVI'],
    layerSpecs: [
      { product: 'HLSS30_VI.020', layer: 'EVI' },
      { product: 'HLSL30_VI.020', layer: 'EVI' },
    ],
    resolution: '30 m (HLS) / 250 m (MOD13Q1)',
    alternateLabel: 'Extrair MODIS EVI (250 m)',
    alternateProfileKey: 'modis_evi',
    alternateProduct: 'MOD13Q1.061',
    alternateLayers: ['_250m_16_days_EVI'],
    icon: <Sprout className="w-4 h-4 text-emerald-700" />,
  },
  {
    id: 'soil_moisture',
    title: 'Umidade do Solo — NASA SMAP SPL4SMGP',
    sensorLabel: 'SMAP L4 Assimilado (NSIDC)',
    profileKey: 'smap_spl4smgp',
    product: 'SPL4SMGP.008',
    layers: ['Geophysical_Data_sm_surface', 'Geophysical_Data_sm_rootzone'],
    resolution: '9 km × 9 km · a cada 3 horas',
    icon: <Droplets className="w-4 h-4 text-sky-700" />,
  },
  {
    id: 'lst',
    title: 'Temperatura de Superfície — NASA ECOSTRESS',
    sensorLabel: 'ECO_L2T_LSTE V002 (JPL / ISS)',
    profileKey: 'ecostress_lst',
    product: 'ECO_L2T_LSTE.002',
    layers: ['LST', 'cloud'],
    resolution: '70 m × 70 m · Revisita ~3–5 dias',
    icon: <Thermometer className="w-4 h-4 text-rose-700" />,
  },
];

export const SatellitesModule: React.FC<SatellitesModuleProps> = ({
  workspace,
  selectedPropertyId,
  onSelectProperty,
}) => {
  const [selectedConnectorId, setSelectedConnectorId] = useState<ConnectorId>('nasa_power');
  const [showSqlBlueprint, setShowSqlBlueprint] = useState(false);

  // Filtros globais do módulo (Propriedade, Período e Sensor)
  const [scopeAllProperties, setScopeAllProperties] = useState(false);
  const [startDate, setStartDate] = useState('2026-09-15');
  const [endDate, setEndDate] = useState('2026-11-14');
  const [sensorFilter, setSensorFilter] = useState<OrbitalSensorCategory | 'all'>('all');

  const [runtimeStatus, setRuntimeStatus] = useState<NasaIntegrationRuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [obsLoading, setObsLoading] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);
  const [obsData, setObsData] = useState<OrbitalObservationsQueryResponse | null>(null);

  const [cmrLoading, setCmrLoading] = useState(false);
  const [cmrError, setCmrError] = useState<string | null>(null);
  const [cmrResult, setCmrResult] = useState<CmrCatalogResponse | null>(null);

  const [appeearsAuthLoading, setAppeearsAuthLoading] = useState(false);
  const [appeearsAuthResult, setAppeearsAuthResult] = useState<AppeearsAuthVerifyResponse | null>(
    null
  );

  const [appeearsLoadingKey, setAppeearsLoadingKey] = useState<string | null>(null);
  const [appeearsResponse, setAppeearsResponse] = useState<AppeearsExtractionResponse | null>(
    null
  );
  const [taskPollingId, setTaskPollingId] = useState<string | null>(null);
  const [taskStatusResult, setTaskStatusResult] = useState<AppeearsTaskStatusResponse | null>(null);
  const [taskStatusError, setTaskStatusError] = useState<string | null>(null);

  const [trackedTasks, setTrackedTasks] = useState<TrackedExtractionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [extractionProfiles, setExtractionProfiles] = useState<ExtractionConnectorBlueprint[]>([]);
  const [previewGeoTiff, setPreviewGeoTiff] = useState<{
    taskId: string;
    file: AppeearsBundleFile;
    product: string;
    resolution: string;
  } | null>(null);

  const selectedSpec =
    INTEGRATION_SPECS.find((s) => s.id === selectedConnectorId) ?? INTEGRATION_SPECS[0];

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const geometryGate = useMemo(
    () => hasValidRealGeometry(activeProperty),
    [activeProperty]
  );

  const loadRuntimeStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const [st, tasks, profiles] = await Promise.all([
        nasaClient.getStatus(),
        nasaClient.getAppeearsTasks().catch(() => [] as TrackedExtractionTask[]),
        nasaClient.getExtractionProfiles().catch(() => [] as ExtractionConnectorBlueprint[]),
      ]);
      setRuntimeStatus(st);
      setTrackedTasks(tasks);
      setExtractionProfiles(profiles);
      if (tasks.length > 0) {
        setSelectedTaskId((prev) => prev ?? tasks[0].taskId);
      }
    } catch (err) {
      setStatusError(
        err instanceof NasaApiError
          ? err.message
          : 'Não foi possível verificar o status do backend NASA.'
      );
    }
  }, []);

  const loadObservations = useCallback(async () => {
    setObsLoading(true);
    setObsError(null);
    try {
      const res = await nasaClient.getObservations({
        propertyId: scopeAllProperties ? undefined : activeProperty?.id,
        lat: !scopeAllProperties ? activeProperty?.centroid.lat : undefined,
        lon: !scopeAllProperties ? activeProperty?.centroid.lon : undefined,
        startDate,
        endDate,
        sensor: sensorFilter,
      });
      setObsData(res);
    } catch (err) {
      setObsError(
        err instanceof NasaApiError
          ? err.message
          : 'Não foi possível carregar as observações orbitais extraídas.'
      );
    } finally {
      setObsLoading(false);
    }
  }, [activeProperty?.id, activeProperty?.centroid.lat, activeProperty?.centroid.lon, endDate, scopeAllProperties, sensorFilter, startDate]);

  useEffect(() => {
    loadRuntimeStatus();
  }, [loadRuntimeStatus]);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  useEffect(() => {
    setCmrResult(null);
    setCmrError(null);
    setAppeearsResponse(null);
    setTaskStatusResult(null);
    setTaskStatusError(null);
  }, [activeProperty?.id]);

  const handleApplyPresetDays = (days: number) => {
    const anchor = '2026-11-14';
    setEndDate(anchor);
    setStartDate(addDaysIso(anchor, -days));
  };

  const handleSearchCmr = async () => {
    if (!activeProperty || !geometryGate.valid) return;
    setCmrLoading(true);
    setCmrError(null);
    try {
      const res = await nasaClient.searchCmrGranules({
        property: activeProperty,
        startDate,
        endDate,
        pageSize: 4,
      });
      setCmrResult(res);
    } catch (err) {
      setCmrResult(null);
      setCmrError(
        err instanceof NasaApiError
          ? err.message
          : 'Erro ao consultar o catálogo NASA Earthdata CMR.'
      );
    } finally {
      setCmrLoading(false);
    }
  };

  const handleVerifyAppeearsAuth = async () => {
    setAppeearsAuthLoading(true);
    try {
      const res = await nasaClient.verifyAppeearsAuth();
      setAppeearsAuthResult(res);
    } catch (err) {
      setAppeearsAuthResult({
        authenticated: false,
        httpStatus: 500,
        authMethod: 'not_configured',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível verificar a autenticação AppEEARS no servidor.',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setAppeearsAuthLoading(false);
    }
  };

  const handleSubmitExtraction = async (params: {
    key: string;
    profileKey?: ExtractionProfileKey;
    product: string;
    layers: string[];
    layerSpecs?: AppeearsLayerSpec[];
    customStartIso?: string;
    customEndIso?: string;
  }) => {
    if (!activeProperty || !geometryGate.valid) return;
    setAppeearsLoadingKey(params.key);
    setAppeearsResponse(null);
    setTaskStatusResult(null);
    setTaskStatusError(null);
    try {
      const res = await nasaClient.requestAppeearsExtraction({
        property: activeProperty,
        profileKey: params.profileKey,
        product: params.product,
        layers: params.layers,
        layerSpecs: params.layerSpecs,
        startDate: isoToAppeearsDate(params.customStartIso || startDate),
        endDate: isoToAppeearsDate(params.customEndIso || endDate),
      });
      setAppeearsResponse(res);
      if (res.task) {
        setTrackedTasks((prev) => {
          const exists = prev.some((t) => t.taskId === res.task!.taskId);
          return exists
            ? prev.map((t) => (t.taskId === res.task!.taskId ? res.task! : t))
            : [res.task!, ...prev];
        });
        setSelectedTaskId(res.task.taskId);
      }
      await loadObservations();
    } catch (err) {
      setAppeearsResponse({
        status: 'error',
        connector: params.product,
        message: err instanceof Error ? err.message : 'Falha na requisição AppEEARS.',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setAppeearsLoadingKey(null);
    }
  };

  const handleRefreshTaskStatus = async (taskId: string) => {
    setTaskPollingId(taskId);
    setTaskStatusError(null);
    setSelectedTaskId(taskId);
    try {
      const st = await nasaClient.getAppeearsTaskStatus(taskId);
      setTaskStatusResult(st);
      if (st.task) {
        setTrackedTasks((prev) => prev.map((t) => (t.taskId === taskId ? st.task! : t)));
      } else {
        setTrackedTasks((prev) =>
          prev.map((t) =>
            t.taskId === taskId
              ? {
                  ...t,
                  taskStatus: st.taskStatus,
                  updatedAt: st.updatedAt ?? t.updatedAt,
                  lastCheckedAt: st.checkedAt,
                  progressPercent: st.progressPercent ?? t.progressPercent,
                  errorMessage: st.errorMessage ?? null,
                  bundleFiles: st.bundleFiles ?? t.bundleFiles,
                }
              : t
          )
        );
      }
      if (st.taskStatus === 'done') {
        await Promise.all([loadObservations(), loadRuntimeStatus()]);
      }
    } catch (err) {
      setTaskStatusError(
        err instanceof NasaApiError
          ? err.message
          : 'Erro ao consultar o processamento da tarefa no AppEEARS.'
      );
    } finally {
      setTaskPollingId(null);
    }
  };

  const observations = useMemo(() => obsData?.observations || [], [obsData]);

  const ndviObs = useMemo(
    () => observations.filter((o) => o.sensorKey === 'ndvi'),
    [observations]
  );
  const eviObs = useMemo(
    () => observations.filter((o) => o.sensorKey === 'evi'),
    [observations]
  );
  const smapSurfaceObs = useMemo(
    () =>
      observations.filter(
        (o) => o.sensorKey === 'soil_moisture' && !o.dataset.toLowerCase().includes('rootzone')
      ),
    [observations]
  );
  const smapRootObs = useMemo(
    () =>
      observations.filter(
        (o) => o.sensorKey === 'soil_moisture' && o.dataset.toLowerCase().includes('rootzone')
      ),
    [observations]
  );
  const lstObs = useMemo(
    () => observations.filter((o) => o.sensorKey === 'lst'),
    [observations]
  );

  const openObservationGeoTiff = (pt: OrbitalObservationPoint) => {
    if (!pt.geotiffFileId) return;
    setSelectedTaskId(pt.taskId);
    setPreviewGeoTiff({
      taskId: pt.taskId,
      file: {
        fileId: pt.geotiffFileId,
        fileName: pt.geotiffFileName || pt.fileName,
        fileType: 'tif',
        fileSizeBytes: 0,
      },
      product: pt.product,
      resolution: pt.spatialResolution,
    });
  };

  const propertyTasks = useMemo(() => {
    if (scopeAllProperties || !activeProperty) return trackedTasks;
    return trackedTasks.filter((t) => {
      if (t.propertyId === activeProperty.id) return true;
      if (!t.propertyId && t.bbox.length === 4) {
        const [w, s, e, n] = t.bbox;
        const tol = 0.01;
        return (
          activeProperty.centroid.lon >= w - tol &&
          activeProperty.centroid.lon <= e + tol &&
          activeProperty.centroid.lat >= s - tol &&
          activeProperty.centroid.lat <= n + tol
        );
      }
      return false;
    });
  }, [trackedTasks, scopeAllProperties, activeProperty]);

  const getRuntimeBadge = (specId: ConnectorId) => {
    const matching = runtimeStatus?.sources.find((s) =>
      specId === 'nasa_power'
        ? s.id === 'nasa_power'
        : specId === 'nasa_earthdata'
        ? s.id === 'hls_modis'
        : specId === 'gpm_imerg'
        ? s.id === 'gpm_imerg'
        : specId === 'smap'
        ? s.id === 'smap'
        : specId === 'ecostress'
        ? s.id === 'ecostress'
        : false
    );
    if (matching?.operationalLevel === 'live_data') {
      return { text: 'Conectada (API ao vivo)', tone: 'text-agro-700' };
    }
    if (matching?.operationalLevel === 'live_catalog_metadata') {
      return { text: 'CMR ao vivo', tone: 'text-agro-700' };
    }
    if (matching?.credentialsConfigured) {
      return { text: 'Autenticação pronta', tone: 'text-amber-700' };
    }
    return { text: 'Arquitetura preparada', tone: 'text-slate-600' };
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Satélites e Monitoramento Orbital NASA
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Integrações reais com NASA HLS L30/S30 (NDVI e EVI), MODIS, SMAP SPL4SMGP (Umidade do
            Solo) e ECOSTRESS ECO_L2T_LSTE V002 (Temperatura de Superfície), com séries temporais
            e rasters GeoTIFF por propriedade e período.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={obsLoading}
            onClick={() => {
              loadObservations();
              loadRuntimeStatus();
            }}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar dados
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSqlBlueprint((v) => !v)}
            icon={<Code2 className="w-4 h-4" />}
          >
            {showSqlBlueprint ? 'Ocultar DDL PostgreSQL' : 'Ver DDL PostgreSQL'}
          </Button>
        </div>
      </div>

      {/* Barra de Filtros: Propriedade, Período e Sensor */}
      <DataCard
        title="Filtros do Monitoramento Orbital"
        subtitle="Filtre observações reais, séries temporais, catálogo CMR e novas extrações por propriedade, janela de datas e sensor"
        action={<Filter className="w-4 h-4 text-slate-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
          <div className="md:col-span-4 space-y-1">
            <label htmlFor="sat-prop-filter" className="font-medium text-slate-700 block">
              Propriedade rural
            </label>
            <div className="flex items-center gap-2">
              {workspace.properties.length > 0 && activeProperty ? (
                <select
                  id="sat-prop-filter"
                  value={scopeAllProperties ? '__all__' : activeProperty.id}
                  onChange={(e) => {
                    if (e.target.value === '__all__') {
                      setScopeAllProperties(true);
                    } else {
                      setScopeAllProperties(false);
                      onSelectProperty?.(e.target.value);
                    }
                  }}
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-navy-900"
                >
                  {workspace.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.municipality}/{p.state})
                    </option>
                  ))}
                  <option value="__all__">Todas as propriedades com extração NASA</option>
                </select>
              ) : (
                <span className="text-slate-500">Nenhuma propriedade cadastrada</span>
              )}
            </div>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="sat-start-date" className="font-medium text-slate-700 block">
              Data inicial
            </label>
            <input
              id="sat-start-date"
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-navy-900 font-mono"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="sat-end-date" className="font-medium text-slate-700 block">
              Data final
            </label>
            <input
              id="sat-end-date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-navy-900 font-mono"
            />
          </div>

          <div className="md:col-span-4 space-y-1">
            <label htmlFor="sat-sensor-filter" className="font-medium text-slate-700 block">
              Sensor / Variável
            </label>
            <select
              id="sat-sensor-filter"
              value={sensorFilter}
              onChange={(e) =>
                setSensorFilter(e.target.value as OrbitalSensorCategory | 'all')
              }
              className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-navy-900"
            >
              <option value="all">Todos os sensores (NDVI, EVI, SMAP, LST)</option>
              <option value="ndvi">NDVI — NASA HLS L30/S30 & MODIS</option>
              <option value="evi">EVI — NASA HLS L30/S30 & MODIS</option>
              <option value="soil_moisture">Umidade do Solo — NASA SMAP SPL4SMGP</option>
              <option value="lst">Temperatura de Superfície — ECOSTRESS L2T LSTE</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-slate-500 mr-1">
              <Calendar className="w-3.5 h-3.5" /> Atalhos de período:
            </span>
            {[
              { label: '15 dias', days: 14 },
              { label: '30 dias', days: 30 },
              { label: '45 dias', days: 45 },
              { label: '60 dias', days: 60 },
            ].map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => handleApplyPresetDays(preset.days)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <span className="font-mono text-[11px] text-slate-500">
            {observations.length} observação(ões) real(is) no recorte · {propertyTasks.length}{' '}
            tarefa(s) rastreada(s)
          </span>
        </div>
      </DataCard>

      {statusError && <ErrorBanner message={statusError} onRetry={loadRuntimeStatus} />}
      {obsError && <ErrorBanner message={obsError} onRetry={loadObservations} />}

      {/* Painel das 4 Integrações Orbitais Reais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ORBITAL_INTEGRATIONS.map((cfg) => {
          const matchingObs = observations.filter((o) => o.sensorKey === cfg.id);
          const latest = matchingObs[matchingObs.length - 1];
          const matchingTasks = propertyTasks.filter((t) => {
            if (cfg.id === 'ndvi') return t.profileKey === 'hls_ndvi' || t.profileKey === 'modis_ndvi';
            if (cfg.id === 'evi') return t.profileKey === 'hls_evi' || t.profileKey === 'modis_evi';
            if (cfg.id === 'soil_moisture')
              return t.profileKey === 'smap_spl4smgp' || t.profileKey === 'smap_moisture';
            return t.profileKey === 'ecostress_lst';
          });
          const pendingTask = matchingTasks.find(
            (t) => t.taskStatus !== 'done' && t.taskStatus !== 'error'
          );
          const doneTask = matchingTasks.find((t) => t.taskStatus === 'done');

          return (
            <div
              key={cfg.id}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {cfg.icon}
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{cfg.title}</p>
                      <p className="text-[11px] text-slate-500">{cfg.sensorLabel}</p>
                    </div>
                  </div>
                  {matchingObs.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-agro-700 whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Dados reais ({matchingObs.length})
                    </span>
                  ) : pendingTask ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5" /> Fila NASA ({pendingTask.taskStatus})
                    </span>
                  ) : doneTask ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                      Sem cenas na janela
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 whitespace-nowrap">
                      Aguardando extração
                    </span>
                  )}
                </div>

                <p className="font-mono text-[11px] text-slate-500">
                  Produto: {cfg.product} · {cfg.resolution}
                </p>

                {latest ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-xs space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-600">Última média observada:</span>
                      <span className="font-mono font-bold text-navy-900 text-sm">
                        {latest.mean} {latest.unit}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono">
                      Data:{' '}
                      {latest.observedAt.includes('T')
                        ? formatDateTimeBr(latest.observedAt)
                        : formatDateBr(latest.date)}{' '}
                      · Fonte: {latest.sourceLabel}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">
                    {pendingTask
                      ? `Tarefa ${pendingTask.taskId.slice(0, 8)}… em processamento na NASA (${pendingTask.taskStatus}).`
                      : 'Nenhuma extração concluída para este sensor nesta propriedade/período.'}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                {pendingTask ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={taskPollingId === pendingTask.taskId}
                    onClick={() => handleRefreshTaskStatus(pendingTask.taskId)}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Consultar andamento ({pendingTask.taskStatus})
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={appeearsLoadingKey === cfg.id}
                    disabled={!geometryGate.valid || scopeAllProperties}
                    onClick={() => {
                      const smapStart =
                        cfg.id === 'soil_moisture' ? addDaysIso(endDate, -6) : startDate;
                      handleSubmitExtraction({
                        key: cfg.id,
                        profileKey: cfg.profileKey,
                        product: cfg.product,
                        layers: cfg.layers,
                        layerSpecs: cfg.layerSpecs,
                        customStartIso: smapStart > startDate ? smapStart : startDate,
                        customEndIso: endDate,
                      });
                    }}
                    icon={<Play className="w-3.5 h-3.5" />}
                  >
                    Extrair {cfg.id === 'soil_moisture' ? 'SMAP (7d)' : cfg.id.toUpperCase()} real
                  </Button>
                )}

                {cfg.alternateProduct && cfg.alternateLayers && !pendingTask && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={appeearsLoadingKey === `${cfg.id}_alt`}
                    disabled={!geometryGate.valid || scopeAllProperties}
                    onClick={() =>
                      handleSubmitExtraction({
                        key: `${cfg.id}_alt`,
                        profileKey: cfg.alternateProfileKey,
                        product: cfg.alternateProduct!,
                        layers: cfg.alternateLayers!,
                      })
                    }
                  >
                    {cfg.alternateLabel}
                  </Button>
                )}

                {latest?.geotiffFileId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openObservationGeoTiff(latest)}
                    icon={<Eye className="w-3.5 h-3.5" />}
                  >
                    Raster GeoTIFF
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráficos Reais de Séries Temporais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(sensorFilter === 'all' || sensorFilter === 'ndvi') && (
          <OrbitalTimeSeriesChart
            title="Série Temporal NDVI (Vigor Vegetativo)"
            subtitle="Fonte: NASA HLS L30/S30 (HLSS30_VI / HLSL30_VI · 30 m) e MODIS (MOD13Q1 · 250 m)"
            unit="NDVI"
            series={[
              {
                label: 'NDVI Médio',
                color: '#15803d',
                points: ndviObs,
              },
            ]}
            emptyMessage="Nenhuma observação NDVI real concluída neste filtro de propriedade/período."
            onInspectGeoTiff={openObservationGeoTiff}
          />
        )}

        {(sensorFilter === 'all' || sensorFilter === 'evi') && (
          <OrbitalTimeSeriesChart
            title="Série Temporal EVI (Biomassa Realçada)"
            subtitle="Fonte: NASA HLS L30/S30 (30 m) e MODIS MOD13Q1 (250 m) via AppEEARS"
            unit="EVI"
            series={[
              {
                label: 'EVI Médio',
                color: '#0d9488',
                points: eviObs,
              },
            ]}
            emptyMessage="Nenhuma observação EVI real concluída neste filtro de propriedade/período."
            onInspectGeoTiff={openObservationGeoTiff}
          />
        )}

        {(sensorFilter === 'all' || sensorFilter === 'soil_moisture') && (
          <OrbitalTimeSeriesChart
            title="Série Temporal Umidade do Solo (SMAP SPL4SMGP)"
            subtitle="Fonte: NASA SMAP L4 (SPL4SMGP.008 · 9 km · 3h) — Camada Superficial (0–5 cm) e Radicular (0–100 cm)"
            unit="m³/m³"
            series={[
              {
                label: 'Superficial (0–5 cm)',
                color: '#0284c7',
                points: smapSurfaceObs,
              },
              {
                label: 'Zona Radicular (0–100 cm)',
                color: '#1d4ed8',
                points: smapRootObs,
              },
            ]}
            emptyMessage="Nenhuma observação SMAP SPL4SMGP.008 real concluída neste filtro."
            onInspectGeoTiff={openObservationGeoTiff}
          />
        )}

        {(sensorFilter === 'all' || sensorFilter === 'lst') && (
          <OrbitalTimeSeriesChart
            title="Série Temporal Temperatura de Superfície (ECOSTRESS LST)"
            subtitle="Fonte: NASA ECOSTRESS ISS (ECO_L2T_LSTE.002 · 70 m) — Convertida de Kelvin para °C"
            unit="°C"
            series={[
              {
                label: 'LST (°C)',
                color: '#dc2626',
                points: lstObs,
              },
            ]}
            emptyMessage="Nenhuma observação ECOSTRESS ECO_L2T_LSTE V002 real concluída neste filtro."
            onInspectGeoTiff={openObservationGeoTiff}
          />
        )}
      </div>

      {/* Tabela Real de Observações Orbitais Extraídas */}
      <DataCard
        title="Observações Orbitais Reais Extraídas (AppEEARS Statistics + GeoTIFF)"
        subtitle={`Exibindo ${observations.length} observação(ões) reais com data/hora de aquisição e identificação oficial da fonte NASA`}
      >
        {observations.length === 0 ? (
          <EmptyState
            title="Sem observações concluídas para o filtro atual"
            description="Verifique se a tarefa AppEEARS desta propriedade já atingiu status 'done' abaixo ou ajuste o período/propriedade."
          />
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-medium">Data da observação</th>
                  <th className="py-2.5 px-3 font-medium">Sensor / Variável</th>
                  <th className="py-2.5 px-3 font-medium">Fonte oficial NASA</th>
                  <th className="py-2.5 px-3 font-medium">Propriedade</th>
                  <th className="py-2.5 px-3 font-medium text-right">Média</th>
                  <th className="py-2.5 px-3 font-medium text-right">Mín – Máx</th>
                  <th className="py-2.5 px-3 font-medium text-right">Pixels</th>
                  <th className="py-2.5 px-3 font-medium text-right">GeoTIFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...observations].reverse().slice(0, 40).map((pt, idx) => (
                  <tr key={`${pt.taskId}-${pt.observedAt}-${pt.dataset}-${idx}`} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 font-mono text-navy-900 whitespace-nowrap">
                      {pt.observedAt.includes('T')
                        ? formatDateTimeBr(pt.observedAt)
                        : formatDateBr(pt.date)}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-navy-900">
                      {pt.dataset} ({pt.unit})
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      {pt.sourceLabel} · <span className="font-mono text-[11px]">{pt.spatialResolution}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{pt.propertyName}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-agro-700">
                      {pt.mean !== null ? `${pt.mean} ${pt.unit}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      {pt.min !== null && pt.max !== null ? `${pt.min} – ${pt.max}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      {pt.pixelCount}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {pt.geotiffFileId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openObservationGeoTiff(pt)}
                          icon={<Eye className="w-3 h-3" />}
                        >
                          Raster
                        </Button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      {/* Matriz de Disponibilidade Real do Backend */}
      {runtimeStatus && (
        <DataCard
          title="Diagnóstico real das integrações no servidor"
          subtitle={`Verificado em ${formatDateTimeBr(runtimeStatus.checkedAt)} · Nenhuma credencial é exposta ao navegador`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runtimeStatus.sources.map((src) => {
              const isLive = src.operationalLevel === 'live_data';
              const isCatalog = src.operationalLevel === 'live_catalog_metadata';
              return (
                <div
                  key={src.id}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-navy-900">{src.name}</p>
                    {isLive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-agro-700 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conectada
                      </span>
                    ) : isCatalog ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-agro-700 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Catálogo ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 whitespace-nowrap">
                        <Lock className="w-3.5 h-3.5" /> Requer login EDL
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-slate-500">
                    {src.spatialResolution} · {src.temporalResolution}
                  </p>
                  <p className="text-slate-600 leading-relaxed">{src.limitations}</p>
                </div>
              );
            })}
          </div>
        </DataCard>
      )}

      {/* Acompanhamento Persistente de Tarefas AppEEARS & Visualização GeoTIFF */}
      <DataCard
        title="Acompanhamento de Tarefas AppEEARS e Visualização GeoTIFF"
        subtitle="Consulte tarefas salvas pelo taskId sem reenvio duplicado; visualize e baixe GeoTIFFs reais quando o status atingir done"
        action={
          selectedTaskId ? (
            <Button
              variant="outline"
              size="sm"
              loading={taskPollingId === selectedTaskId}
              onClick={() => handleRefreshTaskStatus(selectedTaskId)}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Atualizar tarefa selecionada
            </Button>
          ) : undefined
        }
      >
        {trackedTasks.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa AppEEARS salva"
            description="Submeta uma extração espacial acima para iniciar o rastreamento."
          />
        ) : (
          <div className="space-y-4">
            {taskStatusError && <ErrorBanner message={taskStatusError} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-5 space-y-2.5">
                {trackedTasks.map((task) => {
                  const isSelected = task.taskId === selectedTaskId;
                  const isDone = task.taskStatus === 'done';
                  const isErr = task.taskStatus === 'error';
                  return (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(task.taskId);
                        setPreviewGeoTiff(null);
                      }}
                      className={`w-full text-left rounded-xl border p-3.5 space-y-1.5 text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-agro-700 bg-emerald-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-navy-900">
                          {task.product} · {task.layers.join(', ')}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                            isDone
                              ? 'text-agro-700'
                              : isErr
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          {task.taskStatus}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500 truncate">
                        Task ID: {task.taskId}
                      </p>
                      <p className="text-slate-700">
                        {task.propertyName} ({task.locationLabel}) · {task.spatialResolution}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        Janela: {task.dateWindow.startDate} → {task.dateWindow.endDate} · Consulta:{' '}
                        {formatDateTimeBr(task.lastCheckedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-7 space-y-4">
                {(() => {
                  const selectedTask =
                    trackedTasks.find((t) => t.taskId === selectedTaskId) ?? trackedTasks[0];
                  if (!selectedTask) return null;
                  const isFinished =
                    selectedTask.taskStatus === 'done' || selectedTask.taskStatus === 'error';

                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-xs">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-navy-900">
                            {selectedTask.product} — {selectedTask.layers.join(', ')}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            Task ID salvo: {selectedTask.taskId}
                          </p>
                        </div>
                        <Button
                          variant={isFinished ? 'outline' : 'primary'}
                          size="sm"
                          loading={taskPollingId === selectedTask.taskId}
                          onClick={() => handleRefreshTaskStatus(selectedTask.taskId)}
                          icon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          {selectedTask.taskStatus === 'done'
                            ? 'Recarregar bundle'
                            : 'Consultar processamento (sem reenviar)'}
                        </Button>
                      </div>

                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <dt className="text-slate-500">Status na fila AppEEARS</dt>
                          <dd className="font-semibold text-navy-900 mt-0.5">
                            {selectedTask.taskStatus}
                            {typeof selectedTask.progressPercent === 'number'
                              ? ` (${selectedTask.progressPercent}%)`
                              : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Resolução espacial e temporal</dt>
                          <dd className="font-mono text-navy-900 mt-0.5">
                            {selectedTask.spatialResolution} · {selectedTask.temporalResolution}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Localização e área do polígono</dt>
                          <dd className="text-slate-800 mt-0.5">
                            {selectedTask.propertyName} ({selectedTask.locationLabel}) ·{' '}
                            {formatArea(selectedTask.areaHa, workspace.preferences.areaUnit)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Centróide e BBox WGS84</dt>
                          <dd className="font-mono text-[11px] text-slate-700 mt-0.5">
                            {selectedTask.centroid.lat.toFixed(4)},{' '}
                            {selectedTask.centroid.lon.toFixed(4)} · [
                            {selectedTask.bbox.map((n) => n.toFixed(3)).join(', ')}]
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Data da consulta / criação</dt>
                          <dd className="font-mono text-slate-800 mt-0.5">
                            {formatDateTimeBr(selectedTask.createdAt)} (janela:{' '}
                            {selectedTask.dateWindow.startDate} a {selectedTask.dateWindow.endDate})
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Última verificação / atualização NASA</dt>
                          <dd className="font-mono text-slate-800 mt-0.5">
                            {formatDateTimeBr(selectedTask.lastCheckedAt)}
                            {selectedTask.updatedAt
                              ? ` (NASA: ${formatDateTimeBr(selectedTask.updatedAt)})`
                              : ''}
                          </dd>
                        </div>
                      </dl>

                      {selectedTask.errorMessage && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                          Erro reportado pelo AppEEARS: {selectedTask.errorMessage}
                        </div>
                      )}

                      {selectedTask.taskStatus !== 'done' && !selectedTask.errorMessage && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-slate-700">
                          A tarefa permanece em <strong>{selectedTask.taskStatus}</strong> no servidor
                          da NASA. Clique em <strong>Consultar processamento</strong> para atualizar o
                          andamento pelo mesmo <code>taskId</code> sem criar tarefas duplicadas.
                        </div>
                      )}

                      {selectedTask.taskStatus === 'done' && (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100">
                          <p className="font-semibold text-navy-900">
                            Arquivos reais do bundle ({selectedTask.bundleFiles?.length ?? 0})
                          </p>

                          {!selectedTask.bundleFiles || selectedTask.bundleFiles.length === 0 ? (
                            <p className="text-slate-600">
                              Clique em <strong>Recarregar bundle</strong> para listar os arquivos
                              gerados pela NASA para este taskId.
                            </p>
                          ) : (
                            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-slate-50/40 max-h-72 overflow-y-auto">
                              {selectedTask.bundleFiles.map((file) => {
                                const isTif =
                                  file.fileType.toLowerCase() === 'tif' ||
                                  file.fileName.toLowerCase().endsWith('.tif');
                                const fileLabel = file.fileName.split('/').pop() || file.fileName;
                                return (
                                  <li
                                    key={file.fileId}
                                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-mono text-[11px] font-medium text-navy-900 truncate">
                                        {fileLabel}
                                      </p>
                                      <p className="text-[11px] text-slate-500 font-mono">
                                        {file.fileType.toUpperCase()} ·{' '}
                                        {(file.fileSizeBytes / 1024).toFixed(1)} KB
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {isTif && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            setPreviewGeoTiff({
                                              taskId: selectedTask.taskId,
                                              file,
                                              product: selectedTask.product,
                                              resolution: selectedTask.spatialResolution,
                                            })
                                          }
                                          icon={<Eye className="w-3.5 h-3.5" />}
                                        >
                                          Visualizar GeoTIFF
                                        </Button>
                                      )}
                                      <a
                                        href={`/api/nasa/appeears/bundle/${encodeURIComponent(
                                          selectedTask.taskId
                                        )}/file/${encodeURIComponent(file.fileId)}?download=1`}
                                        download={fileLabel}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-agro-700 hover:bg-slate-50"
                                      >
                                        <Download className="w-3 h-3" /> Baixar
                                      </a>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {previewGeoTiff && (
                  <GeoTiffViewer
                    taskId={previewGeoTiff.taskId}
                    file={previewGeoTiff.file}
                    product={previewGeoTiff.product}
                    resolution={previewGeoTiff.resolution}
                    onClose={() => setPreviewGeoTiff(null)}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </DataCard>

      {/* Estrutura de Extração Espacial: Status real por perfil */}
      {extractionProfiles.length > 0 && (
        <DataCard
          title="Perfis de Extração Espacial NASA AppEEARS"
          subtitle="Conectores validados em execução real vs. estruturas preparadas"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {extractionProfiles.map((prof) => {
              const tested = prof.validationStatus === 'real_tested';
              return (
                <div
                  key={prof.key}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-navy-900">{prof.label}</p>
                    <span
                      className={`font-medium whitespace-nowrap text-[11px] ${
                        tested ? 'text-agro-700' : 'text-amber-700'
                      }`}
                    >
                      {tested ? 'Testado em execução real' : 'Estrutura preparada'}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-500">
                    {prof.product} · {prof.layers.join(', ')}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {prof.spatialResolution} · {prof.temporalResolution} · Unidade: {prof.unit}
                  </p>
                  <p className="text-slate-600 leading-relaxed">{prof.statusNote}</p>
                </div>
              );
            })}
          </div>
        </DataCard>
      )}

      {/* Bloqueio geográfico ou busca real no catálogo NASA Earthdata CMR */}
      <DataCard
        title="Descoberta real de cenas e grânulos orbitais (NASA Earthdata CMR)"
        subtitle={
          activeProperty && geometryGate.valid
            ? `Propriedade: ${activeProperty.name} (${formatArea(
                geometryGate.areaHa ?? 0,
                workspace.preferences.areaUnit
              )}) · Janela: ${formatDateBr(startDate)} a ${formatDateBr(endDate)}`
            : 'Requer polígono real válido para consultar o catálogo espacial da NASA'
        }
        action={
          <Button
            variant="primary"
            size="sm"
            loading={cmrLoading}
            disabled={!geometryGate.valid}
            onClick={handleSearchCmr}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Consultar cenas reais no período
          </Button>
        }
      >
        {!activeProperty ? (
          <EmptyState
            title="Nenhuma propriedade selecionada"
            description="Cadastre uma propriedade com perímetro válido para consultar cenas NASA."
          />
        ) : !geometryGate.valid ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-slate-800 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-navy-900">Consulta geográfica bloqueada</p>
              <p className="text-slate-700 mt-0.5">{geometryGate.reason}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cmrError && <ErrorBanner message={cmrError} onRetry={handleSearchCmr} />}

            {!cmrResult && !cmrLoading && (
              <p className="text-xs text-slate-600">
                Clique em <strong>Consultar cenas reais no período</strong> para pesquisar no
                Common Metadata Repository (CMR) da NASA as passagens de{' '}
                <strong>HLS L30/S30 (NDVI/EVI)</strong>, <strong>MODIS (MOD13Q1)</strong>,{' '}
                <strong>GPM IMERG</strong>, <strong>SMAP (SPL4SMGP)</strong> e{' '}
                <strong>ECOSTRESS (ECO_L2T_LSTE V002)</strong> sobre o polígono real de{' '}
                <strong>{activeProperty.name}</strong> entre {formatDateBr(startDate)} e{' '}
                {formatDateBr(endDate)}.
              </p>
            )}

            {cmrResult && (
              <div className="space-y-4">
                <p className="text-xs font-mono text-slate-500">
                  Janela consultada: {cmrResult.temporalRange} · Atualizado em{' '}
                  {formatDateTimeBr(cmrResult.fetchedAt)}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cmrResult.products.map((prod) => (
                    <div
                      key={prod.key}
                      className="rounded-lg border border-slate-200 p-4 space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-navy-900">{prod.label}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {prod.shortNames.join(' / ')} · {prod.spatialResolution}
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-agro-700 whitespace-nowrap">
                          {prod.totalHits} cenas
                        </span>
                      </div>

                      {prod.error ? (
                        <p className="text-rose-700">{prod.error}</p>
                      ) : prod.granules.length === 0 ? (
                        <p className="text-slate-500">
                          Nenhuma cena encontrada para o polígono no período selecionado.
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                          {prod.granules.map((g) => (
                            <li key={g.id} className="p-2 space-y-0.5">
                              <p className="font-mono text-[11px] font-medium text-navy-900 truncate">
                                {g.producerGranuleId}
                              </p>
                              <p className="text-[11px] text-slate-600 font-mono">
                                Aquisição: {formatDateTimeBr(g.timeStart)}
                                {g.cloudCover !== null ? ` · Nuvens: ${g.cloudCover}%` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="text-[11px] text-slate-500">{prod.authRequirement}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DataCard>

      {/* Especificações técnicas e teste seguro AppEEARS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-2.5">
          {INTEGRATION_SPECS.map((spec) => {
            const active = spec.id === selectedSpec.id;
            const badge = getRuntimeBadge(spec.id);
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => {
                  setSelectedConnectorId(spec.id);
                  setAppeearsResponse(null);
                  setTaskStatusResult(null);
                  setTaskStatusError(null);
                }}
                className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-50/50 border-agro-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900 font-display">
                      {spec.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{spec.category}</p>
                  </div>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${badge.tone}`}>
                    {badge.text}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-2 font-mono tabular-nums">
                  {spec.spatialResolution} · {spec.temporalResolution}
                </p>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-7 space-y-6">
          <DataCard
            title={selectedSpec.name}
            subtitle={selectedSpec.provider}
            action={
              selectedSpec.id === 'postgresql' ? (
                <Database className="w-5 h-5 text-navy-800" />
              ) : (
                <Satellite className="w-5 h-5 text-agro-700" />
              )
            }
          >
            <div className="space-y-5 text-sm">
              <p className="text-slate-700 leading-relaxed">{selectedSpec.purposeInAgrolynx}</p>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <dt className="text-slate-500">API / Endpoint oficial</dt>
                  <dd className="font-mono text-navy-900 mt-1 break-all">
                    {selectedSpec.expectedEndpoint}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Autenticação e segurança</dt>
                  <dd className="text-slate-800 mt-1">{selectedSpec.authRequirement}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Resolução espacial</dt>
                  <dd className="font-mono text-slate-800 mt-1">{selectedSpec.spatialResolution}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Formato oficial</dt>
                  <dd className="font-mono text-slate-800 mt-1">{selectedSpec.expectedFormat}</dd>
                </div>
              </dl>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h3 className="text-xs font-semibold text-navy-900">Variáveis mapeadas</h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3 font-medium">Variável</th>
                        <th className="py-2 px-3 font-medium">Descrição</th>
                        <th className="py-2 px-3 font-medium text-right">Unidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSpec.targetVariables.map((v) => (
                        <tr key={v.code}>
                          <td className="py-2 px-3 font-mono font-semibold text-navy-900">
                            {v.code}
                          </td>
                          <td className="py-2 px-3 text-slate-700">{v.label}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-500">
                            {v.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(selectedSpec.id === 'nasa_earthdata' ||
                selectedSpec.id === 'smap' ||
                selectedSpec.id === 'ecostress') && (
                <div className="pt-2 space-y-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={appeearsAuthLoading}
                      onClick={handleVerifyAppeearsAuth}
                      icon={<KeyRound className="w-3.5 h-3.5" />}
                    >
                      Verificar autenticação AppEEARS
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={appeearsLoadingKey === 'spec_btn'}
                      disabled={!geometryGate.valid}
                      onClick={() => {
                        if (selectedSpec.id === 'smap') {
                          handleSubmitExtraction({
                            key: 'spec_btn',
                            profileKey: 'smap_spl4smgp',
                            product: 'SPL4SMGP.008',
                            layers: [
                              'Geophysical_Data_sm_surface',
                              'Geophysical_Data_sm_rootzone',
                            ],
                            customStartIso: addDaysIso(endDate, -6),
                            customEndIso: endDate,
                          });
                        } else if (selectedSpec.id === 'ecostress') {
                          handleSubmitExtraction({
                            key: 'spec_btn',
                            profileKey: 'ecostress_lst',
                            product: 'ECO_L2T_LSTE.002',
                            layers: ['LST', 'cloud'],
                          });
                        } else {
                          handleSubmitExtraction({
                            key: 'spec_btn',
                            profileKey: 'hls_ndvi',
                            product: 'HLSS30_VI.020',
                            layers: ['NDVI'],
                            layerSpecs: [
                              { product: 'HLSS30_VI.020', layer: 'NDVI' },
                              { product: 'HLSL30_VI.020', layer: 'NDVI' },
                            ],
                          });
                        }
                      }}
                      icon={<Play className="w-3.5 h-3.5" />}
                    >
                      Solicitar extração AppEEARS (server-side)
                    </Button>
                  </div>

                  {appeearsAuthResult && (
                    <div
                      role="status"
                      className={`rounded-lg border px-3.5 py-2.5 text-xs space-y-1 ${
                        appeearsAuthResult.authenticated
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-amber-200 bg-amber-50 text-slate-800'
                      }`}
                    >
                      <p className="font-semibold">
                        Autenticação AppEEARS:{' '}
                        {appeearsAuthResult.authenticated ? 'Aprovada' : 'Reprovada'} (HTTP{' '}
                        {appeearsAuthResult.httpStatus} · método: {appeearsAuthResult.authMethod})
                      </p>
                      <p>{appeearsAuthResult.message}</p>
                      {appeearsAuthResult.tokenExpiresAt && (
                        <p className="font-mono text-[11px] text-emerald-800">
                          Sessão válida até: {formatDateTimeBr(appeearsAuthResult.tokenExpiresAt)}
                        </p>
                      )}
                      {appeearsAuthResult.requiredEnvVars && (
                        <p className="font-mono text-[11px] text-slate-600">
                          Variáveis server-side necessárias:{' '}
                          {appeearsAuthResult.requiredEnvVars.join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  {appeearsResponse && (
                    <div
                      role="status"
                      className={`rounded-lg border px-3.5 py-2.5 text-xs space-y-1.5 ${
                        appeearsResponse.status === 'submitted'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-amber-200 bg-amber-50 text-slate-800'
                      }`}
                    >
                      <p className="font-semibold">
                        Submissão ({appeearsResponse.connector}): {appeearsResponse.status}
                        {appeearsResponse.upstreamHttpStatus
                          ? ` (HTTP ${appeearsResponse.upstreamHttpStatus})`
                          : ''}
                      </p>
                      <p>{appeearsResponse.message}</p>
                      {appeearsResponse.taskId && (
                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[11px]">
                            Task ID: {appeearsResponse.taskId}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            loading={taskPollingId === appeearsResponse.taskId}
                            onClick={() => handleRefreshTaskStatus(appeearsResponse.taskId!)}
                            icon={<RefreshCw className="w-3.5 h-3.5" />}
                          >
                            Consultar processamento / bundle
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {taskStatusResult && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs space-y-2">
                      <p className="font-semibold text-navy-900">
                        Processamento AppEEARS: {taskStatusResult.taskStatus} (HTTP{' '}
                        {taskStatusResult.upstreamHttpStatus})
                        {typeof taskStatusResult.progressPercent === 'number'
                          ? ` · ${taskStatusResult.progressPercent}%`
                          : ''}
                      </p>
                      {taskStatusResult.errorMessage && (
                        <p className="text-rose-700">{taskStatusResult.errorMessage}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DataCard>

          {showSqlBlueprint && (
            <DataCard
              title="Esquema SQL de Referência (PostgreSQL + PostGIS)"
              subtitle="Estrutura prevista para migração futura de persistência relacional"
            >
              <pre className="text-xs font-mono bg-navy-950 text-slate-100 p-4 rounded-lg overflow-x-auto leading-relaxed">
                {POSTGRES_BLUEPRINT_SQL}
              </pre>
            </DataCard>
          )}
        </div>
      </div>
    </div>
  );
};
