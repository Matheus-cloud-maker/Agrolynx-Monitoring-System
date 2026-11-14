import type {
  ExtractionConnectorBlueprint,
  ExtractionProfileKey,
} from '../../types/nasa.ts';

export const EXTRACTION_PROFILES: Record<
  ExtractionProfileKey,
  ExtractionConnectorBlueprint
> = {
  hls_ndvi: {
    key: 'hls_ndvi',
    sensorCategory: 'ndvi',
    label: 'HLS L30/S30 NDVI (HLSL30_VI.020 + HLSS30_VI.020)',
    officialSource: 'NASA Earthdata LP DAAC · Harmonized Landsat-Sentinel (HLS v2.0)',
    product: 'HLSL30_VI.020 / HLSS30_VI.020',
    layers: ['NDVI'],
    layerSpecs: [
      { product: 'HLSS30_VI.020', layer: 'NDVI' },
      { product: 'HLSL30_VI.020', layer: 'NDVI' },
    ],
    protocol: 'appeears_area_task',
    spatialResolution: '30 m × 30 m',
    temporalResolution: '2 a 5 dias (Sentinel-2 + Landsat 8/9)',
    unit: 'NDVI (-1,0 a 1,0)',
    scaleFactor: 0.0001,
    fillValue: -19999,
    validationStatus: 'prepared_untested',
    statusNote:
      'Configurado para extração real combinada Landsat (L30) e Sentinel-2 (S30) via NASA AppEEARS.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  hls_evi: {
    key: 'hls_evi',
    sensorCategory: 'evi',
    label: 'HLS L30/S30 EVI (HLSL30_VI.020 + HLSS30_VI.020)',
    officialSource: 'NASA Earthdata LP DAAC · Harmonized Landsat-Sentinel (HLS v2.0)',
    product: 'HLSL30_VI.020 / HLSS30_VI.020',
    layers: ['EVI'],
    layerSpecs: [
      { product: 'HLSS30_VI.020', layer: 'EVI' },
      { product: 'HLSL30_VI.020', layer: 'EVI' },
    ],
    protocol: 'appeears_area_task',
    spatialResolution: '30 m × 30 m',
    temporalResolution: '2 a 5 dias (Sentinel-2 + Landsat 8/9)',
    unit: 'EVI (-1,0 a 1,0)',
    scaleFactor: 0.0001,
    fillValue: -19999,
    validationStatus: 'prepared_untested',
    statusNote:
      'Configurado para extração real EVI 30 m (HLS L30/S30) via NASA AppEEARS.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  modis_ndvi: {
    key: 'modis_ndvi',
    sensorCategory: 'ndvi',
    label: 'MODIS NDVI (MOD13Q1.061)',
    officialSource: 'NASA LP DAAC · MODIS Terra Vegetation Indices',
    product: 'MOD13Q1.061',
    layers: ['_250m_16_days_NDVI'],
    protocol: 'appeears_area_task',
    spatialResolution: '250 m × 250 m',
    temporalResolution: 'Composto a cada 16 dias',
    unit: 'NDVI (-0,2 a 1,0)',
    scaleFactor: 0.0001,
    fillValue: -3000,
    validationStatus: 'real_tested',
    statusNote:
      'Testado em execução real no NASA AppEEARS (autenticação /api/login, submissão, processamento e leitura de bundle/GeoTIFF).',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  modis_evi: {
    key: 'modis_evi',
    sensorCategory: 'evi',
    label: 'MODIS EVI (MOD13Q1.061)',
    officialSource: 'NASA LP DAAC · MODIS Terra Vegetation Indices',
    product: 'MOD13Q1.061',
    layers: ['_250m_16_days_EVI'],
    protocol: 'appeears_area_task',
    spatialResolution: '250 m × 250 m',
    temporalResolution: 'Composto a cada 16 dias',
    unit: 'EVI (-0,2 a 1,0)',
    scaleFactor: 0.0001,
    fillValue: -3000,
    validationStatus: 'prepared_untested',
    statusNote:
      'Conector MODIS EVI 250 m via NASA AppEEARS.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  smap_spl4smgp: {
    key: 'smap_spl4smgp',
    sensorCategory: 'soil_moisture',
    label: 'SMAP L4 Umidade do Solo (SPL4SMGP.008)',
    officialSource: 'NASA NSIDC DAAC · SMAP Level-4 Global 9 km Geophysical',
    product: 'SPL4SMGP.008',
    layers: ['Geophysical_Data_sm_surface', 'Geophysical_Data_sm_rootzone'],
    layerSpecs: [
      { product: 'SPL4SMGP.008', layer: 'Geophysical_Data_sm_surface' },
      { product: 'SPL4SMGP.008', layer: 'Geophysical_Data_sm_rootzone' },
    ],
    protocol: 'appeears_area_task',
    spatialResolution: '9 km × 9 km',
    temporalResolution: '3 horas (assimilação SMAP L4)',
    unit: 'm³/m³',
    scaleFactor: 1,
    fillValue: -9999,
    validationStatus: 'prepared_untested',
    statusNote:
      'Configurado com SPL4SMGP.008 (umidade superficial 0–5 cm e zona radicular 0–100 cm em m³/m³) via NASA AppEEARS.',
    defaultStartDate: '11-01-2026',
    defaultEndDate: '11-14-2026',
  },
  smap_moisture: {
    key: 'smap_moisture',
    sensorCategory: 'soil_moisture',
    label: 'SMAP L3 Enhanced (SPL3SMP_E.006)',
    officialSource: 'NASA NSIDC DAAC · SMAP L3 Radiometer Enhanced',
    product: 'SPL3SMP_E.006',
    layers: ['Soil_Moisture_Retrieval_Data_AM_soil_moisture'],
    protocol: 'appeears_area_task',
    spatialResolution: '9 km × 9 km',
    temporalResolution: '1 a 3 dias (L3 Enhanced)',
    unit: 'm³/m³',
    scaleFactor: 1,
    fillValue: -9999,
    validationStatus: 'prepared_untested',
    statusNote:
      'Perfil legado L3 Enhanced; produto principal ativo para umidade do solo é SPL4SMGP.008.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  ecostress_lst: {
    key: 'ecostress_lst',
    sensorCategory: 'lst',
    label: 'ECOSTRESS Temperatura de Superfície LST (ECO_L2T_LSTE.002)',
    officialSource: 'NASA JPL / LP DAAC (ISS) · ECOSTRESS Tiled L2T LSTE V002',
    product: 'ECO_L2T_LSTE.002',
    layers: ['LST', 'cloud'],
    layerSpecs: [
      { product: 'ECO_L2T_LSTE.002', layer: 'LST' },
      { product: 'ECO_L2T_LSTE.002', layer: 'cloud' },
    ],
    protocol: 'appeears_area_task',
    spatialResolution: '70 m × 70 m',
    temporalResolution: 'Irregular (órbita ISS, ~1 a 5 dias)',
    unit: '°C (Kelvin − 273,15)',
    scaleFactor: 1,
    fillValue: Number.NaN,
    validationStatus: 'prepared_untested',
    statusNote:
      'Configurado para ECO_L2T_LSTE.002 (float32 em Kelvin, convertido para °C) e máscara de nuvens via NASA AppEEARS.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
  gpm_imerg: {
    key: 'gpm_imerg',
    label: 'GPM IMERG Precipitação (GPM_3IMERGDL.07)',
    officialSource: 'NASA GES DISC · GPM IMERG Late Run',
    product: 'GPM_3IMERGDL.07',
    layers: ['precipitationCal'],
    protocol: 'gesdisc_opendap_prepared',
    spatialResolution: '0,1° × 0,1° (~10 km)',
    temporalResolution: 'Diária (Late ~14h / Final ~3,5 meses)',
    unit: 'mm/dia',
    scaleFactor: 1,
    fillValue: -9999.9,
    validationStatus: 'prepared_untested',
    statusNote:
      'Estrutura preparada para GES DISC OPeNDAP/Subset (não utiliza AppEEARS /api/task). Catálogo CMR operacional; extração numérica ainda não testada.',
    defaultStartDate: '10-01-2026',
    defaultEndDate: '11-14-2026',
  },
};

export const EXTRACTION_PROFILE_LIST: ExtractionConnectorBlueprint[] = [
  EXTRACTION_PROFILES.hls_ndvi,
  EXTRACTION_PROFILES.hls_evi,
  EXTRACTION_PROFILES.modis_ndvi,
  EXTRACTION_PROFILES.modis_evi,
  EXTRACTION_PROFILES.smap_spl4smgp,
  EXTRACTION_PROFILES.ecostress_lst,
  EXTRACTION_PROFILES.gpm_imerg,
];

export function resolveProfileKey(
  product?: string,
  layers?: string[],
  explicitKey?: ExtractionProfileKey
): ExtractionProfileKey {
  if (explicitKey && explicitKey in EXTRACTION_PROFILES) {
    return explicitKey;
  }
  const prod = (product || '').toUpperCase();
  const joinedLayers = (layers || []).join(',').toLowerCase();

  if (prod.includes('GPM')) return 'gpm_imerg';
  if (prod.includes('SPL4')) return 'smap_spl4smgp';
  if (prod.includes('SPL3') || joinedLayers.includes('sm_surface') || joinedLayers.includes('soil_moisture')) {
    return prod.includes('SPL3') ? 'smap_moisture' : 'smap_spl4smgp';
  }
  if (prod.includes('ECO_') || joinedLayers.includes('lst')) {
    return 'ecostress_lst';
  }
  if (prod.includes('HLS')) {
    return joinedLayers.includes('evi') && !joinedLayers.includes('ndvi')
      ? 'hls_evi'
      : 'hls_ndvi';
  }
  if (joinedLayers.includes('evi') && !joinedLayers.includes('ndvi')) {
    return 'modis_evi';
  }
  return 'modis_ndvi';
}
