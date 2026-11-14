import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../../server.ts';
import type { GeoPoint } from '../types/agrolynx.ts';
import type {
  AppeearsAuthVerifyResponse,
  AppeearsExtractionResponse,
  CmrCatalogResponse,
  ExtractionConnectorBlueprint,
  NasaIntegrationRuntimeStatus,
  NasaPowerSeriesResponse,
  TrackedExtractionTask,
} from '../types/nasa.ts';

const VALID_SORRISO_POLYGON: GeoPoint[] = [
  { lat: -12.528, lon: -55.738 },
  { lat: -12.528, lon: -55.7 },
  { lat: -12.561, lon: -55.701 },
  { lat: -12.56, lon: -55.738 },
];

async function run() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Falha ao obter porta do servidor de teste.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Status das integrações
    const statusResp = await fetch(`${baseUrl}/api/nasa/status`);
    assert.equal(statusResp.status, 200);
    const statusJson = (await statusResp.json()) as NasaIntegrationRuntimeStatus;
    const powerStatus = statusJson.sources.find((s) => s.id === 'nasa_power');
    assert.equal(powerStatus?.operationalLevel, 'live_data');
    console.log('PASS: GET /api/nasa/status');

    // 2. Persistência permanente de perímetro no servidor (/api/workspace/:userId)
    const testUser = `test_backend_${Date.now()}`;
    const putResp = await fetch(`${baseUrl}/api/workspace/${testUser}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          properties: [
            {
              id: 'prop-test-1',
              name: 'Fazenda Teste Real',
              municipality: 'Sorriso',
              state: 'MT',
              totalAreaHa: 1200,
              calculatedAreaHa: 1456.4,
              centroid: { lat: -12.544, lon: -55.719 },
              boundaryPolygon: VALID_SORRISO_POLYGON,
              boundarySource: 'usuario_geo',
              biome: 'Cerrado',
              createdAt: new Date().toISOString(),
              isDemo: false,
            },
          ],
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
        },
      }),
    });
    assert.equal(putResp.status, 200);

    const getResp = await fetch(`${baseUrl}/api/workspace/${testUser}`);
    assert.equal(getResp.status, 200);
    const getJson = (await getResp.json()) as {
      exists: boolean;
      workspace: { properties: { boundaryPolygon: GeoPoint[]; boundarySource: string }[] };
    };
    assert.equal(getJson.exists, true);
    assert.equal(getJson.workspace.properties[0].boundaryPolygon.length, 4);
    assert.equal(getJson.workspace.properties[0].boundarySource, 'usuario_geo');
    console.log('PASS: Persistência permanente do perímetro no backend (/api/workspace)');

    // 3. Bloqueio de consulta geográfica sem geometria válida ou com perímetro estimado
    const blockedEmpty = await fetch(`${baseUrl}/api/nasa/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon: [], startDate: '2026-10-01', endDate: '2026-10-10' }),
    });
    assert.equal(blockedEmpty.status, 400);

    const blockedEstimated = await fetch(`${baseUrl}/api/nasa/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: VALID_SORRISO_POLYGON,
        boundarySource: 'estimado_area',
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      }),
    });
    assert.equal(blockedEstimated.status, 400);
    console.log('PASS: Bloqueio server-side para geometria ausente e perímetro estimado');

    // 4. Consulta real à API NASA POWER (histórico 2026-10-01 a 2026-10-10)
    const powerResp = await fetch(`${baseUrl}/api/nasa/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: VALID_SORRISO_POLYGON,
        boundarySource: 'usuario_geo',
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      }),
    });
    assert.equal(powerResp.status, 200);
    const powerJson = (await powerResp.json()) as NasaPowerSeriesResponse;
    assert.equal(powerJson.provider, 'NASA POWER');
    assert.equal(powerJson.isForecast, false);
    assert.equal(powerJson.series.length, 10);
    assert.ok(powerJson.summary.avgTempC !== null && powerJson.summary.avgTempC > 10);
    assert.ok(powerJson.summary.avgSolarRadMJm2 !== null);
    assert.ok(powerJson.summary.avgWindSpeedMs !== null);
    assert.ok(powerJson.series.every((d) => d.t2mC === null || d.t2mC > -100));
    console.log(
      `PASS: Consulta real NASA POWER (10 dias, T. média ${powerJson.summary.avgTempC}°C, chuva ${powerJson.summary.totalPrecipMm} mm)`
    );

    // 5. Consulta real ao catálogo NASA Earthdata CMR
    const cmrResp = await fetch(`${baseUrl}/api/nasa/cmr/granules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: VALID_SORRISO_POLYGON,
        boundarySource: 'usuario_geo',
        daysBack: 45,
        pageSize: 2,
      }),
    });
    assert.equal(cmrResp.status, 200);
    const cmrJson = (await cmrResp.json()) as CmrCatalogResponse;
    assert.equal(cmrJson.products.length, 5);
    const totalScenes = cmrJson.products.reduce((s, p) => s + p.totalHits, 0);
    assert.ok(totalScenes > 0, 'Esperava cenas reais no catálogo CMR');
    console.log(`PASS: Consulta real NASA Earthdata CMR (${totalScenes} cenas catalogadas nos últimos 45d)`);

    // 6. Perfis de extração, tarefas salvas, séries temporais e proteção contra duplicadas
    const profilesResp = await fetch(`${baseUrl}/api/nasa/extraction-profiles`);
    assert.equal(profilesResp.status, 200);
    const profilesJson = (await profilesResp.json()) as {
      profiles: ExtractionConnectorBlueprint[];
    };
    assert.ok(profilesJson.profiles.length >= 7, 'Deve listar perfis HLS, MODIS, GPM, SMAP e ECOSTRESS');
    for (const expectedKey of [
      'hls_ndvi',
      'hls_evi',
      'modis_ndvi',
      'modis_evi',
      'smap_spl4smgp',
      'ecostress_lst',
      'gpm_imerg',
    ]) {
      assert.ok(
        profilesJson.profiles.some((p) => p.key === expectedKey),
        `Perfil ${expectedKey} ausente`
      );
    }
    assert.equal(
      profilesJson.profiles.find((p) => p.key === 'modis_ndvi')?.validationStatus,
      'real_tested'
    );
    assert.equal(
      profilesJson.profiles.find((p) => p.key === 'gpm_imerg')?.validationStatus,
      'prepared_untested'
    );
    assert.equal(
      profilesJson.profiles.find((p) => p.key === 'ecostress_lst')?.product,
      'ECO_L2T_LSTE.002'
    );
    assert.equal(
      profilesJson.profiles.find((p) => p.key === 'smap_spl4smgp')?.product,
      'SPL4SMGP.008'
    );

    const savedTasksResp = await fetch(`${baseUrl}/api/nasa/appeears/tasks`);
    assert.equal(savedTasksResp.status, 200);
    const savedTasksJson = (await savedTasksResp.json()) as {
      tasks: TrackedExtractionTask[];
    };
    assert.ok(
      savedTasksJson.tasks.some((t) => t.taskId === '02e692b0-1b94-4b6b-ab38-1131b303468f'),
      'Tarefa MODIS NDVI real deve estar salva no sistema'
    );

    // Série temporal real extraída do Statistics.csv + correspondência de GeoTIFF
    const modisTsResp = await fetch(
      `${baseUrl}/api/nasa/appeears/task/02e692b0-1b94-4b6b-ab38-1131b303468f/timeseries`
    );
    assert.equal(modisTsResp.status, 200);
    const modisTsJson = (await modisTsResp.json()) as {
      observations: { sensorKey: string; mean: number | null; geotiffFileId?: string }[];
    };
    assert.ok(modisTsJson.observations.length >= 2);
    assert.equal(modisTsJson.observations[0].sensorKey, 'ndvi');
    assert.ok(modisTsJson.observations[0].geotiffFileId);

    // Consulta unificada com filtros por propriedade, período e sensor
    const obsQueryResp = await fetch(
      `${baseUrl}/api/nasa/observations?startDate=2026-09-01&endDate=2026-11-30&sensor=ndvi`
    );
    assert.equal(obsQueryResp.status, 200);
    const obsQueryJson = (await obsQueryResp.json()) as {
      observations: { sensorKey: string; date: string; geotiffFileId?: string }[];
    };
    assert.ok(obsQueryJson.observations.length >= 2);
    assert.ok(obsQueryJson.observations.every((o) => o.sensorKey === 'ndvi'));

    // Duplicação evitada para mesma janela/polígono/produto
    const dedupResp = await fetch(`${baseUrl}/api/nasa/appeears/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: VALID_SORRISO_POLYGON,
        boundarySource: 'usuario_geo',
        product: 'MOD13Q1.061',
        layers: ['_250m_16_days_NDVI'],
        startDate: '10-01-2026',
        endDate: '11-10-2026',
      }),
    });
    const dedupJson = (await dedupResp.json()) as AppeearsExtractionResponse;
    assert.equal(dedupResp.status, 200);
    assert.equal(dedupJson.deduplicated, true);
    assert.equal(dedupJson.taskId, '02e692b0-1b94-4b6b-ab38-1131b303468f');

    // GPM retorna estrutura preparada (não AppEEARS /api/task)
    const gpmResp = await fetch(`${baseUrl}/api/nasa/appeears/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: VALID_SORRISO_POLYGON,
        boundarySource: 'usuario_geo',
        product: 'GPM_3IMERGDL.07',
        layers: ['precipitationCal'],
      }),
    });
    const gpmJson = (await gpmResp.json()) as AppeearsExtractionResponse;
    assert.equal(gpmResp.status, 501);
    assert.equal(gpmJson.status, 'prepared_only');

    const prevUser = process.env.EARTHDATA_USERNAME;
    const prevPass = process.env.EARTHDATA_PASSWORD;
    const prevAppToken = process.env.APPEEARS_TOKEN;
    const prevEdlToken = process.env.EARTHDATA_TOKEN;

    try {
      delete process.env.EARTHDATA_USERNAME;
      delete process.env.EARTHDATA_PASSWORD;
      delete process.env.APPEEARS_TOKEN;
      delete process.env.EARTHDATA_TOKEN;

      const verifyUnconfigured = await fetch(`${baseUrl}/api/nasa/appeears/verify-auth`, {
        method: 'POST',
      });
      const verifyUnconfiguredJson = (await verifyUnconfigured.json()) as AppeearsAuthVerifyResponse;
      assert.equal(verifyUnconfigured.status, 503);
      assert.equal(verifyUnconfiguredJson.authenticated, false);
      assert.equal(verifyUnconfiguredJson.authMethod, 'not_configured');

      const appResp = await fetch(`${baseUrl}/api/nasa/appeears/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon: VALID_SORRISO_POLYGON,
          boundarySource: 'usuario_geo',
          product: 'MOD13Q1.061',
          layers: ['_250m_16_days_EVI'],
          startDate: '10-01-2025',
          endDate: '10-15-2025',
        }),
      });
      const appJson = (await appResp.json()) as AppeearsExtractionResponse;
      assert.equal(appResp.status, 503);
      assert.equal(appJson.status, 'credentials_required');

      // Simular ambiente contendo apenas EARTHDATA_TOKEN geral (rejeitado pelo AppEEARS com 403)
      process.env.EARTHDATA_TOKEN = 'synthetic-edl-token-for-unit-test';
      const verifyEdlOnly = await fetch(`${baseUrl}/api/nasa/appeears/verify-auth`, {
        method: 'POST',
      });
      const verifyEdlJson = (await verifyEdlOnly.json()) as AppeearsAuthVerifyResponse;
      assert.equal(verifyEdlOnly.status, 403);
      assert.equal(verifyEdlJson.authenticated, false);
      assert.equal(verifyEdlJson.authMethod, 'incompatible_edl_token');

      const extractEdlOnly = await fetch(`${baseUrl}/api/nasa/appeears/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon: VALID_SORRISO_POLYGON,
          boundarySource: 'usuario_geo',
          product: 'MOD13Q1.061',
          layers: ['_250m_16_days_EVI'],
          startDate: '10-01-2025',
          endDate: '10-15-2025',
        }),
      });
      assert.equal(extractEdlOnly.status, 503);
      const statusWithEdlOnly = (await (
        await fetch(`${baseUrl}/api/nasa/status`)
      ).json()) as NasaIntegrationRuntimeStatus;
      assert.equal(
        statusWithEdlOnly.sources.find((s) => s.id === 'hls_modis')?.operationalLevel,
        'credentials_required'
      );
      console.log(
        'PASS: Perfis, tarefa salva, bloqueio de duplicadas e proteção de credenciais validados'
      );
    } finally {
      if (prevUser === undefined) delete process.env.EARTHDATA_USERNAME;
      else process.env.EARTHDATA_USERNAME = prevUser;
      if (prevPass === undefined) delete process.env.EARTHDATA_PASSWORD;
      else process.env.EARTHDATA_PASSWORD = prevPass;
      if (prevAppToken === undefined) delete process.env.APPEEARS_TOKEN;
      else process.env.APPEEARS_TOKEN = prevAppToken;
      if (prevEdlToken === undefined) delete process.env.EARTHDATA_TOKEN;
      else process.env.EARTHDATA_TOKEN = prevEdlToken;
    }

    // Limpeza do arquivo de teste do usuário sintético
    const storePath = path.resolve(process.cwd(), '.agrolynx-data', 'workspaces.json');
    const rawStore = await fs.readFile(storePath, 'utf-8');
    const store = JSON.parse(rawStore) as { workspaces: Record<string, unknown> };
    delete store.workspaces[testUser];
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
