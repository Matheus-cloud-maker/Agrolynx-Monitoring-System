import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  getPolygonBoundingBox,
  getPolygonCentroid,
  hasValidRealGeometry,
  validatePolygonGeometry,
} from './src/utils/geospatial.ts';
import {
  EXTRACTION_PROFILES,
  EXTRACTION_PROFILE_LIST,
  resolveProfileKey,
} from './src/services/contracts/extractionProfiles.ts';
import type { GeoPoint, AgrolynxWorkspaceData } from './src/types/agrolynx.ts';
import type {
  AppeearsAuthVerifyResponse,
  AppeearsBundleFile,
  AppeearsExtractionResponse,
  AppeearsLayerSpec,
  AppeearsTaskStatusResponse,
  CmrCatalogResponse,
  CmrGranuleItem,
  CmrProductCatalogResult,
  CmrProductKey,
  ExtractionProfileKey,
  NasaIntegrationRuntimeStatus,
  NasaPowerDailyPoint,
  NasaPowerSeriesResponse,
  OrbitalObservationPoint,
  OrbitalObservationsQueryResponse,
  OrbitalSensorCategory,
  TaskTimeSeriesResponse,
  TrackedExtractionTask,
} from './src/types/nasa.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.agrolynx-data');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspaces.json');
const APPEEARS_TASKS_FILE = path.join(DATA_DIR, 'appeears-tasks.json');
const BUNDLE_CACHE_DIR = path.join(DATA_DIR, 'bundle-cache');

interface WorkspaceStoreFile {
  workspaces: Record<string, AgrolynxWorkspaceData>;
  updatedAt: string;
}

interface AppeearsTaskStoreFile {
  tasks: TrackedExtractionTask[];
  updatedAt: string;
}

async function readWorkspaceStore(): Promise<WorkspaceStoreFile> {
  try {
    const raw = await fs.readFile(WORKSPACE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as WorkspaceStoreFile;
    if (parsed && typeof parsed === 'object' && parsed.workspaces) {
      return parsed;
    }
  } catch {
    // Arquivo ainda não criado ou ilegível
  }
  return { workspaces: {}, updatedAt: new Date().toISOString() };
}

async function writeWorkspaceStore(store: WorkspaceStoreFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${WORKSPACE_FILE}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(tempPath, WORKSPACE_FILE);
}

function buildExtractionSignature(params: {
  polygon: GeoPoint[];
  product: string;
  layers: string[];
  layerSpecs?: AppeearsLayerSpec[];
  startDate: string;
  endDate: string;
}): string {
  const polyKey = params.polygon
    .map((p) => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`)
    .join(';');
  const uniqueProducts = new Set((params.layerSpecs || []).map((s) => s.product));
  const layersKey =
    params.layerSpecs && uniqueProducts.size > 1
      ? [...params.layerSpecs].map((s) => `${s.product}:${s.layer}`).sort().join(',')
      : [...params.layers].sort().join(',');
  return `${params.product}|${layersKey}|${params.startDate}|${params.endDate}|${polyKey}`;
}

const INITIAL_REAL_MODIS_NDVI_POLYGON: GeoPoint[] = [
  { lat: -12.528, lon: -55.738 },
  { lat: -12.528, lon: -55.7 },
  { lat: -12.561, lon: -55.701 },
  { lat: -12.56, lon: -55.738 },
];

function createSeededModisTask(): TrackedExtractionTask {
  const layers = ['_250m_16_days_NDVI'];
  const startDate = '10-01-2026';
  const endDate = '11-10-2026';
  const centroid = getPolygonCentroid(INITIAL_REAL_MODIS_NDVI_POLYGON);
  const geom = hasValidRealGeometry({
    boundaryPolygon: INITIAL_REAL_MODIS_NDVI_POLYGON,
    boundarySource: 'usuario_geo',
  });
  return {
    taskId: '02e692b0-1b94-4b6b-ab38-1131b303468f',
    profileKey: 'modis_ndvi',
    product: 'MOD13Q1.061',
    layers,
    spatialResolution: EXTRACTION_PROFILES.modis_ndvi.spatialResolution,
    temporalResolution: EXTRACTION_PROFILES.modis_ndvi.temporalResolution,
    propertyName: 'Fazenda Sol Nascente (Polígono Sorriso/MT)',
    locationLabel: 'Sorriso / MT',
    centroid,
    areaHa: geom.areaHa ?? 1456.4,
    bbox: getPolygonBoundingBox(INITIAL_REAL_MODIS_NDVI_POLYGON),
    polygon: INITIAL_REAL_MODIS_NDVI_POLYGON,
    dateWindow: { startDate, endDate },
    signature: buildExtractionSignature({
      polygon: INITIAL_REAL_MODIS_NDVI_POLYGON,
      product: 'MOD13Q1.061',
      layers,
      startDate,
      endDate,
    }),
    taskStatus: 'queued',
    createdAt: '2026-11-14T14:54:23.620Z',
    updatedAt: '2026-11-14T14:54:43.108Z',
    lastCheckedAt: '2026-11-14T14:55:24.230Z',
    errorMessage: null,
  };
}

async function readAppeearsTaskStore(): Promise<AppeearsTaskStoreFile> {
  let store: AppeearsTaskStoreFile = { tasks: [], updatedAt: new Date().toISOString() };
  try {
    const raw = await fs.readFile(APPEEARS_TASKS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppeearsTaskStoreFile;
    if (parsed && Array.isArray(parsed.tasks)) {
      store = parsed;
    }
  } catch {
    // Arquivo ainda não criado
  }

  const seededId = '02e692b0-1b94-4b6b-ab38-1131b303468f';
  if (!store.tasks.some((t) => t.taskId === seededId)) {
    store.tasks.unshift(createSeededModisTask());
    await writeAppeearsTaskStore(store);
  }
  return store;
}

async function writeAppeearsTaskStore(store: AppeearsTaskStoreFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${APPEEARS_TASKS_FILE}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(tempPath, APPEEARS_TASKS_FILE);
}

const APPEEARS_BASE_URL = 'https://appeears.earthdatacloud.nasa.gov/api';
const APPEEARS_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutos antes de expirar
const APPEEARS_DEFAULT_TTL_MS = 47 * 60 * 60 * 1000; // fallback seguro < 48h

interface AppeearsSession {
  token: string;
  expiresAtMs: number;
  expiresAtIso: string;
  method: 'basic_login' | 'appeears_token';
}

type AppeearsLoginResult =
  | { ok: true; httpStatus: number; session: AppeearsSession }
  | { ok: false; httpStatus: number; message: string };

let cachedAppeearsSession: AppeearsSession | null = null;
let pendingAppeearsLogin: Promise<AppeearsLoginResult> | null = null;

function hasAppeearsBasicCredentials(): boolean {
  return Boolean(
    process.env.EARTHDATA_USERNAME?.trim() && process.env.EARTHDATA_PASSWORD?.trim()
  );
}

function hasPreissuedAppeearsToken(): boolean {
  return Boolean(process.env.APPEEARS_TOKEN?.trim());
}

function hasOnlyGeneralEdlToken(): boolean {
  return (
    !hasAppeearsBasicCredentials() &&
    !hasPreissuedAppeearsToken() &&
    Boolean(process.env.EARTHDATA_TOKEN?.trim())
  );
}

function isAppeearsAuthConfigured(): boolean {
  return hasAppeearsBasicCredentials() || hasPreissuedAppeearsToken();
}

function isGpmEarthdataConfigured(): boolean {
  return Boolean(process.env.EARTHDATA_TOKEN?.trim() || hasAppeearsBasicCredentials());
}

function sanitizeUpstreamMessage(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

async function authenticateAppeearsViaBasic(
  forceRefresh = false
): Promise<AppeearsLoginResult> {
  if (
    !forceRefresh &&
    cachedAppeearsSession &&
    cachedAppeearsSession.method === 'basic_login' &&
    cachedAppeearsSession.expiresAtMs - Date.now() > APPEEARS_REFRESH_BUFFER_MS
  ) {
    return { ok: true, httpStatus: 200, session: cachedAppeearsSession };
  }

  if (pendingAppeearsLogin) {
    return pendingAppeearsLogin;
  }

  const username = process.env.EARTHDATA_USERNAME?.trim() || '';
  const password = process.env.EARTHDATA_PASSWORD?.trim() || '';
  if (!username || !password) {
    return {
      ok: false,
      httpStatus: 503,
      message: 'Variáveis EARTHDATA_USERNAME e EARTHDATA_PASSWORD não configuradas no servidor.',
    };
  }

  pendingAppeearsLogin = (async (): Promise<AppeearsLoginResult> => {
    try {
      const encoded = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
      const resp = await fetch(`${APPEEARS_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encoded}`,
          'Content-Length': '0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!resp.ok) {
        cachedAppeearsSession = null;
        const rawErr = await resp.text().catch(() => '');
        const cleanErr = sanitizeUpstreamMessage(rawErr);
        return {
          ok: false,
          httpStatus: resp.status,
          message:
            resp.status === 401 || resp.status === 403
              ? `NASA AppEEARS /api/login rejeitou as credenciais configuradas (HTTP ${resp.status}).${cleanErr ? ` Detalhe: ${cleanErr}` : ''}`
              : `Falha ao autenticar no NASA AppEEARS /api/login (HTTP ${resp.status}).${cleanErr ? ` ${cleanErr}` : ''}`,
        };
      }

      const data = (await resp.json().catch(() => ({}))) as {
        token?: string;
        token_type?: string;
        expiration?: string;
      };

      if (!data.token || typeof data.token !== 'string') {
        cachedAppeearsSession = null;
        return {
          ok: false,
          httpStatus: 502,
          message: 'NASA AppEEARS /api/login respondeu sem campo token válido.',
        };
      }

      const parsedExp = data.expiration ? Date.parse(data.expiration) : NaN;
      const expiresAtMs =
        Number.isFinite(parsedExp) && parsedExp > Date.now()
          ? parsedExp
          : Date.now() + APPEEARS_DEFAULT_TTL_MS;

      const session: AppeearsSession = {
        token: data.token,
        expiresAtMs,
        expiresAtIso: new Date(expiresAtMs).toISOString(),
        method: 'basic_login',
      };
      cachedAppeearsSession = session;
      return { ok: true, httpStatus: resp.status, session };
    } catch (err) {
      cachedAppeearsSession = null;
      return {
        ok: false,
        httpStatus: 504,
        message:
          err instanceof Error
            ? `Erro de rede/timeout ao autenticar em AppEEARS /api/login: ${err.message}`
            : 'Erro desconhecido ao autenticar em AppEEARS /api/login.',
      };
    } finally {
      pendingAppeearsLogin = null;
    }
  })();

  return pendingAppeearsLogin;
}

async function getAppeearsSession(forceRefresh = false): Promise<AppeearsLoginResult> {
  if (hasAppeearsBasicCredentials()) {
    return authenticateAppeearsViaBasic(forceRefresh);
  }
  const preissued = process.env.APPEEARS_TOKEN?.trim();
  if (preissued) {
    const expiresAtMs = Date.now() + APPEEARS_DEFAULT_TTL_MS;
    const session: AppeearsSession = {
      token: preissued,
      expiresAtMs,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      method: 'appeears_token',
    };
    return { ok: true, httpStatus: 200, session };
  }
  return {
    ok: false,
    httpStatus: 503,
    message: 'Autenticação AppEEARS não configurada no servidor.',
  };
}

async function appeearsAuthorizedFetch(
  apiPath: string,
  init: RequestInit = {}
): Promise<
  | { ok: true; response: Response; session: AppeearsSession; renewed: boolean }
  | { ok: false; httpStatus: number; message: string }
> {
  const initialLogin = await getAppeearsSession(false);
  if (!initialLogin.ok) {
    return { ok: false, httpStatus: initialLogin.httpStatus, message: initialLogin.message };
  }

  let currentSession = initialLogin.session;
  let renewed = false;

  const execRequest = (token: string) =>
    fetch(`${APPEEARS_BASE_URL}${apiPath}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: init.signal ?? AbortSignal.timeout(20000),
    });

  let resp = await execRequest(currentSession.token);

  if ((resp.status === 401 || resp.status === 403) && hasAppeearsBasicCredentials()) {
    cachedAppeearsSession = null;
    const refreshed = await authenticateAppeearsViaBasic(true);
    if (refreshed.ok) {
      currentSession = refreshed.session;
      renewed = true;
      resp = await execRequest(currentSession.token);
    } else {
      return {
        ok: false,
        httpStatus: refreshed.httpStatus,
        message: refreshed.message,
      };
    }
  }

  return { ok: true, response: resp, session: currentSession, renewed };
}

function toAppeearsDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return trimmed;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[2]}-${isoMatch[3]}-${isoMatch[1]}`;
  }
  return null;
}

function formatYmdCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function parseIsoOrCompactDate(value: string): string | null {
  const cleaned = value.trim();
  if (/^\d{8}$/.test(cleaned)) return cleaned;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned.replace(/-/g, '');
  return null;
}

function compactToIsoDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function sanitizePowerNumber(val: unknown, fillValue: number): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (val === fillValue || val <= -990) return null;
  return Number(val.toFixed(2));
}

function meanOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, n) => acc + n, 0);
  return Number((sum / valid.length).toFixed(2));
}

function maxOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Number(Math.max(...valid).toFixed(2));
}

function minOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Number(Math.min(...valid).toFixed(2));
}

function sumOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Number(valid.reduce((acc, n) => acc + n, 0).toFixed(2));
}

const CMR_PRODUCT_DEFINITIONS: Record<
  CmrProductKey,
  {
    label: string;
    shortNames: string[];
    spatialResolution: string;
    temporalResolution: string;
    authRequirement: string;
  }
> = {
  hls_ndvi_evi: {
    label: 'HLS L30/S30 (NDVI / EVI)',
    shortNames: ['HLSS30_VI', 'HLSL30_VI', 'HLSS30', 'HLSL30'],
    spatialResolution: '30 m × 30 m',
    temporalResolution: '2 a 5 dias',
    authRequirement: 'Catálogo CMR público; extração/download via NASA AppEEARS (HLSS30_VI.020 / HLSL30_VI.020).',
  },
  modis_ndvi_evi: {
    label: 'MODIS MOD13Q1 / MYD13Q1 (NDVI / EVI)',
    shortNames: ['MOD13Q1', 'MYD13Q1'],
    spatialResolution: '250 m × 250 m',
    temporalResolution: 'Composto a cada 16 dias',
    authRequirement: 'Catálogo CMR público; extração de série por área via AppEEARS (Earthdata Login).',
  },
  gpm_imerg: {
    label: 'GPM IMERG (Precipitação Orbital)',
    shortNames: ['GPM_3IMERGDL', 'GPM_3IMERGDF'],
    spatialResolution: '0,1° × 0,1° (~10 km)',
    temporalResolution: 'Diária (Late ~14h latência / Final ~3,5 meses)',
    authRequirement: 'Catálogo CMR público; extração NetCDF/OPeNDAP requer GES DISC Earthdata Login.',
  },
  smap_moisture: {
    label: 'SMAP SPL4SMGP / SPL3SMP_E (Umidade do Solo)',
    shortNames: ['SPL4SMGP', 'SPL3SMP_E'],
    spatialResolution: '9 km × 9 km',
    temporalResolution: '3 horas (SPL4SMGP L4) / 1–3 dias (SPL3SMP_E)',
    authRequirement: 'Catálogo CMR público; extração por polígono via AppEEARS (SPL4SMGP.008).',
  },
  ecostress_lst: {
    label: 'ECOSTRESS ECO_L2T_LSTE V002 (Temperatura de Superfície LST)',
    shortNames: ['ECO_L2T_LSTE'],
    spatialResolution: '70 m × 70 m',
    temporalResolution: 'Irregular (órbita ISS, ~1 a 5 dias)',
    authRequirement: 'Catálogo CMR público; extração GeoTIFF/LST via AppEEARS (ECO_L2T_LSTE.002).',
  },
};

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'agrolynx-backend', time: new Date().toISOString() });
  });

  // Persistência permanente de workspaces no servidor
  app.get('/api/workspace/:userId', async (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId || !/^[a-zA-Z0-9_-]{2,80}$/.test(userId)) {
      res.status(400).json({ error: 'Identificador de usuário inválido.' });
      return;
    }
    try {
      const store = await readWorkspaceStore();
      const ws = store.workspaces[userId];
      if (!ws) {
        res.status(404).json({ exists: false });
        return;
      }
      res.json({ exists: true, workspace: ws });
    } catch {
      res.status(500).json({ error: 'Falha ao ler armazenamento persistente no servidor.' });
    }
  });

  app.put('/api/workspace/:userId', async (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId || !/^[a-zA-Z0-9_-]{2,80}$/.test(userId)) {
      res.status(400).json({ error: 'Identificador de usuário inválido.' });
      return;
    }
    const body = req.body as { workspace?: AgrolynxWorkspaceData };
    const ws = body?.workspace;
    if (!ws || !Array.isArray(ws.properties) || !Array.isArray(ws.plots)) {
      res.status(400).json({ error: 'Estrutura de workspace inválida.' });
      return;
    }

    // Validação geométrica server-side para propriedades com perímetro real informado
    for (const prop of ws.properties) {
      if (
        prop.boundaryPolygon &&
        prop.boundaryPolygon.length > 0 &&
        prop.boundarySource !== 'estimado_area'
      ) {
        const check = validatePolygonGeometry(prop.boundaryPolygon);
        if (!check.valid) {
          res.status(400).json({
            error: `Polígono inválido na propriedade "${prop.name}": ${check.error}`,
          });
          return;
        }
      }
    }

    try {
      const store = await readWorkspaceStore();
      store.workspaces[userId] = ws;
      store.updatedAt = new Date().toISOString();
      await writeWorkspaceStore(store);
      res.json({ ok: true, savedAt: store.updatedAt });
    } catch {
      res.status(500).json({ error: 'Falha ao gravar workspace no servidor.' });
    }
  });

  // Status de integrações NASA (nunca expõe segredos ao frontend)
  app.get('/api/nasa/status', (_req, res) => {
    const appeearsReady = isAppeearsAuthConfigured();
    const onlyEdlToken = hasOnlyGeneralEdlToken();
    const gpmReady = isGpmEarthdataConfigured();

    const appeearsMissingMsg = onlyEdlToken
      ? 'EARTHDATA_TOKEN detectado, porém o NASA AppEEARS rejeita token geral EDL (HTTP 403) e exige login HTTP Basic (/api/login) com EARTHDATA_USERNAME e EARTHDATA_PASSWORD (ou APPEEARS_TOKEN dedicado).'
      : 'Catálogo CMR operacional; extração via AppEEARS requer EARTHDATA_USERNAME e EARTHDATA_PASSWORD configurados no servidor.';

    const payload: NasaIntegrationRuntimeStatus = {
      checkedAt: new Date().toISOString(),
      sources: [
        {
          id: 'nasa_power',
          name: 'NASA POWER (Daily Point API)',
          officialApi: 'https://power.larc.nasa.gov/api/temporal/daily/point',
          authRequired: false,
          credentialsConfigured: true,
          operationalLevel: 'live_data',
          spatialResolution: '0,5° × 0,625° (~55 km)',
          temporalResolution: 'Diária (histórico / reanálise com latência ~2–3 dias)',
          limitations:
            'Não é previsão meteorológica; reflete série histórica observacional/reanálise em grade ~55 km.',
        },
        {
          id: 'nasa_earthdata_cmr',
          name: 'NASA Earthdata CMR (Descoberta de Cenas)',
          officialApi: 'https://cmr.earthdata.nasa.gov/search/granules.json',
          authRequired: false,
          credentialsConfigured: true,
          operationalLevel: 'live_catalog_metadata',
          spatialResolution: 'Catálogo multi-sensor (30 m a 10 km)',
          temporalResolution: 'Metadados em tempo real de passagens e grânulos',
          limitations:
            'Retorna inventário real de passagens, datas e cobertura de nuvens; download de pixels exige autenticação específica da API de extração.',
        },
        {
          id: 'hls_modis',
          name: 'HLS L30/S30 (HLSL30_VI/HLSS30_VI) & MODIS (MOD13Q1) — NDVI/EVI',
          officialApi: 'https://appeears.earthdatacloud.nasa.gov/api/task',
          authRequired: true,
          credentialsConfigured: appeearsReady,
          operationalLevel: appeearsReady ? 'live_data' : 'credentials_required',
          spatialResolution: '30 m (HLS L30/S30) · 250 m (MODIS)',
          temporalResolution: '2–5 dias (HLS) · 16 dias (MODIS)',
          limitations: appeearsReady
            ? 'Autenticação AppEEARS configurada no servidor (extração GeoTIFF e estatísticas reais via /api/task).'
            : appeearsMissingMsg,
        },
        {
          id: 'gpm_imerg',
          name: 'GPM IMERG (Precipitação Orbital)',
          officialApi: 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/',
          authRequired: true,
          credentialsConfigured: gpmReady,
          operationalLevel: gpmReady ? 'live_data' : 'credentials_required',
          spatialResolution: '0,1° × 0,1° (~10 km)',
          temporalResolution: '30 min / Diária (Late ~14h; Final ~3,5 meses)',
          limitations: gpmReady
            ? 'Credencial Earthdata configurada para GES DISC (requer aplicativo GES DISC autorizado na conta EDL).'
            : 'Catálogo CMR operacional; download NetCDF/OPeNDAP requer credenciais Earthdata Login autorizadas no GES DISC.',
        },
        {
          id: 'smap',
          name: 'SMAP SPL4SMGP.008 (Umidade do Solo 0–5 cm e 0–100 cm)',
          officialApi: 'https://appeears.earthdatacloud.nasa.gov/api/task',
          authRequired: true,
          credentialsConfigured: appeearsReady,
          operationalLevel: appeearsReady ? 'live_data' : 'credentials_required',
          spatialResolution: '9 km × 9 km',
          temporalResolution: '3 horas (SPL4SMGP L4)',
          limitations: appeearsReady
            ? 'Autenticação AppEEARS configurada no servidor para SPL4SMGP.008.'
            : appeearsMissingMsg,
        },
        {
          id: 'ecostress',
          name: 'ECOSTRESS ECO_L2T_LSTE V002 (Temperatura de Superfície LST)',
          officialApi: 'https://appeears.earthdatacloud.nasa.gov/api/task',
          authRequired: true,
          credentialsConfigured: appeearsReady,
          operationalLevel: appeearsReady ? 'live_data' : 'credentials_required',
          spatialResolution: '70 m × 70 m',
          temporalResolution: 'Irregular (órbita ISS, ~1 a 5 dias)',
          limitations: appeearsReady
            ? 'Autenticação AppEEARS configurada no servidor para ECO_L2T_LSTE.002.'
            : appeearsMissingMsg,
        },
      ],
    };
    res.json(payload);
  });

  // ETAPA 2: Consulta real à API oficial NASA POWER (séries históricas)
  app.post('/api/nasa/power', async (req, res) => {
    const body = req.body as {
      polygon?: GeoPoint[];
      boundarySource?: 'usuario_geo' | 'estimado_area' | 'demo';
      startDate?: string;
      endDate?: string;
    };

    const geomCheck = hasValidRealGeometry({
      boundaryPolygon: body?.polygon,
      boundarySource: body?.boundarySource,
    });
    if (!geomCheck.valid || !geomCheck.centroid || !geomCheck.areaHa) {
      res.status(400).json({
        error:
          geomCheck.reason ||
          'Geometria inválida. É obrigatório possuir um perímetro poligonal real para consultar a NASA POWER.',
      });
      return;
    }

    const today = new Date();
    const defaultEnd = formatYmdCompact(today);
    const startObj = new Date(today.getTime() - 29 * 86400_000);
    const defaultStart = formatYmdCompact(startObj);

    const startCompact = body.startDate ? parseIsoOrCompactDate(body.startDate) : defaultStart;
    const endCompact = body.endDate ? parseIsoOrCompactDate(body.endDate) : defaultEnd;

    if (!startCompact || !endCompact) {
      res.status(400).json({ error: 'Formato de data inválido. Use AAAA-MM-DD.' });
      return;
    }
    if (startCompact > endCompact) {
      res.status(400).json({ error: 'A data inicial deve ser anterior ou igual à data final.' });
      return;
    }
    if (endCompact > defaultEnd) {
      res.status(400).json({
        error:
          'NASA POWER fornece apenas séries históricas observacionais/reanálise; datas futuras não são suportadas.',
      });
      return;
    }

    const startMs = Date.parse(compactToIsoDate(startCompact));
    const endMs = Date.parse(compactToIsoDate(endCompact));
    const spanDays = Math.round((endMs - startMs) / 86400_000) + 1;
    if (spanDays > 366) {
      res.status(400).json({ error: 'Limite máximo de 366 dias por consulta.' });
      return;
    }

    const { lat, lon } = geomCheck.centroid;
    const params = [
      'T2M',
      'T2M_MAX',
      'T2M_MIN',
      'PRECTOTCORR',
      'RH2M',
      'ALLSKY_SFC_SW_DWN',
      'WS2M',
    ].join(',');
    const endpoint = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lon}&latitude=${lat}&start=${startCompact}&end=${endCompact}&format=JSON`;

    try {
      const upstream = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) {
        const errText = await upstream.text();
        res.status(502).json({
          error: `NASA POWER respondeu com status ${upstream.status}.`,
          detail: errText.slice(0, 240),
        });
        return;
      }

      const json = (await upstream.json()) as {
        header?: { api?: { version?: string }; sources?: string[]; fill_value?: number };
        geometry?: { coordinates?: number[] };
        parameters?: Record<string, { units?: string; longname?: string }>;
        properties?: { parameter?: Record<string, Record<string, number>> };
      };

      const fillValue = json.header?.fill_value ?? -999;
      const paramMap = json.properties?.parameter ?? {};
      const dateKeys = Object.keys(paramMap.T2M || paramMap.PRECTOTCORR || {}).sort();

      const series: NasaPowerDailyPoint[] = dateKeys.map((rawDate) => ({
        date: compactToIsoDate(rawDate),
        rawDate,
        t2mC: sanitizePowerNumber(paramMap.T2M?.[rawDate], fillValue),
        t2mMaxC: sanitizePowerNumber(paramMap.T2M_MAX?.[rawDate], fillValue),
        t2mMinC: sanitizePowerNumber(paramMap.T2M_MIN?.[rawDate], fillValue),
        precipMm: sanitizePowerNumber(paramMap.PRECTOTCORR?.[rawDate], fillValue),
        rh2mPercent: sanitizePowerNumber(paramMap.RH2M?.[rawDate], fillValue),
        solarRadMJm2: sanitizePowerNumber(paramMap.ALLSKY_SFC_SW_DWN?.[rawDate], fillValue),
        windSpeedMs: sanitizePowerNumber(paramMap.WS2M?.[rawDate], fillValue),
      }));

      const validDaysCount = series.filter(
        (d) =>
          d.t2mC !== null ||
          d.precipMm !== null ||
          d.rh2mPercent !== null ||
          d.solarRadMJm2 !== null ||
          d.windSpeedMs !== null
      ).length;

      const coords = json.geometry?.coordinates;
      const payload: NasaPowerSeriesResponse = {
        provider: 'NASA POWER',
        sourceOrganization: 'NASA Langley Research Center (POWER Project · Community AG)',
        endpoint: 'https://power.larc.nasa.gov/api/temporal/daily/point',
        apiVersion: json.header?.api?.version || 'v2',
        isForecast: false,
        disclaimer:
          'Série histórica observacional e de reanálise (NASA POWER). NÃO representa previsão meteorológica futura; dias mais recentes podem constar como indisponíveis até consolidação da grade.',
        spatialResolution: '0,5° × 0,625° (~55 km)',
        queriedCentroid: { lat, lon },
        gridCoordinates:
          Array.isArray(coords) && coords.length >= 2
            ? {
                lon: Number(coords[0]),
                lat: Number(coords[1]),
                elevationM: typeof coords[2] === 'number' ? Number(coords[2]) : undefined,
              }
            : null,
        calculatedAreaHa: geomCheck.areaHa,
        period: {
          startDate: compactToIsoDate(startCompact),
          endDate: compactToIsoDate(endCompact),
          totalDays: series.length,
          validDaysCount,
        },
        units: {
          t2mC: json.parameters?.T2M?.units || '°C',
          t2mMaxC: json.parameters?.T2M_MAX?.units || '°C',
          t2mMinC: json.parameters?.T2M_MIN?.units || '°C',
          precipMm: json.parameters?.PRECTOTCORR?.units || 'mm/day',
          rh2mPercent: json.parameters?.RH2M?.units || '%',
          solarRadMJm2: json.parameters?.ALLSKY_SFC_SW_DWN?.units || 'MJ/m²/day',
          windSpeedMs: json.parameters?.WS2M?.units || 'm/s',
        },
        sources: json.header?.sources ?? ['POWER'],
        fetchedAt: new Date().toISOString(),
        summary: {
          avgTempC: meanOrNull(series.map((s) => s.t2mC)),
          maxTempC: maxOrNull(series.map((s) => s.t2mMaxC)),
          minTempC: minOrNull(series.map((s) => s.t2mMinC)),
          totalPrecipMm: sumOrNull(series.map((s) => s.precipMm)),
          avgRh2mPercent: meanOrNull(series.map((s) => s.rh2mPercent)),
          avgSolarRadMJm2: meanOrNull(series.map((s) => s.solarRadMJm2)),
          avgWindSpeedMs: meanOrNull(series.map((s) => s.windSpeedMs)),
        },
        series,
      };

      res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      res.status(504).json({
        error: 'Falha ao consultar a API oficial NASA POWER.',
        detail: msg,
      });
    }
  });

  // ETAPA 3: Consulta real ao catálogo oficial NASA Earthdata CMR para a geometria da propriedade
  app.post('/api/nasa/cmr/granules', async (req, res) => {
    const body = req.body as {
      polygon?: GeoPoint[];
      boundarySource?: 'usuario_geo' | 'estimado_area' | 'demo';
      productKeys?: CmrProductKey[];
      daysBack?: number;
      startDate?: string;
      endDate?: string;
      pageSize?: number;
    };

    const geomCheck = hasValidRealGeometry({
      boundaryPolygon: body?.polygon,
      boundarySource: body?.boundarySource,
    });
    if (!geomCheck.valid || !geomCheck.bbox || !geomCheck.areaHa) {
      res.status(400).json({
        error:
          geomCheck.reason ||
          'Geometria inválida. Cadastre ou desenhe um polígono real antes de consultar cenas NASA.',
      });
      return;
    }

    const keys: CmrProductKey[] =
      Array.isArray(body.productKeys) && body.productKeys.length > 0
        ? body.productKeys.filter((k): k is CmrProductKey => k in CMR_PRODUCT_DEFINITIONS)
        : ['hls_ndvi_evi', 'modis_ndvi_evi', 'gpm_imerg', 'smap_moisture', 'ecostress_lst'];

    const daysBack = Math.min(Math.max(Number(body.daysBack) || 45, 1), 366);
    const pageSize = Math.min(Math.max(Number(body.pageSize) || 4, 1), 15);
    const hasExplicitWindow =
      typeof body.startDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.startDate.trim()) &&
      typeof body.endDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.endDate.trim());

    const endDate = hasExplicitWindow
      ? new Date(`${body.endDate!.trim()}T23:59:59Z`)
      : new Date();
    const startDate = hasExplicitWindow
      ? new Date(`${body.startDate!.trim()}T00:00:00Z`)
      : new Date(endDate.getTime() - daysBack * 86400_000);
    const temporalRange = `${startDate.toISOString().slice(0, 19)}Z,${endDate
      .toISOString()
      .slice(0, 19)}Z`;

    const bbox = getPolygonBoundingBox(body.polygon!);
    const bboxParam = `${bbox[0].toFixed(5)},${bbox[1].toFixed(5)},${bbox[2].toFixed(
      5
    )},${bbox[3].toFixed(5)}`;
    const appeearsReady = isAppeearsAuthConfigured();
    const gpmReady = isGpmEarthdataConfigured();

    const results: CmrProductCatalogResult[] = await Promise.all(
      keys.map(async (key) => {
        const def = CMR_PRODUCT_DEFINITIONS[key];
        const productExtractionReady = key === 'gpm_imerg' ? gpmReady : appeearsReady;
        const shortNameQuery = def.shortNames
          .map((sn) => `short_name[]=${encodeURIComponent(sn)}`)
          .join('&');
        const url = `https://cmr.earthdata.nasa.gov/search/granules.json?${shortNameQuery}&bounding_box=${encodeURIComponent(
          bboxParam
        )}&temporal=${encodeURIComponent(temporalRange)}&sort_key=-start_date&page_size=${pageSize}`;

        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (!resp.ok) {
            return {
              key,
              label: def.label,
              shortNames: def.shortNames,
              spatialResolution: def.spatialResolution,
              temporalResolution: def.temporalResolution,
              authRequirement: def.authRequirement,
              extractionReadyWithCredentials: productExtractionReady,
              totalHits: 0,
              granules: [],
              error: `CMR retornou status ${resp.status}`,
            };
          }

          const totalHits = Number(resp.headers.get('cmr-hits') || '0');
          const data = (await resp.json()) as {
            feed?: {
              entry?: {
                id?: string;
                producer_granule_id?: string;
                title?: string;
                dataset_id?: string;
                time_start?: string;
                time_end?: string;
                cloud_cover?: string | number;
                updated?: string;
                data_center?: string;
                links?: { rel?: string; href?: string }[];
              }[];
            };
          };

          const granules: CmrGranuleItem[] = (data.feed?.entry ?? []).map((e) => {
            const downloadLink = e.links?.find((l) =>
              l.rel?.includes('/data#')
            )?.href;
            const browseLink = e.links?.find((l) =>
              l.rel?.includes('/browse#')
            )?.href;
            const cc =
              e.cloud_cover !== undefined && e.cloud_cover !== null
                ? Number(e.cloud_cover)
                : null;
            return {
              id: e.id || e.title || '',
              producerGranuleId: e.producer_granule_id || e.title || e.id || '',
              collectionShortName: e.dataset_id || def.shortNames.join('/'),
              timeStart: e.time_start || '',
              timeEnd: e.time_end || '',
              cloudCover: cc !== null && Number.isFinite(cc) ? cc : null,
              updatedAt: e.updated || '',
              dataCenter: e.data_center || 'NASA EOSDIS',
              downloadUrl: downloadLink,
              browseUrl: browseLink,
            };
          });

          return {
            key,
            label: def.label,
            shortNames: def.shortNames,
            spatialResolution: def.spatialResolution,
            temporalResolution: def.temporalResolution,
            authRequirement: def.authRequirement,
            extractionReadyWithCredentials: productExtractionReady,
            totalHits,
            granules,
          };
        } catch (err) {
          return {
            key,
            label: def.label,
            shortNames: def.shortNames,
            spatialResolution: def.spatialResolution,
            temporalResolution: def.temporalResolution,
            authRequirement: def.authRequirement,
            extractionReadyWithCredentials: productExtractionReady,
            totalHits: 0,
            granules: [],
            error: err instanceof Error ? err.message : 'Timeout ao consultar CMR',
          };
        }
      })
    );

    const payload: CmrCatalogResponse = {
      provider: 'NASA Earthdata CMR',
      endpoint: 'https://cmr.earthdata.nasa.gov/search/granules.json',
      bbox,
      calculatedAreaHa: geomCheck.areaHa,
      temporalRange,
      fetchedAt: new Date().toISOString(),
      products: results,
    };

    res.json(payload);
  });

  // ETAPA 3A: Verificação real da autenticação NASA AppEEARS (POST /api/login Basic Auth)
  app.post('/api/nasa/appeears/verify-auth', async (_req, res) => {
    const checkedAt = new Date().toISOString();

    if (hasAppeearsBasicCredentials()) {
      const login = await authenticateAppeearsViaBasic(true);
      if (login.ok) {
        res.status(200).json({
          authenticated: true,
          httpStatus: login.httpStatus,
          authMethod: 'basic_login',
          tokenExpiresAt: login.session.expiresAtIso,
          message:
            'Autenticação aprovada no NASA AppEEARS via POST /api/login (HTTP Basic). Token de sessão válido em memória no servidor.',
          checkedAt,
        } satisfies AppeearsAuthVerifyResponse);
        return;
      }

      const statusOut = login.httpStatus === 401 || login.httpStatus === 403 ? login.httpStatus : 502;
      res.status(statusOut).json({
        authenticated: false,
        httpStatus: login.httpStatus,
        authMethod: 'basic_login',
        message: login.message,
        requiredEnvVars: ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD'],
        checkedAt,
      } satisfies AppeearsAuthVerifyResponse);
      return;
    }

    if (hasPreissuedAppeearsToken()) {
      try {
        const token = process.env.APPEEARS_TOKEN!.trim();
        const checkResp = await fetch(`${APPEEARS_BASE_URL}/task?limit=1`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(12000),
        });
        if (checkResp.ok) {
          res.status(200).json({
            authenticated: true,
            httpStatus: checkResp.status,
            authMethod: 'appeears_token',
            message: 'Token APPEEARS_TOKEN validado com sucesso na API NASA AppEEARS.',
            checkedAt,
          } satisfies AppeearsAuthVerifyResponse);
          return;
        }
        const errBody = sanitizeUpstreamMessage(await checkResp.text().catch(() => ''));
        res.status(checkResp.status).json({
          authenticated: false,
          httpStatus: checkResp.status,
          authMethod: 'appeears_token',
          message: `APPEEARS_TOKEN recusado pelo AppEEARS (HTTP ${checkResp.status}).${errBody ? ` ${errBody}` : ''}`,
          requiredEnvVars: ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD'],
          checkedAt,
        } satisfies AppeearsAuthVerifyResponse);
        return;
      } catch (err) {
        res.status(504).json({
          authenticated: false,
          httpStatus: 504,
          authMethod: 'appeears_token',
          message:
            err instanceof Error
              ? `Erro ao validar APPEEARS_TOKEN: ${err.message}`
              : 'Timeout ao validar APPEEARS_TOKEN.',
          checkedAt,
        } satisfies AppeearsAuthVerifyResponse);
        return;
      }
    }

    if (hasOnlyGeneralEdlToken()) {
      res.status(403).json({
        authenticated: false,
        httpStatus: 403,
        authMethod: 'incompatible_edl_token',
        message:
          'A variável EARTHDATA_TOKEN está presente no servidor, mas tokens gerais do Earthdata Login não são aceitos diretamente pelo NASA AppEEARS (retorna HTTP 403). A API AppEEARS exige troca via POST /api/login usando HTTP Basic Auth (EARTHDATA_USERNAME + EARTHDATA_PASSWORD) ou um APPEEARS_TOKEN emitido diretamente por /api/login.',
        requiredEnvVars: ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD'],
        checkedAt,
      } satisfies AppeearsAuthVerifyResponse);
      return;
    }

    res.status(503).json({
      authenticated: false,
      httpStatus: 503,
      authMethod: 'not_configured',
      message:
        'Credenciais do NASA AppEEARS não configuradas no ambiente do servidor. Configure EARTHDATA_USERNAME e EARTHDATA_PASSWORD.',
      requiredEnvVars: ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD'],
      checkedAt,
    } satisfies AppeearsAuthVerifyResponse);
  });

  // Perfis de extração suportados/preparados (reflete estado real de testes concluídos no store)
  app.get('/api/nasa/extraction-profiles', async (_req, res) => {
    const store = await readAppeearsTaskStore().catch(() => ({
      tasks: [] as TrackedExtractionTask[],
      updatedAt: new Date().toISOString(),
    }));
    const doneProfiles = new Set(
      store.tasks.filter((t) => t.taskStatus === 'done').map((t) => t.profileKey)
    );
    const profiles = EXTRACTION_PROFILE_LIST.map((prof) => {
      if (doneProfiles.has(prof.key)) {
        return {
          ...prof,
          validationStatus: 'real_tested' as const,
          statusNote:
            prof.validationStatus === 'real_tested'
              ? prof.statusNote
              : `${prof.statusNote} (Extração real concluída e validada no servidor.)`,
        };
      }
      return prof;
    });
    res.json({ profiles });
  });

  // Lista de tarefas AppEEARS salvas persistentemente no sistema
  app.get('/api/nasa/appeears/tasks', async (_req, res) => {
    try {
      const store = await readAppeearsTaskStore();
      const sorted = [...store.tasks].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      res.json({ tasks: sorted, updatedAt: store.updatedAt });
    } catch {
      res.status(500).json({ error: 'Falha ao ler registro de tarefas AppEEARS.' });
    }
  });

  // ETAPA 3B: Submissão autenticada server-side de tarefa de extração no AppEEARS (com bloqueio de duplicadas)
  app.post('/api/nasa/appeears/extract', async (req, res) => {
    const body = req.body as {
      polygon?: GeoPoint[];
      boundarySource?: 'usuario_geo' | 'estimado_area' | 'demo';
      profileKey?: ExtractionProfileKey;
      product?: string;
      layers?: string[];
      layerSpecs?: AppeearsLayerSpec[];
      startDate?: string;
      endDate?: string;
      propertyId?: string;
      propertyName?: string;
      locationLabel?: string;
    };

    const geomCheck = hasValidRealGeometry({
      boundaryPolygon: body?.polygon,
      boundarySource: body?.boundarySource,
    });
    if (!geomCheck.valid || !geomCheck.centroid || !geomCheck.bbox || !geomCheck.areaHa) {
      res.status(400).json({
        status: 'error',
        connector: body?.product || 'appeears',
        message: geomCheck.reason || 'Geometria inválida para extração espacial.',
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
      return;
    }

    const profileKey = resolveProfileKey(body.product, body.layers, body.profileKey);
    const profile = EXTRACTION_PROFILES[profileKey];

    if (profile.protocol === 'gesdisc_opendap_prepared') {
      res.status(501).json({
        status: 'prepared_only',
        upstreamHttpStatus: 501,
        connector: profile.product,
        message:
          'GPM IMERG utiliza o protocolo GES DISC OPeNDAP/Subset (não AppEEARS /api/task). A estrutura do conector está preparada, porém a extração numérica de precipitação ainda não foi testada nem ativada.',
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
      return;
    }

    const requestedProduct = body.product || profile.product;
    const effectiveLayerSpecs: AppeearsLayerSpec[] =
      Array.isArray(body.layerSpecs) && body.layerSpecs.length > 0
        ? body.layerSpecs
        : profile.layerSpecs &&
          profile.layerSpecs.length > 0 &&
          (!body.layers || body.layers.length === 0 || requestedProduct === profile.product)
        ? profile.layerSpecs
        : (body.layers && body.layers.length > 0 ? body.layers : profile.layers).map((layer) => ({
            product: requestedProduct,
            layer,
          }));
    const requestedLayers = effectiveLayerSpecs.map((s) => s.layer);

    const startFormatted = toAppeearsDate(body.startDate || profile.defaultStartDate);
    const endFormatted = toAppeearsDate(body.endDate || profile.defaultEndDate);
    if (!startFormatted || !endFormatted) {
      res.status(400).json({
        status: 'error',
        connector: requestedProduct,
        message: 'Formato de data inválido para AppEEARS. Use MM-DD-AAAA ou AAAA-MM-DD.',
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
      return;
    }

    const signature = buildExtractionSignature({
      polygon: body.polygon!,
      product: requestedProduct,
      layers: requestedLayers,
      layerSpecs: effectiveLayerSpecs,
      startDate: startFormatted,
      endDate: endFormatted,
    });

    // Proteção contra tarefas duplicadas no AppEEARS
    const store = await readAppeearsTaskStore();
    const existingTask = store.tasks.find(
      (t) => t.signature === signature && t.taskStatus !== 'error'
    );
    if (existingTask) {
      res.status(200).json({
        status: 'submitted',
        deduplicated: true,
        upstreamHttpStatus: 200,
        connector: existingTask.product,
        message:
          'Tarefa idêntica já salva no sistema. Nenhuma nova tarefa duplicada foi enviada ao AppEEARS; utilize o acompanhamento pelo taskId existente.',
        taskId: existingTask.taskId,
        task: existingTask,
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
      return;
    }

    if (!isAppeearsAuthConfigured()) {
      const onlyEdl = hasOnlyGeneralEdlToken();
      res.status(503).json({
        status: 'credentials_required',
        upstreamHttpStatus: onlyEdl ? 403 : 503,
        connector: requestedProduct,
        message: onlyEdl
          ? 'EARTHDATA_TOKEN detectado no servidor, porém o NASA AppEEARS exige login HTTP Basic (POST /api/login) com EARTHDATA_USERNAME e EARTHDATA_PASSWORD para emitir um Bearer Token AppEEARS válido por 48h.'
          : 'Extração de valores por pixel/polígono (NDVI/EVI HLS/MODIS, SMAP, ECOSTRESS LST) requer EARTHDATA_USERNAME e EARTHDATA_PASSWORD configurados no ambiente do servidor.',
        requiredEnvVars: ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD', 'APPEEARS_TOKEN (opcional)'],
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
      return;
    }

    try {
      const ring = body.polygon!.map((p) => [p.lon, p.lat]);
      ring.push([body.polygon![0].lon, body.polygon![0].lat]);

      const taskPayload = {
        task_type: 'area',
        task_name: `agrolynx_${profileKey}_${Date.now()}`,
        params: {
          dates: [
            {
              startDate: startFormatted,
              endDate: endFormatted,
            },
          ],
          layers: effectiveLayerSpecs.map((spec) => ({
            product: spec.product,
            layer: spec.layer,
          })),
          output: {
            format: { type: 'geotiff' },
            projection: 'geographic',
          },
          geo: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: {},
              },
            ],
          },
        },
      };

      const call = await appeearsAuthorizedFetch('/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload),
        signal: AbortSignal.timeout(20000),
      });

      if (!call.ok) {
        const statusOut = call.httpStatus === 401 || call.httpStatus === 403 ? call.httpStatus : 502;
        res.status(statusOut).json({
          status: 'error',
          upstreamHttpStatus: call.httpStatus,
          connector: requestedProduct,
          message: call.message,
          checkedAt: new Date().toISOString(),
        } satisfies AppeearsExtractionResponse);
        return;
      }

      if (!call.response.ok) {
        const errBody = sanitizeUpstreamMessage(await call.response.text().catch(() => ''));
        const statusOut =
          call.response.status >= 400 && call.response.status < 500
            ? call.response.status
            : 502;
        res.status(statusOut).json({
          status: 'error',
          upstreamHttpStatus: call.response.status,
          connector: requestedProduct,
          message: `AppEEARS recusou a tarefa (HTTP ${call.response.status}): ${errBody}`,
          checkedAt: new Date().toISOString(),
        } satisfies AppeearsExtractionResponse);
        return;
      }

      const created = (await call.response.json()) as { task_id?: string };
      const nowIso = new Date().toISOString();
      const newTask: TrackedExtractionTask | undefined = created.task_id
        ? {
            taskId: created.task_id,
            profileKey,
            product: requestedProduct,
            layers: requestedLayers,
            layerSpecs: effectiveLayerSpecs,
            spatialResolution: profile.spatialResolution,
            temporalResolution: profile.temporalResolution,
            propertyId: body.propertyId,
            propertyName: body.propertyName || 'Propriedade selecionada',
            locationLabel:
              body.locationLabel ||
              `${geomCheck.centroid.lat.toFixed(4)}, ${geomCheck.centroid.lon.toFixed(4)}`,
            centroid: geomCheck.centroid,
            areaHa: geomCheck.areaHa,
            bbox: geomCheck.bbox,
            polygon: body.polygon!,
            dateWindow: { startDate: startFormatted, endDate: endFormatted },
            signature,
            taskStatus: 'pending',
            createdAt: nowIso,
            lastCheckedAt: nowIso,
            errorMessage: null,
          }
        : undefined;

      if (newTask) {
        store.tasks.unshift(newTask);
        store.updatedAt = nowIso;
        await writeAppeearsTaskStore(store);
      }

      res.status(200).json({
        status: 'submitted',
        deduplicated: false,
        upstreamHttpStatus: call.response.status,
        connector: requestedProduct,
        message: 'Tarefa de extração espacial submetida ao NASA AppEEARS.',
        taskId: created.task_id,
        task: newTask,
        tokenExpiresAt: call.session.expiresAtIso,
        checkedAt: nowIso,
      } satisfies AppeearsExtractionResponse);
    } catch (err) {
      res.status(502).json({
        status: 'error',
        connector: requestedProduct,
        message: err instanceof Error ? err.message : 'Erro de rede ao conectar ao AppEEARS.',
        checkedAt: new Date().toISOString(),
      } satisfies AppeearsExtractionResponse);
    }
  });

  // ETAPA 3C: Consulta de status de processamento e arquivos do bundle AppEEARS (atualiza registro persistente)
  app.get('/api/nasa/appeears/task/:taskId', async (req, res) => {
    const taskId = String(req.params.taskId || '').trim();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(taskId)) {
      res.status(400).json({ error: 'Identificador de tarefa AppEEARS inválido.' });
      return;
    }

    if (!isAppeearsAuthConfigured()) {
      res.status(503).json({
        error:
          'Autenticação AppEEARS não configurada no servidor (EARTHDATA_USERNAME + EARTHDATA_PASSWORD).',
      });
      return;
    }

    try {
      const call = await appeearsAuthorizedFetch(`/task/${encodeURIComponent(taskId)}`, {
        method: 'GET',
      });
      if (!call.ok) {
        res.status(call.httpStatus).json({ error: call.message });
        return;
      }
      if (!call.response.ok) {
        const errBody = sanitizeUpstreamMessage(await call.response.text().catch(() => ''));
        res.status(call.response.status).json({
          error: `AppEEARS retornou HTTP ${call.response.status}: ${errBody}`,
        });
        return;
      }

      const taskData = (await call.response.json()) as {
        task_id?: string;
        status?: string;
        updated?: string;
        created?: string;
        error?: string | null;
        progress?: { summary?: number };
      };

      let bundleFiles: AppeearsBundleFile[] | undefined;
      if (taskData.status === 'done') {
        const bundleCall = await appeearsAuthorizedFetch(`/bundle/${encodeURIComponent(taskId)}`, {
          method: 'GET',
        });
        if (bundleCall.ok && bundleCall.response.ok) {
          const bundleJson = (await bundleCall.response.json()) as {
            files?: {
              file_id?: string;
              file_name?: string;
              file_type?: string;
              file_size?: number;
            }[];
          };
          bundleFiles = (bundleJson.files || []).map((f) => ({
            fileId: f.file_id || '',
            fileName: f.file_name || '',
            fileType: f.file_type || '',
            fileSizeBytes: Number(f.file_size || 0),
          }));
        }
      }

      const nowIso = new Date().toISOString();
      const store = await readAppeearsTaskStore();
      const idx = store.tasks.findIndex((t) => t.taskId === taskId);
      let updatedTask: TrackedExtractionTask | undefined;
      if (idx >= 0) {
        updatedTask = {
          ...store.tasks[idx],
          taskStatus: taskData.status || store.tasks[idx].taskStatus,
          progressPercent:
            typeof taskData.progress?.summary === 'number'
              ? taskData.progress.summary
              : store.tasks[idx].progressPercent,
          updatedAt: taskData.updated || store.tasks[idx].updatedAt,
          lastCheckedAt: nowIso,
          errorMessage: taskData.error ?? null,
          bundleFiles: bundleFiles ?? store.tasks[idx].bundleFiles,
        };
        store.tasks[idx] = updatedTask;
        store.updatedAt = nowIso;
        await writeAppeearsTaskStore(store);
      }

      const payload: AppeearsTaskStatusResponse = {
        taskId: taskData.task_id || taskId,
        taskStatus: taskData.status || 'unknown',
        upstreamHttpStatus: call.response.status,
        progressPercent:
          typeof taskData.progress?.summary === 'number'
            ? taskData.progress.summary
            : undefined,
        updatedAt: taskData.updated,
        errorMessage: taskData.error || undefined,
        bundleFiles,
        task: updatedTask,
        checkedAt: nowIso,
      };
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao consultar tarefa no AppEEARS.',
      });
    }
  });

  // ETAPA 3D: Proxy autenticado com cache em disco para leitura inline ou download de arquivo do bundle AppEEARS
  async function getCachedOrFetchBundleFile(
    taskId: string,
    fileId: string
  ): Promise<
    | { ok: true; buffer: Buffer; contentType: string; contentDisposition?: string }
    | { ok: false; status: number; error: string }
  > {
    const taskCacheDir = path.join(BUNDLE_CACHE_DIR, taskId);
    const dataCachePath = path.join(taskCacheDir, `${fileId}.bin`);
    const metaCachePath = path.join(taskCacheDir, `${fileId}.meta.json`);

    try {
      const [buffer, metaRaw] = await Promise.all([
        fs.readFile(dataCachePath),
        fs.readFile(metaCachePath, 'utf-8'),
      ]);
      const meta = JSON.parse(metaRaw) as {
        contentType?: string;
        contentDisposition?: string;
      };
      return {
        ok: true,
        buffer,
        contentType: meta.contentType || 'application/octet-stream',
        contentDisposition: meta.contentDisposition,
      };
    } catch {
      // Ainda não em cache
    }

    if (!isAppeearsAuthConfigured()) {
      return {
        ok: false,
        status: 503,
        error: 'Autenticação AppEEARS não configurada no servidor.',
      };
    }

    const call = await appeearsAuthorizedFetch(
      `/bundle/${encodeURIComponent(taskId)}/${encodeURIComponent(fileId)}`,
      { method: 'GET', signal: AbortSignal.timeout(30000) }
    );
    if (!call.ok) {
      return { ok: false, status: call.httpStatus, error: call.message };
    }
    if (!call.response.ok) {
      return {
        ok: false,
        status: call.response.status,
        error: `Falha ao baixar arquivo do bundle (HTTP ${call.response.status}).`,
      };
    }

    const contentType = call.response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = call.response.headers.get('content-disposition') || undefined;
    const buffer = Buffer.from(await call.response.arrayBuffer());

    if (buffer.length > 0 && buffer.length <= 15 * 1024 * 1024) {
      try {
        await fs.mkdir(taskCacheDir, { recursive: true });
        await Promise.all([
          fs.writeFile(dataCachePath, buffer),
          fs.writeFile(metaCachePath, JSON.stringify({ contentType, contentDisposition })),
        ]);
      } catch {
        // Cache em disco é otimização; ignorar se falhar
      }
    }

    return { ok: true, buffer, contentType, contentDisposition };
  }

  function parseCsvRow(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  }

  function normalizeFileBase(name: string): string {
    const base = name.split('/').pop() || name;
    return base.replace(/\.tif+$/i, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  function parseNumOrNull(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }

  function inferObservedAt(rawDate: string, fileName: string): { date: string; observedAt: string } {
    const cleanDate = rawDate.trim();
    const isoDate = cleanDate.slice(0, 10);
    if (cleanDate.length > 10 && /\d{2}:\d{2}/.test(cleanDate)) {
      return { date: isoDate, observedAt: cleanDate };
    }
    const doyTimeMatch = /doy\d{7}(\d{2})(\d{2})(\d{2})/i.exec(fileName);
    if (doyTimeMatch) {
      const hh = doyTimeMatch[1];
      const mm = doyTimeMatch[2];
      const ss = doyTimeMatch[3];
      if (hh !== '00' || mm !== '00' || ss !== '00') {
        return { date: isoDate, observedAt: `${isoDate}T${hh}:${mm}:${ss}Z` };
      }
    }
    return { date: isoDate, observedAt: isoDate };
  }

  function resolveSourceForRow(
    task: TrackedExtractionTask,
    fileName: string,
    dataset: string
  ): {
    sensorKey: OrbitalSensorCategory | null;
    product: string;
    sourceLabel: string;
    unit: string;
    isKelvinLst: boolean;
  } {
    const dsLower = dataset.toLowerCase();
    const fnUpper = fileName.toUpperCase();

    if (
      dsLower.includes('quality') ||
      dsLower === 'cloud' ||
      dsLower === 'qc' ||
      dsLower === 'fmask' ||
      dsLower === 'water' ||
      dsLower.includes('reliability')
    ) {
      return { sensorKey: null, product: task.product, sourceLabel: '', unit: '', isKelvinLst: false };
    }

    if (fnUpper.includes('HLSS30') || fnUpper.includes('HLSL30') || task.product.toUpperCase().includes('HLS')) {
      const isS30 = fnUpper.includes('HLSS30');
      const prod = isS30 ? 'HLSS30_VI.020' : fnUpper.includes('HLSL30') ? 'HLSL30_VI.020' : task.product;
      const sensorName = isS30 ? 'NASA HLS S30 (Sentinel-2)' : fnUpper.includes('HLSL30') ? 'NASA HLS L30 (Landsat 8/9)' : 'NASA HLS L30/S30';
      const sensorKey: OrbitalSensorCategory = dsLower.includes('evi') ? 'evi' : 'ndvi';
      return {
        sensorKey,
        product: prod,
        sourceLabel: `${sensorName} · ${prod}`,
        unit: sensorKey === 'evi' ? 'EVI' : 'NDVI',
        isKelvinLst: false,
      };
    }

    if (fnUpper.includes('MOD13Q1') || fnUpper.includes('MYD13Q1') || task.product.toUpperCase().includes('MOD13Q1')) {
      const sensorKey: OrbitalSensorCategory = dsLower.includes('evi') ? 'evi' : 'ndvi';
      return {
        sensorKey,
        product: 'MOD13Q1.061',
        sourceLabel: 'NASA MODIS Terra · MOD13Q1.061',
        unit: sensorKey === 'evi' ? 'EVI' : 'NDVI',
        isKelvinLst: false,
      };
    }

    if (fnUpper.includes('SPL4SMGP') || dsLower.includes('sm_surface') || dsLower.includes('sm_rootzone')) {
      const isRoot = dsLower.includes('rootzone');
      return {
        sensorKey: 'soil_moisture',
        product: 'SPL4SMGP.008',
        sourceLabel: isRoot
          ? 'NASA SMAP L4 (0–100 cm radicular) · SPL4SMGP.008'
          : 'NASA SMAP L4 (0–5 cm superficial) · SPL4SMGP.008',
        unit: 'm³/m³',
        isKelvinLst: false,
      };
    }

    if (fnUpper.includes('SPL3SMP') || dsLower.includes('soil_moisture')) {
      return {
        sensorKey: 'soil_moisture',
        product: task.product,
        sourceLabel: `NASA SMAP · ${task.product}`,
        unit: 'm³/m³',
        isKelvinLst: false,
      };
    }

    if (fnUpper.includes('ECO_') || dsLower === 'lst' || dsLower.includes('lst')) {
      if (dsLower.includes('err')) {
        return { sensorKey: null, product: task.product, sourceLabel: '', unit: '', isKelvinLst: false };
      }
      return {
        sensorKey: 'lst',
        product: 'ECO_L2T_LSTE.002',
        sourceLabel: 'NASA ECOSTRESS ISS · ECO_L2T_LSTE.002',
        unit: '°C',
        isKelvinLst: true,
      };
    }

    return { sensorKey: null, product: task.product, sourceLabel: '', unit: '', isKelvinLst: false };
  }

  async function extractObservationsForTask(
    task: TrackedExtractionTask
  ): Promise<OrbitalObservationPoint[]> {
    if (task.taskStatus !== 'done' || !task.bundleFiles || task.bundleFiles.length === 0) {
      return [];
    }

    const statsCsvFiles = task.bundleFiles.filter((f) => {
      const lower = f.fileName.toLowerCase();
      return (
        lower.endsWith('statistics.csv') &&
        !lower.endsWith('statistics-qa.csv') &&
        !lower.includes('lookup')
      );
    });
    if (statsCsvFiles.length === 0) return [];

    const tifEntries: { key: string; file: AppeearsBundleFile }[] = [];
    const tifLookup = new Map<string, AppeearsBundleFile>();
    for (const f of task.bundleFiles) {
      if (f.fileType.toLowerCase() === 'tif' || f.fileName.toLowerCase().endsWith('.tif')) {
        const key = normalizeFileBase(f.fileName);
        tifLookup.set(key, f);
        tifEntries.push({ key, file: f });
      }
    }

    const allPoints: OrbitalObservationPoint[] = [];

    for (const csvFile of statsCsvFiles) {
      const fileRes = await getCachedOrFetchBundleFile(task.taskId, csvFile.fileId);
      if (!fileRes.ok) continue;

      const text = fileRes.buffer.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) continue;

      const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
      const col = (name: string) => headers.indexOf(name.toLowerCase());
      const iFile = col('file name');
      const iDataset = col('dataset');
      const iDate = col('date');
      const iCount = col('count');
      const iMin = col('minimum');
      const iMax = col('maximum');
      const iMean = col('mean');
      const iStd = col('standard deviation');
      const iMed = col('median');

      if (iDataset < 0 || iDate < 0 || iMean < 0) continue;

      for (let r = 1; r < lines.length; r++) {
        const row = parseCsvRow(lines[r]);
        if (row.length <= Math.max(iDataset, iDate, iMean)) continue;

        const fileName = iFile >= 0 ? row[iFile] : '';
        const dataset = row[iDataset] || '';
        const rawDate = row[iDate] || '';
        if (!/^\d{4}-\d{2}-\d{2}/.test(rawDate)) continue;

        const resolved = resolveSourceForRow(task, fileName, dataset);
        if (!resolved.sensorKey) continue;

        const toTargetVal = (n: number | null): number | null => {
          if (n === null) return null;
          if (resolved.isKelvinLst) {
            const c = n > 120 ? n - 273.15 : n;
            return Number(c.toFixed(2));
          }
          return Number(n.toFixed(4));
        };

        const mean = toTargetVal(parseNumOrNull(row[iMean]));
        const min = toTargetVal(iMin >= 0 ? parseNumOrNull(row[iMin]) : null);
        const max = toTargetVal(iMax >= 0 ? parseNumOrNull(row[iMax]) : null);
        const median = toTargetVal(iMed >= 0 ? parseNumOrNull(row[iMed]) : null);
        const stdDevRaw = iStd >= 0 ? parseNumOrNull(row[iStd]) : null;
        const stdDev = stdDevRaw !== null ? Number(stdDevRaw.toFixed(4)) : null;
        const pixelCount = iCount >= 0 ? Math.round(parseNumOrNull(row[iCount]) ?? 0) : 0;

        if (mean === null && min === null && max === null) continue;

        const { date, observedAt } = inferObservedAt(rawDate, fileName);
        const normName = fileName ? normalizeFileBase(fileName) : '';
        const tifMatch = normName
          ? tifLookup.get(normName) ??
            tifEntries.find(
              (entry) => entry.key.startsWith(`${normName}_`) || entry.key.startsWith(normName)
            )?.file
          : undefined;

        allPoints.push({
          date,
          observedAt,
          taskId: task.taskId,
          profileKey: task.profileKey,
          sensorKey: resolved.sensorKey,
          product: resolved.product,
          dataset,
          sourceLabel: resolved.sourceLabel,
          spatialResolution: task.spatialResolution,
          unit: resolved.unit,
          mean,
          min,
          max,
          median,
          stdDev,
          pixelCount,
          fileName,
          geotiffFileId: tifMatch?.fileId,
          geotiffFileName: tifMatch?.fileName,
          propertyId: task.propertyId,
          propertyName: task.propertyName,
        });
      }
    }

    return allPoints.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  }

  app.get('/api/nasa/appeears/bundle/:taskId/file/:fileId', async (req, res) => {
    const taskId = String(req.params.taskId || '').trim();
    const fileId = String(req.params.fileId || '').trim();
    const forceDownload = req.query.download === '1' || req.query.download === 'true';

    if (!/^[a-zA-Z0-9-]{8,80}$/.test(taskId) || !/^[a-zA-Z0-9-]{8,80}$/.test(fileId)) {
      res.status(400).json({ error: 'Identificadores de tarefa ou arquivo inválidos.' });
      return;
    }

    try {
      const fileRes = await getCachedOrFetchBundleFile(taskId, fileId);
      if (!fileRes.ok) {
        res.status(fileRes.status).json({ error: fileRes.error });
        return;
      }

      res.setHeader('Content-Type', fileRes.contentType);
      if (fileRes.contentDisposition) {
        res.setHeader(
          'Content-Disposition',
          forceDownload
            ? fileRes.contentDisposition.replace(/^inline/i, 'attachment')
            : fileRes.contentDisposition
        );
      } else if (forceDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="appeears-${fileId}"`);
      }
      res.send(fileRes.buffer);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao baixar arquivo do bundle AppEEARS.',
      });
    }
  });

  // ETAPA 3E: Série temporal extraída do CSV oficial do bundle AppEEARS para uma tarefa
  app.get('/api/nasa/appeears/task/:taskId/timeseries', async (req, res) => {
    const taskId = String(req.params.taskId || '').trim();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(taskId)) {
      res.status(400).json({ error: 'Identificador de tarefa AppEEARS inválido.' });
      return;
    }

    try {
      const store = await readAppeearsTaskStore();
      const task = store.tasks.find((t) => t.taskId === taskId);
      if (!task) {
        res.status(404).json({ error: 'Tarefa AppEEARS não encontrada no registro local.' });
        return;
      }

      const observations = await extractObservationsForTask(task);
      const profile = EXTRACTION_PROFILES[task.profileKey];
      const payload: TaskTimeSeriesResponse = {
        taskId: task.taskId,
        profileKey: task.profileKey,
        product: task.product,
        taskStatus: task.taskStatus,
        propertyId: task.propertyId,
        propertyName: task.propertyName,
        spatialResolution: task.spatialResolution,
        sourceLabel: profile?.officialSource || task.product,
        unit: profile?.unit || '',
        observations,
        fetchedAt: new Date().toISOString(),
      };
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Falha ao extrair série temporal do bundle.',
      });
    }
  });

  // ETAPA 3F: Consulta unificada de observações orbitais reais por propriedade, período e sensor
  app.get('/api/nasa/observations', async (req, res) => {
    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : '';
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
    const sensorParam = typeof req.query.sensor === 'string' ? req.query.sensor.trim() : 'all';
    const latNum = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
    const lonNum = typeof req.query.lon === 'string' ? Number(req.query.lon) : NaN;

    try {
      const store = await readAppeearsTaskStore();
      const matchingTasks = store.tasks.filter((task) => {
        if (!propertyId) return true;
        if (task.propertyId === propertyId) return true;
        if (
          !task.propertyId &&
          Number.isFinite(latNum) &&
          Number.isFinite(lonNum) &&
          task.bbox.length === 4
        ) {
          const tol = 0.01;
          const [west, south, east, north] = task.bbox;
          return (
            lonNum >= west - tol &&
            lonNum <= east + tol &&
            latNum >= south - tol &&
            latNum <= north + tol
          );
        }
        return false;
      });

      const doneTasks = matchingTasks.filter((t) => t.taskStatus === 'done');
      const perTaskObs = await Promise.all(doneTasks.map((t) => extractObservationsForTask(t)));
      let observations = perTaskObs.flat();

      if (sensorParam && sensorParam !== 'all') {
        observations = observations.filter((o) => o.sensorKey === sensorParam);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        observations = observations.filter((o) => o.date >= startDate);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        observations = observations.filter((o) => o.date <= endDate);
      }

      observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt));

      const payload: OrbitalObservationsQueryResponse = {
        propertyId: propertyId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sensor: (sensorParam as OrbitalSensorCategory | 'all') || 'all',
        observations,
        tasks: matchingTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        fetchedAt: new Date().toISOString(),
      };
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao consultar observações orbitais.',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AGROLYNX server listening on http://0.0.0.0:${PORT}`);
  });
}

// Só inicia a escuta HTTP quando executado diretamente como entrypoint
const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]).endsWith('server.ts');

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Erro ao iniciar servidor AGROLYNX:', err);
    process.exit(1);
  });
}
