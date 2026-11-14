import type { ConnectorId, IntegrationConnectorSpec } from '../../types/agrolynx';

export interface ConnectorFetchResult<T> {
  connectorId: ConnectorId;
  status: 'not_configured' | 'ok' | 'error';
  message: string;
  payload: T | null;
  checkedAt: string;
}

export interface NasaPowerQuery {
  latitude: number;
  longitude: number;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
  parameters: string[];
}

export interface EarthdataSearchQuery {
  bbox: [number, number, number, number]; // [west, south, east, north]
  temporalRange: string;
  collections: string[];
  maxCloudCoverPercent: number;
}

export interface GpmImergQuery {
  latitude: number;
  longitude: number;
  startIso: string;
  endIso: string;
  product: 'IMERG_EARLY' | 'IMERG_LATE' | 'IMERG_FINAL';
}

export interface SmapMoistureQuery {
  latitude: number;
  longitude: number;
  startIso: string;
  endIso: string;
  layer: 'sm_surface' | 'sm_rootzone';
}

export interface EcostressQuery {
  bbox: [number, number, number, number];
  startIso: string;
  endIso: string;
  products: ('L2_LSTE' | 'L3_ET_PT_JPL' | 'L4_ESI_PT_JPL')[];
}

export interface SoilGridsQuery {
  latitude: number;
  longitude: number;
  properties: ('clay' | 'sand' | 'silt' | 'phh2o' | 'soc' | 'bdod' | 'cec')[];
  depths: ('0-5cm' | '5-15cm' | '15-30cm' | '30-60cm')[];
}

export const INTEGRATION_SPECS: IntegrationConnectorSpec[] = [
  {
    id: 'nasa_power',
    name: 'NASA POWER',
    provider: 'NASA Langley Research Center',
    category: 'Clima e Radiação',
    status: 'conectada',
    authRequirement: 'Sem chave obrigatória na API pública (proxy server-side /api/nasa/power ativo)',
    expectedEndpoint: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    spatialResolution: '0,5° × 0,625° (~55 km)',
    temporalResolution: 'Diária (histórico observacional e reanálise; NÃO é previsão)',
    expectedFormat: 'JSON / CSV / NetCDF',
    targetVariables: [
      { code: 'T2M / T2M_MAX / T2M_MIN', label: 'Temperatura média, máxima e mínima a 2m', unit: '°C' },
      { code: 'PRECTOTCORR', label: 'Precipitação total corrigida', unit: 'mm/dia' },
      { code: 'ALLSKY_SFC_SW_DWN', label: 'Irradiância solar incidente', unit: 'MJ/m²/dia' },
      { code: 'RH2M', label: 'Umidade relativa a 2m', unit: '%' },
      { code: 'WS2M', label: 'Velocidade do vento a 2m', unit: 'm/s' },
    ],
    purposeInAgrolynx: 'Fornecer séries históricas reais de clima, radiação e precipitação por geometria validada (sem previsão futura).',
  },
  {
    id: 'nasa_earthdata',
    name: 'NASA Earthdata (CMR / HLS / MODIS)',
    provider: 'NASA EOSDIS / LP DAAC',
    category: 'Observação Espectral',
    status: 'catalogo_ativo',
    authRequirement: 'Catálogo CMR público (/api/nasa/cmr/granules ativo); extração AppEEARS requer EARTHDATA_TOKEN no servidor',
    expectedEndpoint: 'https://cmr.earthdata.nasa.gov/search/granules.json',
    spatialResolution: '30 m (HLS L30/S30) · 250 m (MODIS MOD13Q1)',
    temporalResolution: '2 a 5 dias (HLS) · 16 dias (MODIS)',
    expectedFormat: 'GeoTIFF (COG) / STAC JSON',
    targetVariables: [
      { code: 'NDVI', label: 'Índice de Vegetação por Diferença Normalizada', unit: 'adimensional (-1 a 1)' },
      { code: 'EVI', label: 'Índice de Vegetação Realçado', unit: 'adimensional' },
      { code: 'NDWI', label: 'Índice de Água por Diferença Normalizada', unit: 'adimensional' },
      { code: 'Fmask', label: 'Máscara de nuvens e sombra', unit: 'bitmask' },
    ],
    purposeInAgrolynx: 'Descobrir cenas reais por polígono e extrair séries NDVI/EVI quando credenciais Earthdata estiverem configuradas no servidor.',
  },
  {
    id: 'gpm_imerg',
    name: 'GPM IMERG',
    provider: 'NASA Goddard Earth Sciences (GES DISC)',
    category: 'Precipitação Orbital',
    status: 'requer_credenciais',
    authRequirement: 'Catálogo CMR ativo; download/extração OPeNDAP requer Earthdata Login no servidor',
    expectedEndpoint: 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDL.07',
    spatialResolution: '0,1° × 0,1° (~10 km)',
    temporalResolution: '30 min / Diária (Late ~14h; Final ~3,5 meses)',
    expectedFormat: 'HDF5 / NetCDF4 / OPeNDAP',
    targetVariables: [
      { code: 'precipitationCal', label: 'Precipitação calibrada multi-satélite', unit: 'mm/dia' },
      { code: 'precipitationUncal', label: 'Precipitação não calibrada', unit: 'mm/h' },
      { code: 'randomError', label: 'Erro aleatório estimado', unit: 'mm/h' },
    ],
    purposeInAgrolynx: 'Monitorar chuvas acumuladas, eventos extremos e janelas operacionais de campo onde não há estação local.',
  },
  {
    id: 'smap',
    name: 'SMAP (Soil Moisture Active Passive)',
    provider: 'NASA NSIDC DAAC',
    category: 'Umidade do Solo',
    status: 'requer_credenciais',
    authRequirement: 'Catálogo CMR ativo; extração AppEEARS requer EARTHDATA_TOKEN no servidor',
    expectedEndpoint: 'https://appeears.earthdatacloud.nasa.gov/api/task',
    spatialResolution: '9 km (SPL3SMP_E / SPL4SMGP)',
    temporalResolution: '3 horas (L4) / 1–3 dias (L3 Enhanced)',
    expectedFormat: 'HDF5 / GeoTIFF',
    targetVariables: [
      { code: 'sm_surface', label: 'Umidade volumétrica superficial (0–5 cm)', unit: 'm³/m³' },
      { code: 'sm_rootzone', label: 'Umidade na zona radicular (0–100 cm)', unit: 'm³/m³' },
      { code: 'surface_temp', label: 'Temperatura superficial do solo', unit: 'K' },
    ],
    purposeInAgrolynx: 'Apoiar o diagnóstico de déficit hídrico regional e calibrar alertas preventivos de irrigação.',
  },
  {
    id: 'ecostress',
    name: 'ECOSTRESS',
    provider: 'NASA JPL / LP DAAC (ISS)',
    category: 'Estresse Térmico e ET',
    status: 'requer_credenciais',
    authRequirement: 'Catálogo CMR ativo; extração AppEEARS requer EARTHDATA_TOKEN no servidor',
    expectedEndpoint: 'https://appeears.earthdatacloud.nasa.gov/api/task',
    spatialResolution: '70 m × 70 m',
    temporalResolution: 'Irregular (~1 a 5 dias, órbita ISS)',
    expectedFormat: 'GeoTIFF / HDF5',
    targetVariables: [
      { code: 'LST', label: 'Temperatura da Superfície Terrestre', unit: 'K / °C' },
      { code: 'ETdaily', label: 'Evapotranspiração diária real', unit: 'mm/dia' },
      { code: 'ESI', label: 'Índice de Estresse Evaporativo', unit: 'adimensional' },
    ],
    purposeInAgrolynx: 'Identificar estresse térmico e fechamento estomático antes da perda visível de vigor foliar.',
  },
  {
    id: 'soilgrids',
    name: 'SoilGrids v2.0',
    provider: 'ISRIC — World Soil Information',
    category: 'Pedologia Global',
    status: 'arquitetura_preparada',
    authRequirement: 'REST público ISRIC com cache local no PostgreSQL',
    expectedEndpoint: 'https://rest.isric.org/soilgrids/v2.0/properties/query',
    spatialResolution: '250 m × 250 m',
    temporalResolution: 'Camada estática de referência pedológica',
    expectedFormat: 'JSON / GeoTIFF WCS',
    targetVariables: [
      { code: 'clay', label: 'Fração de argila', unit: 'g/kg (%)' },
      { code: 'sand', label: 'Fração de areia', unit: 'g/kg (%)' },
      { code: 'silt', label: 'Fração de silte', unit: 'g/kg (%)' },
      { code: 'phh2o', label: 'pH em água', unit: 'pH × 10' },
      { code: 'soc', label: 'Carbono orgânico do solo', unit: 'dg/kg' },
    ],
    purposeInAgrolynx: 'Fornecer linha de base pedológica por profundidade quando ainda não houver laudo laboratorial cadastrado.',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL + PostGIS',
    provider: 'Camada de Persistência Estruturada',
    category: 'Persistência Relacional',
    status: 'arquitetura_preparada',
    authRequirement: 'Conexão server-side (DATABASE_URL) a ser provisionada na próxima etapa',
    expectedEndpoint: 'postgres://<host>:5432/agrolynx_prod (Pool Server-Side)',
    spatialResolution: 'Polígonos vetoriais SRID 4326 (PostGIS)',
    temporalResolution: 'Transacional em tempo real',
    expectedFormat: 'SQL Relacional + GeoJSON',
    targetVariables: [
      { code: 'properties', label: 'Cadastro fundiário e centroides', unit: 'tabela' },
      { code: 'field_plots', label: 'Geometria de talhões (PostGIS)', unit: 'tabela' },
      { code: 'nasa_telemetry_cache', label: 'Cache de séries NASA/SoilGrids', unit: 'tabela' },
      { code: 'operational_alerts', label: 'Fila e auditoria de alertas', unit: 'tabela' },
    ],
    purposeInAgrolynx: 'Persistir usuários, propriedades, talhões georreferenciados, análises de solo, safras e cache científico.',
  },
];

/**
 * Adaptadores preparados para futuras integrações.
 * Nesta etapa inicial, nenhuma chamada externa paga ou chave de API é executada.
 */
export const futureAdapters = {
  async queryNasaPower(_query: NasaPowerQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'nasa_power',
      status: 'not_configured',
      message: 'Conector NASA POWER preparado. Ative a rota server-side /api/integrations/nasa-power na etapa de backend.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
  async searchEarthdata(_query: EarthdataSearchQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'nasa_earthdata',
      status: 'not_configured',
      message: 'Conector NASA Earthdata CMR/HLS preparado. Requer proxy server-side autenticado na próxima etapa.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
  async queryGpmImerg(_query: GpmImergQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'gpm_imerg',
      status: 'not_configured',
      message: 'Conector GPM IMERG preparado. Aguardando serviço de extração OPeNDAP/NetCDF.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
  async querySmap(_query: SmapMoistureQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'smap',
      status: 'not_configured',
      message: 'Conector SMAP preparado. Aguardando fila assíncrona AppEEARS no servidor.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
  async queryEcostress(_query: EcostressQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'ecostress',
      status: 'not_configured',
      message: 'Conector ECOSTRESS preparado. Aguardando integração espacial LST/ET.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
  async querySoilGrids(_query: SoilGridsQuery): Promise<ConnectorFetchResult<null>> {
    return {
      connectorId: 'soilgrids',
      status: 'not_configured',
      message: 'Conector SoilGrids v2.0 preparado. Aguardando cache de consulta pedológica no PostgreSQL.',
      payload: null,
      checkedAt: new Date().toISOString(),
    };
  },
};
