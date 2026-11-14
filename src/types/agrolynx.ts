export type AppRoute = 'landing' | 'login' | 'register' | 'recover' | 'dashboard';

export type DashboardModuleId =
  | 'properties'
  | 'map'
  | 'weather'
  | 'soil'
  | 'satellites'
  | 'crops'
  | 'irrigation'
  | 'monitoring'
  | 'alerts'
  | 'planning'
  | 'reports'
  | 'settings';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: 'produtor' | 'agronomo' | 'gestor';
  region: string;
  createdAt: string;
  isDemoAccount?: boolean;
}

export interface AuthSession {
  user: AuthUser;
  tokenType: 'local_demo_session';
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  organization: string;
  role: 'produtor' | 'agronomo' | 'gestor';
  region: string;
  password: string;
  confirmPassword: string;
}

export interface RecoverPasswordPayload {
  email: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Property {
  id: string;
  name: string;
  municipality: string;
  state: string;
  totalAreaHa: number;
  /** Área calculada geodesicamente em hectares a partir de boundaryPolygon (Turf.js) */
  calculatedAreaHa?: number;
  centroid: GeoPoint;
  /** Polígono geográfico do perímetro da propriedade (SRID 4326) */
  boundaryPolygon?: GeoPoint[];
  boundarySource?: 'usuario_geo' | 'estimado_area' | 'demo';
  biome: string;
  carCode?: string;
  createdAt: string;
  isDemo: boolean;
}

export interface FieldPlot {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  areaHa: number;
  /** Área calculada geodesicamente em hectares a partir de polygon (Turf.js) */
  calculatedAreaHa?: number;
  soilTextureClass: string;
  elevationM: number;
  centroid: GeoPoint;
  /** Coordenadas geográficas do polígono do talhão */
  polygon: GeoPoint[];
  polygonSource?: 'usuario_geo' | 'estimado_area' | 'demo';
  irrigationSystem: 'sequeiro' | 'pivo_central' | 'gotejamento' | 'aspersao';
  isDemo: boolean;
}

export type PhenologicalStage =
  | 'pre_plantio'
  | 'emergencia'
  | 'vegetativo'
  | 'florescimento'
  | 'enchimento_graos'
  | 'maturacao'
  | 'colhido';

export interface CropCycle {
  id: string;
  propertyId: string;
  plotId: string;
  cropName: string;
  cultivar: string;
  season: string;
  plantingDate: string;
  expectedHarvestDate: string;
  stage: PhenologicalStage;
  targetKc: number;
  notes?: string;
  isDemo: boolean;
}

export interface SoilSample {
  id: string;
  propertyId: string;
  plotId: string;
  collectedAt: string;
  depthLabel: '0-5 cm' | '5-15 cm' | '15-30 cm' | '30-60 cm';
  phH2O: number;
  clayPercent: number;
  siltPercent: number;
  sandPercent: number;
  organicCarbonGKg: number;
  cecCmolKg?: number;
  source: 'laboratorio_usuario' | 'demo_estrutural';
  notes?: string;
  isDemo: boolean;
}

export interface IrrigationSector {
  id: string;
  propertyId: string;
  plotId: string;
  name: string;
  method: 'Pivô Central' | 'Gotejamento Subsuperficial' | 'Aspersão Convencional';
  flowRateM3H: number;
  efficiencyPercent: number;
  status: 'disponivel' | 'planejado' | 'manutencao';
  isDemo: boolean;
}

export interface IrrigationEvent {
  id: string;
  propertyId: string;
  sectorId: string;
  date: string;
  appliedDepthMm: number;
  durationHours: number;
  notes?: string;
  isDemo: boolean;
}

export type ObservationSeverity = 'informativo' | 'atencao' | 'critico';

export interface FieldObservation {
  id: string;
  propertyId: string;
  plotId: string;
  date: string;
  category: 'fenologia' | 'fitossanidade' | 'pluviometria_local' | 'solo' | 'manejo';
  title: string;
  description: string;
  severity: ObservationSeverity;
  localRainMm?: number;
  isDemo: boolean;
}

export interface AlertRule {
  id: string;
  propertyId: string;
  name: string;
  dataSource: 'NASA POWER' | 'GPM IMERG' | 'SMAP' | 'ECOSTRESS' | 'Earthdata HLS' | 'Registro Local';
  parameter: string;
  condition: 'menor_que' | 'maior_que' | 'variacao_acima_de';
  thresholdValue: number;
  unit: string;
  enabled: boolean;
  isDemo: boolean;
}

export type AlertStatus = 'ativo' | 'reconhecido' | 'resolvido';

export interface OperationalAlert {
  id: string;
  propertyId: string;
  plotId?: string;
  ruleId?: string;
  title: string;
  message: string;
  severity: ObservationSeverity;
  status: AlertStatus;
  source: string;
  createdAt: string;
  isDemo: boolean;
}

export type OperationStatus = 'pendente' | 'em_andamento' | 'concluida' | 'adiada';

export interface PlannedOperation {
  id: string;
  propertyId: string;
  plotId: string;
  title: string;
  category: 'preparo_solo' | 'semeadura' | 'adubacao' | 'defensivos' | 'irrigacao' | 'colheita';
  scheduledDate: string;
  responsible: string;
  status: OperationStatus;
  notes?: string;
  isDemo: boolean;
}

export type ConnectorId =
  | 'nasa_power'
  | 'nasa_earthdata'
  | 'gpm_imerg'
  | 'smap'
  | 'ecostress'
  | 'soilgrids'
  | 'postgresql';

export interface IntegrationConnectorSpec {
  id: ConnectorId;
  name: string;
  provider: string;
  category: 'Clima e Radiação' | 'Observação Espectral' | 'Precipitação Orbital' | 'Umidade do Solo' | 'Estresse Térmico e ET' | 'Pedologia Global' | 'Persistência Relacional';
  status: 'conectada' | 'catalogo_ativo' | 'requer_credenciais' | 'arquitetura_preparada';
  authRequirement: string;
  expectedEndpoint: string;
  spatialResolution: string;
  temporalResolution: string;
  expectedFormat: string;
  targetVariables: { code: string; label: string; unit: string }[];
  purposeInAgrolynx: string;
}

export interface WeatherSeriesSample {
  date: string;
  t2mMaxC: number;
  t2mMinC: number;
  precipMm: number;
  rh2mPercent: number;
  solarRadMJm2: number;
  isDemo: true;
}

export interface PlatformPreferences {
  areaUnit: 'ha' | 'alqueire_paulista';
  temperatureUnit: 'C';
  timezone: string;
  showDemoData: boolean;
  enableHighContrastTables: boolean;
}

export interface AgrolynxWorkspaceData {
  properties: Property[];
  plots: FieldPlot[];
  crops: CropCycle[];
  soilSamples: SoilSample[];
  irrigationSectors: IrrigationSector[];
  irrigationEvents: IrrigationEvent[];
  observations: FieldObservation[];
  alertRules: AlertRule[];
  alerts: OperationalAlert[];
  operations: PlannedOperation[];
  preferences: PlatformPreferences;
}
