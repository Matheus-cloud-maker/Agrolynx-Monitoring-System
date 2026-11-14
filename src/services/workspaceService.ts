import type {
  AgrolynxWorkspaceData,
  AlertRule,
  AlertStatus,
  CropCycle,
  FieldObservation,
  FieldPlot,
  GeoPoint,
  IrrigationEvent,
  IrrigationSector,
  OperationalAlert,
  OperationStatus,
  PlannedOperation,
  PlatformPreferences,
  Property,
  SoilSample,
} from '../types/agrolynx';
import { DEMO_WORKSPACE_SEED } from '../data/demoSeed';
import { buildReferencePolygonFromArea } from '../utils/validation';
import { calculatePolygonAreaHa } from '../utils/geospatial';

const WORKSPACE_KEY_PREFIX = 'agrolynx_v1_workspace_';

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const EMPTY_WORKSPACE: AgrolynxWorkspaceData = {
  properties: [],
  plots: [],
  crops: [],
  soilSamples: [],
  irrigationSectors: [],
  irrigationEvents: [],
  observations: [],
  alertRules: [],
  alerts: [],
  operations: [],
  preferences: {
    areaUnit: 'ha',
    temperatureUnit: 'C',
    timezone: 'America/Sao_Paulo',
    showDemoData: false,
    enableHighContrastTables: false,
  },
};

function getStorageKey(userId: string) {
  return `${WORKSPACE_KEY_PREFIX}${userId}`;
}

function canCallBackendApi(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

async function syncWorkspaceToServer(userId: string, data: AgrolynxWorkspaceData): Promise<void> {
  if (!canCallBackendApi()) return;
  const resp = await fetch(`/api/workspace/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: data }),
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) {
    const errJson = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new RepositoryError(
      errJson.error || `Falha ao persistir alterações no servidor (HTTP ${resp.status}).`
    );
  }
}

export interface PropertyDetailsUpdateInput {
  name: string;
  municipality: string;
  state: string;
  biome: string;
  carCode?: string;
  totalAreaHa: number;
}

export const workspaceService = {
  async loadWorkspace(userId: string, includeDemoOnFirstVisit = true): Promise<AgrolynxWorkspaceData> {
    await delay(140);
    try {
      const localRaw = localStorage.getItem(getStorageKey(userId));

      if (canCallBackendApi()) {
        try {
          const resp = await fetch(`/api/workspace/${encodeURIComponent(userId)}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok) {
            const json = (await resp.json()) as {
              exists?: boolean;
              workspace?: AgrolynxWorkspaceData;
            };
            if (json.exists && json.workspace) {
              const normalized: AgrolynxWorkspaceData = {
                ...EMPTY_WORKSPACE,
                ...json.workspace,
                preferences: {
                  ...EMPTY_WORKSPACE.preferences,
                  ...(json.workspace.preferences ?? {}),
                },
              };
              localStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
              return normalized;
            }
          } else if (resp.status === 404) {
            const initial: AgrolynxWorkspaceData = localRaw
              ? {
                  ...EMPTY_WORKSPACE,
                  ...(JSON.parse(localRaw) as AgrolynxWorkspaceData),
                  preferences: {
                    ...EMPTY_WORKSPACE.preferences,
                    ...((JSON.parse(localRaw) as AgrolynxWorkspaceData).preferences ?? {}),
                  },
                }
              : includeDemoOnFirstVisit
              ? structuredClone(DEMO_WORKSPACE_SEED)
              : structuredClone(EMPTY_WORKSPACE);

            localStorage.setItem(getStorageKey(userId), JSON.stringify(initial));
            await syncWorkspaceToServer(userId, initial).catch(() => {});
            return initial;
          }
        } catch {
          // Fallback para cache local quando servidor não estiver acessível
        }
      }

      if (!localRaw) {
        const initial = includeDemoOnFirstVisit
          ? structuredClone(DEMO_WORKSPACE_SEED)
          : structuredClone(EMPTY_WORKSPACE);
        localStorage.setItem(getStorageKey(userId), JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(localRaw) as AgrolynxWorkspaceData;
      return {
        ...EMPTY_WORKSPACE,
        ...parsed,
        preferences: {
          ...EMPTY_WORKSPACE.preferences,
          ...(parsed.preferences ?? {}),
        },
      };
    } catch {
      throw new RepositoryError('Não foi possível ler o armazenamento da área de trabalho.');
    }
  },

  async saveWorkspace(userId: string, data: AgrolynxWorkspaceData): Promise<AgrolynxWorkspaceData> {
    await delay(80);
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
    } catch {
      throw new RepositoryError('Falha ao gravar alterações no armazenamento local.');
    }

    if (canCallBackendApi()) {
      await syncWorkspaceToServer(userId, data);
    }
    return data;
  },

  async resetToDemoSeed(userId: string): Promise<AgrolynxWorkspaceData> {
    await delay(140);
    const seed = structuredClone(DEMO_WORKSPACE_SEED);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(seed));
    if (canCallBackendApi()) {
      await syncWorkspaceToServer(userId, seed).catch(() => {});
    }
    return seed;
  },

  async clearAllData(userId: string): Promise<AgrolynxWorkspaceData> {
    await delay(140);
    const clean = structuredClone(EMPTY_WORKSPACE);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(clean));
    if (canCallBackendApi()) {
      await syncWorkspaceToServer(userId, clean).catch(() => {});
    }
    return clean;
  },

  addProperty(
    data: AgrolynxWorkspaceData,
    input: Omit<Property, 'id' | 'createdAt' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const areaCalc = input.boundaryPolygon
      ? calculatePolygonAreaHa(input.boundaryPolygon)
      : null;
    const newProp: Property = {
      ...input,
      calculatedAreaHa: areaCalc?.valid && areaCalc.areaHa !== null ? areaCalc.areaHa : undefined,
      id: `prop-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isDemo: false,
    };
    return {
      ...data,
      properties: [newProp, ...data.properties],
    };
  },

  updatePropertyBoundary(
    data: AgrolynxWorkspaceData,
    propertyId: string,
    boundaryPolygon: GeoPoint[],
    boundarySource: Property['boundarySource']
  ): AgrolynxWorkspaceData {
    const areaCalc = calculatePolygonAreaHa(boundaryPolygon);
    if (!areaCalc.valid || areaCalc.areaHa === null) {
      throw new RepositoryError(areaCalc.error || 'Polígono da propriedade inválido.');
    }
    return {
      ...data,
      properties: data.properties.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              boundaryPolygon,
              boundarySource,
              calculatedAreaHa: areaCalc.areaHa ?? undefined,
            }
          : p
      ),
    };
  },

  updatePropertyDetails(
    data: AgrolynxWorkspaceData,
    propertyId: string,
    updates: {
      name: string;
      municipality: string;
      state: string;
      biome: string;
      carCode?: string;
      totalAreaHa: number;
    }
  ): AgrolynxWorkspaceData {
    const target = data.properties.find((p) => p.id === propertyId);
    if (!target) {
      throw new RepositoryError('Propriedade não encontrada para edição.');
    }

    const cleanName = updates.name.trim();
    const cleanMun = updates.municipality.trim();
    const cleanState = updates.state.trim().toUpperCase();
    const cleanBiome = updates.biome.trim();
    const cleanCar = updates.carCode?.trim();

    if (cleanName.length < 3) {
      throw new RepositoryError('O nome da propriedade deve ter pelo menos 3 caracteres.');
    }
    if (cleanMun.length < 2) {
      throw new RepositoryError('Informe o município da propriedade.');
    }
    if (!/^[A-Z]{2}$/.test(cleanState)) {
      throw new RepositoryError('Informe uma UF válida com 2 letras (ex.: RJ, MT, GO).');
    }
    if (cleanBiome.length < 2) {
      throw new RepositoryError('Informe o bioma predominante da propriedade.');
    }
    if (!Number.isFinite(updates.totalAreaHa) || updates.totalAreaHa <= 0) {
      throw new RepositoryError('A área manual declarada deve ser um número maior que zero.');
    }

    const normalizedArea = Number(updates.totalAreaHa.toFixed(4));

    return {
      ...data,
      properties: data.properties.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              name: cleanName,
              municipality: cleanMun,
              state: cleanState,
              biome: cleanBiome,
              carCode: cleanCar ? cleanCar : undefined,
              totalAreaHa: normalizedArea,
            }
          : p
      ),
    };
  },

  deleteProperty(data: AgrolynxWorkspaceData, propertyId: string): AgrolynxWorkspaceData {
    return {
      ...data,
      properties: data.properties.filter((p) => p.id !== propertyId),
      plots: data.plots.filter((pl) => pl.propertyId !== propertyId),
      crops: data.crops.filter((c) => c.propertyId !== propertyId),
      soilSamples: data.soilSamples.filter((s) => s.propertyId !== propertyId),
      irrigationSectors: data.irrigationSectors.filter((s) => s.propertyId !== propertyId),
      irrigationEvents: data.irrigationEvents.filter((e) => e.propertyId !== propertyId),
      observations: data.observations.filter((o) => o.propertyId !== propertyId),
      alertRules: data.alertRules.filter((r) => r.propertyId !== propertyId),
      alerts: data.alerts.filter((a) => a.propertyId !== propertyId),
      operations: data.operations.filter((op) => op.propertyId !== propertyId),
    };
  },

  addPlot(
    data: AgrolynxWorkspaceData,
    input: Omit<FieldPlot, 'id' | 'polygon' | 'isDemo'> & { polygon?: GeoPoint[] }
  ): AgrolynxWorkspaceData {
    const hasCustomPolygon = Boolean(input.polygon && input.polygon.length >= 3);
    const polygon = hasCustomPolygon
      ? input.polygon!
      : buildReferencePolygonFromArea(input.centroid, input.areaHa);
    const polygonSource: FieldPlot['polygonSource'] = hasCustomPolygon
      ? 'usuario_geo'
      : 'estimado_area';
    const areaCalc = calculatePolygonAreaHa(polygon);
    const newPlot: FieldPlot = {
      ...input,
      id: `plot-${Date.now()}`,
      polygon,
      polygonSource,
      calculatedAreaHa: areaCalc.valid && areaCalc.areaHa !== null ? areaCalc.areaHa : undefined,
      isDemo: false,
    };
    return {
      ...data,
      plots: [newPlot, ...data.plots],
    };
  },

  updatePlotPolygon(
    data: AgrolynxWorkspaceData,
    plotId: string,
    polygon: GeoPoint[],
    polygonSource: FieldPlot['polygonSource'] = 'usuario_geo'
  ): AgrolynxWorkspaceData {
    const areaCalc = calculatePolygonAreaHa(polygon);
    if (!areaCalc.valid || areaCalc.areaHa === null) {
      throw new RepositoryError(areaCalc.error || 'Polígono do talhão inválido.');
    }
    return {
      ...data,
      plots: data.plots.map((pl) =>
        pl.id === plotId
          ? {
              ...pl,
              polygon,
              polygonSource,
              calculatedAreaHa: areaCalc.areaHa ?? undefined,
            }
          : pl
      ),
    };
  },

  addCrop(
    data: AgrolynxWorkspaceData,
    input: Omit<CropCycle, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const newCrop: CropCycle = {
      ...input,
      id: `crop-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      crops: [newCrop, ...data.crops],
    };
  },

  addSoilSample(
    data: AgrolynxWorkspaceData,
    input: Omit<SoilSample, 'id' | 'isDemo' | 'source'>
  ): AgrolynxWorkspaceData {
    const sample: SoilSample = {
      ...input,
      id: `soil-${Date.now()}`,
      source: 'laboratorio_usuario',
      isDemo: false,
    };
    return {
      ...data,
      soilSamples: [sample, ...data.soilSamples],
    };
  },

  addIrrigationSector(
    data: AgrolynxWorkspaceData,
    input: Omit<IrrigationSector, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const sector: IrrigationSector = {
      ...input,
      id: `irr-sec-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      irrigationSectors: [sector, ...data.irrigationSectors],
    };
  },

  addIrrigationEvent(
    data: AgrolynxWorkspaceData,
    input: Omit<IrrigationEvent, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const evt: IrrigationEvent = {
      ...input,
      id: `irr-evt-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      irrigationEvents: [evt, ...data.irrigationEvents],
    };
  },

  addObservation(
    data: AgrolynxWorkspaceData,
    input: Omit<FieldObservation, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const obs: FieldObservation = {
      ...input,
      id: `obs-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      observations: [obs, ...data.observations],
    };
  },

  addAlertRule(
    data: AgrolynxWorkspaceData,
    input: Omit<AlertRule, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const rule: AlertRule = {
      ...input,
      id: `rule-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      alertRules: [rule, ...data.alertRules],
    };
  },

  toggleAlertRule(data: AgrolynxWorkspaceData, ruleId: string): AgrolynxWorkspaceData {
    return {
      ...data,
      alertRules: data.alertRules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    };
  },

  updateAlertStatus(
    data: AgrolynxWorkspaceData,
    alertId: string,
    status: AlertStatus
  ): AgrolynxWorkspaceData {
    return {
      ...data,
      alerts: data.alerts.map((a) => (a.id === alertId ? { ...a, status } : a)),
    };
  },

  addAlert(
    data: AgrolynxWorkspaceData,
    input: Omit<OperationalAlert, 'id' | 'createdAt' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const item: OperationalAlert = {
      ...input,
      id: `alert-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isDemo: false,
    };
    return {
      ...data,
      alerts: [item, ...data.alerts],
    };
  },

  addOperation(
    data: AgrolynxWorkspaceData,
    input: Omit<PlannedOperation, 'id' | 'isDemo'>
  ): AgrolynxWorkspaceData {
    const op: PlannedOperation = {
      ...input,
      id: `op-${Date.now()}`,
      isDemo: false,
    };
    return {
      ...data,
      operations: [op, ...data.operations],
    };
  },

  updateOperationStatus(
    data: AgrolynxWorkspaceData,
    operationId: string,
    status: OperationStatus
  ): AgrolynxWorkspaceData {
    return {
      ...data,
      operations: data.operations.map((op) =>
        op.id === operationId ? { ...op, status } : op
      ),
    };
  },

  updatePreferences(
    data: AgrolynxWorkspaceData,
    prefs: Partial<PlatformPreferences>
  ): AgrolynxWorkspaceData {
    return {
      ...data,
      preferences: { ...data.preferences, ...prefs },
    };
  },
};
