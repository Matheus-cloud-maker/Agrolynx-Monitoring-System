import type { Property } from '../types/agrolynx';
import type {
  AppeearsAuthVerifyResponse,
  AppeearsExtractionResponse,
  AppeearsLayerSpec,
  AppeearsTaskStatusResponse,
  CmrCatalogResponse,
  CmrProductKey,
  ExtractionConnectorBlueprint,
  ExtractionProfileKey,
  NasaIntegrationRuntimeStatus,
  NasaPowerSeriesResponse,
  OrbitalObservationsQueryResponse,
  OrbitalSensorCategory,
  TaskTimeSeriesResponse,
  TrackedExtractionTask,
} from '../types/nasa';
import { hasValidRealGeometry } from '../utils/geospatial';

export class NasaApiError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'NasaApiError';
    this.statusCode = statusCode;
  }
}

export const nasaClient = {
  async getStatus(): Promise<NasaIntegrationRuntimeStatus> {
    const resp = await fetch('/api/nasa/status', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new NasaApiError(`Falha ao verificar status das APIs NASA (HTTP ${resp.status}).`, resp.status);
    }
    return (await resp.json()) as NasaIntegrationRuntimeStatus;
  },

  async getExtractionProfiles(): Promise<ExtractionConnectorBlueprint[]> {
    const resp = await fetch('/api/nasa/extraction-profiles', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new NasaApiError(`Falha ao carregar perfis de extração (HTTP ${resp.status}).`, resp.status);
    }
    const json = (await resp.json()) as { profiles: ExtractionConnectorBlueprint[] };
    return json.profiles || [];
  },

  async getAppeearsTasks(): Promise<TrackedExtractionTask[]> {
    const resp = await fetch('/api/nasa/appeears/tasks', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new NasaApiError(`Falha ao carregar tarefas AppEEARS salvas (HTTP ${resp.status}).`, resp.status);
    }
    const json = (await resp.json()) as { tasks: TrackedExtractionTask[] };
    return json.tasks || [];
  },

  async verifyAppeearsAuth(): Promise<AppeearsAuthVerifyResponse> {
    const resp = await fetch('/api/nasa/appeears/verify-auth', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    });
    return (await resp.json()) as AppeearsAuthVerifyResponse;
  },

  async getAppeearsTaskStatus(taskId: string): Promise<AppeearsTaskStatusResponse> {
    const resp = await fetch(`/api/nasa/appeears/task/${encodeURIComponent(taskId)}`, {
      signal: AbortSignal.timeout(15000),
    });
    const json = (await resp.json().catch(() => ({}))) as AppeearsTaskStatusResponse & {
      error?: string;
    };
    if (!resp.ok) {
      throw new NasaApiError(
        json.error || `Falha ao consultar tarefa AppEEARS (HTTP ${resp.status}).`,
        resp.status
      );
    }
    return json;
  },

  async getTaskTimeSeries(taskId: string): Promise<TaskTimeSeriesResponse> {
    const resp = await fetch(`/api/nasa/appeears/task/${encodeURIComponent(taskId)}/timeseries`, {
      signal: AbortSignal.timeout(25000),
    });
    const json = (await resp.json().catch(() => ({}))) as TaskTimeSeriesResponse & {
      error?: string;
    };
    if (!resp.ok) {
      throw new NasaApiError(
        json.error || `Falha ao extrair série temporal do bundle (HTTP ${resp.status}).`,
        resp.status
      );
    }
    return json;
  },

  async getObservations(params?: {
    propertyId?: string;
    startDate?: string;
    endDate?: string;
    sensor?: OrbitalSensorCategory | 'all';
    lat?: number;
    lon?: number;
  }): Promise<OrbitalObservationsQueryResponse> {
    const qs = new URLSearchParams();
    if (params?.propertyId) qs.set('propertyId', params.propertyId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.sensor) qs.set('sensor', params.sensor);
    if (typeof params?.lat === 'number' && Number.isFinite(params.lat)) {
      qs.set('lat', String(params.lat));
    }
    if (typeof params?.lon === 'number' && Number.isFinite(params.lon)) {
      qs.set('lon', String(params.lon));
    }
    const queryStr = qs.toString();
    const url = queryStr ? `/api/nasa/observations?${queryStr}` : '/api/nasa/observations';
    const resp = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const json = (await resp.json().catch(() => ({}))) as OrbitalObservationsQueryResponse & {
      error?: string;
    };
    if (!resp.ok) {
      throw new NasaApiError(
        json.error || `Erro ao consultar observações orbitais (HTTP ${resp.status}).`,
        resp.status
      );
    }
    return json;
  },

  async fetchNasaPowerSeries(params: {
    property: Property;
    startDate: string;
    endDate: string;
  }): Promise<NasaPowerSeriesResponse> {
    const check = hasValidRealGeometry(params.property);
    if (!check.valid) {
      throw new NasaApiError(check.reason || 'Geometria da propriedade inválida.');
    }

    const resp = await fetch('/api/nasa/power', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: params.property.boundaryPolygon,
        boundarySource: params.property.boundarySource,
        startDate: params.startDate,
        endDate: params.endDate,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const json = (await resp.json().catch(() => ({}))) as NasaPowerSeriesResponse & {
      error?: string;
    };
    if (!resp.ok) {
      throw new NasaApiError(
        json.error || `Erro ao consultar NASA POWER (HTTP ${resp.status}).`,
        resp.status
      );
    }
    return json;
  },

  async searchCmrGranules(params: {
    property: Property;
    productKeys?: CmrProductKey[];
    daysBack?: number;
    startDate?: string;
    endDate?: string;
    pageSize?: number;
  }): Promise<CmrCatalogResponse> {
    const check = hasValidRealGeometry(params.property);
    if (!check.valid) {
      throw new NasaApiError(check.reason || 'Geometria da propriedade inválida.');
    }

    const resp = await fetch('/api/nasa/cmr/granules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: params.property.boundaryPolygon,
        boundarySource: params.property.boundarySource,
        productKeys: params.productKeys,
        daysBack: params.daysBack,
        startDate: params.startDate,
        endDate: params.endDate,
        pageSize: params.pageSize,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const json = (await resp.json().catch(() => ({}))) as CmrCatalogResponse & {
      error?: string;
    };
    if (!resp.ok) {
      throw new NasaApiError(
        json.error || `Erro ao consultar catálogo NASA CMR (HTTP ${resp.status}).`,
        resp.status
      );
    }
    return json;
  },

  async requestAppeearsExtraction(params: {
    property: Property;
    profileKey?: ExtractionProfileKey;
    product: string;
    layers: string[];
    layerSpecs?: AppeearsLayerSpec[];
    startDate: string;
    endDate: string;
  }): Promise<AppeearsExtractionResponse> {
    const check = hasValidRealGeometry(params.property);
    if (!check.valid) {
      throw new NasaApiError(check.reason || 'Geometria da propriedade inválida.');
    }

    const resp = await fetch('/api/nasa/appeears/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: params.property.boundaryPolygon,
        boundarySource: params.property.boundarySource,
        propertyId: params.property.id,
        propertyName: params.property.name,
        locationLabel: `${params.property.municipality} / ${params.property.state}`,
        profileKey: params.profileKey,
        product: params.product,
        layers: params.layers,
        layerSpecs: params.layerSpecs,
        startDate: params.startDate,
        endDate: params.endDate,
      }),
      signal: AbortSignal.timeout(20000),
    });

    return (await resp.json()) as AppeearsExtractionResponse;
  },
};
