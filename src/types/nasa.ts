export interface NasaPowerDailyPoint {
  date: string; // YYYY-MM-DD
  rawDate: string; // YYYYMMDD
  t2mC: number | null;
  t2mMaxC: number | null;
  t2mMinC: number | null;
  precipMm: number | null;
  rh2mPercent: number | null;
  solarRadMJm2: number | null;
  windSpeedMs: number | null;
}

export interface NasaPowerSeriesResponse {
  provider: 'NASA POWER';
  sourceOrganization: string;
  endpoint: string;
  apiVersion: string;
  isForecast: false;
  disclaimer: string;
  spatialResolution: string;
  queriedCentroid: { lat: number; lon: number };
  gridCoordinates: { lon: number; lat: number; elevationM?: number } | null;
  calculatedAreaHa: number;
  period: {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    totalDays: number;
    validDaysCount: number;
  };
  units: {
    t2mC: string;
    t2mMaxC: string;
    t2mMinC: string;
    precipMm: string;
    rh2mPercent: string;
    solarRadMJm2: string;
    windSpeedMs: string;
  };
  sources: string[];
  fetchedAt: string;
  summary: {
    avgTempC: number | null;
    maxTempC: number | null;
    minTempC: number | null;
    totalPrecipMm: number | null;
    avgRh2mPercent: number | null;
    avgSolarRadMJm2: number | null;
    avgWindSpeedMs: number | null;
  };
  series: NasaPowerDailyPoint[];
}

export type CmrProductKey =
  | 'hls_ndvi_evi'
  | 'modis_ndvi_evi'
  | 'gpm_imerg'
  | 'smap_moisture'
  | 'ecostress_lst';

export interface CmrGranuleItem {
  id: string;
  producerGranuleId: string;
  collectionShortName: string;
  timeStart: string;
  timeEnd: string;
  cloudCover: number | null;
  updatedAt: string;
  dataCenter: string;
  downloadUrl?: string;
  browseUrl?: string;
}

export interface CmrProductCatalogResult {
  key: CmrProductKey;
  label: string;
  shortNames: string[];
  spatialResolution: string;
  temporalResolution: string;
  authRequirement: string;
  extractionReadyWithCredentials: boolean;
  totalHits: number;
  granules: CmrGranuleItem[];
  error?: string;
}

export interface CmrCatalogResponse {
  provider: 'NASA Earthdata CMR';
  endpoint: string;
  bbox: [number, number, number, number];
  calculatedAreaHa: number;
  temporalRange: string;
  fetchedAt: string;
  products: CmrProductCatalogResult[];
}

export interface NasaIntegrationRuntimeStatus {
  checkedAt: string;
  sources: {
    id: 'nasa_power' | 'nasa_earthdata_cmr' | 'gpm_imerg' | 'hls_modis' | 'smap' | 'ecostress';
    name: string;
    officialApi: string;
    authRequired: boolean;
    credentialsConfigured: boolean;
    operationalLevel: 'live_data' | 'live_catalog_metadata' | 'credentials_required';
    spatialResolution: string;
    temporalResolution: string;
    limitations: string;
  }[];
}

export type ExtractionProfileKey =
  | 'hls_ndvi'
  | 'hls_evi'
  | 'modis_ndvi'
  | 'modis_evi'
  | 'gpm_imerg'
  | 'smap_spl4smgp'
  | 'smap_moisture'
  | 'ecostress_lst';

export type OrbitalSensorCategory = 'ndvi' | 'evi' | 'soil_moisture' | 'lst';

export interface AppeearsLayerSpec {
  product: string;
  layer: string;
}

export interface ExtractionConnectorBlueprint {
  key: ExtractionProfileKey;
  sensorCategory?: OrbitalSensorCategory;
  label: string;
  officialSource: string;
  product: string;
  layers: string[];
  layerSpecs?: AppeearsLayerSpec[];
  protocol: 'appeears_area_task' | 'gesdisc_opendap_prepared';
  spatialResolution: string;
  temporalResolution: string;
  unit: string;
  scaleFactor: number;
  fillValue?: number;
  validationStatus: 'real_tested' | 'prepared_untested';
  statusNote: string;
  defaultStartDate: string;
  defaultEndDate: string;
}

export interface TrackedExtractionTask {
  taskId: string;
  profileKey: ExtractionProfileKey;
  product: string;
  layers: string[];
  layerSpecs?: AppeearsLayerSpec[];
  spatialResolution: string;
  temporalResolution: string;
  propertyId?: string;
  propertyName: string;
  locationLabel: string;
  centroid: { lat: number; lon: number };
  areaHa: number;
  bbox: [number, number, number, number];
  polygon: { lat: number; lon: number }[];
  dateWindow: { startDate: string; endDate: string };
  signature: string;
  taskStatus: string; // pending | queued | processing | done | error
  progressPercent?: number;
  createdAt: string;
  updatedAt?: string;
  lastCheckedAt: string;
  errorMessage?: string | null;
  bundleFiles?: AppeearsBundleFile[];
}

export interface AppeearsAuthVerifyResponse {
  authenticated: boolean;
  httpStatus: number;
  authMethod: 'basic_login' | 'appeears_token' | 'incompatible_edl_token' | 'not_configured';
  tokenExpiresAt?: string;
  message: string;
  requiredEnvVars?: string[];
  checkedAt: string;
}

export interface AppeearsBundleFile {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface AppeearsTaskStatusResponse {
  taskId: string;
  taskStatus: string; // pending | queued | processing | done | error
  upstreamHttpStatus: number;
  progressPercent?: number;
  updatedAt?: string;
  errorMessage?: string;
  bundleFiles?: AppeearsBundleFile[];
  task?: TrackedExtractionTask;
  checkedAt: string;
}

export interface AppeearsExtractionResponse {
  status: 'credentials_required' | 'submitted' | 'prepared_only' | 'error';
  upstreamHttpStatus?: number;
  deduplicated?: boolean;
  connector: string;
  message: string;
  requiredEnvVars?: string[];
  taskId?: string;
  task?: TrackedExtractionTask;
  tokenExpiresAt?: string;
  checkedAt: string;
}

export interface OrbitalObservationPoint {
  date: string; // YYYY-MM-DD
  observedAt: string; // YYYY-MM-DD or ISO-like timestamp
  taskId: string;
  profileKey: ExtractionProfileKey;
  sensorKey: OrbitalSensorCategory;
  product: string;
  dataset: string;
  sourceLabel: string;
  spatialResolution: string;
  unit: string;
  mean: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  stdDev: number | null;
  pixelCount: number;
  fileName: string;
  geotiffFileId?: string;
  geotiffFileName?: string;
  propertyId?: string;
  propertyName: string;
}

export interface TaskTimeSeriesResponse {
  taskId: string;
  profileKey: ExtractionProfileKey;
  product: string;
  taskStatus: string;
  propertyId?: string;
  propertyName: string;
  spatialResolution: string;
  sourceLabel: string;
  unit: string;
  observations: OrbitalObservationPoint[];
  fetchedAt: string;
}

export interface OrbitalObservationsQueryResponse {
  propertyId?: string;
  startDate?: string;
  endDate?: string;
  sensor?: OrbitalSensorCategory | 'all';
  observations: OrbitalObservationPoint[];
  tasks: TrackedExtractionTask[];
  fetchedAt: string;
}

