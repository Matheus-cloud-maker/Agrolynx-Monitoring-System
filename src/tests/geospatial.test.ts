import assert from 'node:assert/strict';
import {
  calculatePolygonAreaHa,
  hasValidRealGeometry,
  validatePolygonGeometry,
} from '../utils/geospatial';
import { parsePolygonCoordinates } from '../utils/validation';
import { RepositoryError, workspaceService } from '../services/workspaceService';
import type { GeoPoint } from '../types/agrolynx';

// Mock localStorage simples para validar persistência do workspaceService em ambiente Node
function createMemoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS: ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL: ${name}`);
      throw err;
    });
}

async function main() {
  // 1. Polígono conhecido no Equador (~0,01° x 0,01° ≈ 123,09 ha no elipsoide/esfera Turf)
  await runTest('Polígono retangular conhecido (0,01° x 0,01° no Equador)', () => {
    const square: GeoPoint[] = [
      { lat: 0.0, lon: 0.0 },
      { lat: 0.0, lon: 0.01 },
      { lat: 0.01, lon: 0.01 },
      { lat: 0.01, lon: 0.0 },
    ];
    const res = calculatePolygonAreaHa(square);
    assert.equal(res.valid, true);
    assert.ok(res.areaHa !== null);
    // 0.01 deg lat (~1105.7 m) * 0.01 deg lon (~1113.2 m) ≈ 123.1 ha (Turf esfera WGS84 ≈ 123.6 ha)
    assert.ok(res.areaHa > 122 && res.areaHa < 125, `Área inesperada: ${res.areaHa} ha`);
  });

  // 2. Polígono conhecido em Sorriso/MT (TH-01 do seed)
  await runTest('Polígono de talhão conhecido em Sorriso/MT (TH-01)', () => {
    const th01: GeoPoint[] = [
      { lat: -12.531, lon: -55.733 },
      { lat: -12.531, lon: -55.72 },
      { lat: -12.541, lon: -55.72 },
      { lat: -12.541, lon: -55.733 },
    ];
    const res = calculatePolygonAreaHa(th01);
    assert.equal(res.valid, true);
    assert.ok(res.areaHa !== null);
    // ~1.106 km x ~1.412 km ≈ 156.2 ha (diferente da área manual de 185 ha)
    assert.ok(res.areaHa > 154 && res.areaHa < 159, `Área inesperada: ${res.areaHa} ha`);
  });

  // 3. Triângulo e anel já fechado devem produzir valores consistentes
  await runTest('Triângulo (metade do retângulo) e suporte a anel fechado', () => {
    const rect: GeoPoint[] = [
      { lat: -12.53, lon: -55.73 },
      { lat: -12.53, lon: -55.72 },
      { lat: -12.54, lon: -55.72 },
      { lat: -12.54, lon: -55.73 },
    ];
    const tri: GeoPoint[] = [
      { lat: -12.53, lon: -55.73 },
      { lat: -12.53, lon: -55.72 },
      { lat: -12.54, lon: -55.72 },
    ];
    const triClosed: GeoPoint[] = [...tri, tri[0]];

    const rectArea = calculatePolygonAreaHa(rect).areaHa!;
    const triArea = calculatePolygonAreaHa(tri).areaHa!;
    const triClosedArea = calculatePolygonAreaHa(triClosed).areaHa!;

    assert.equal(triArea, triClosedArea);
    assert.ok(
      Math.abs(triArea - rectArea / 2) < 0.25,
      `Triângulo (${triArea} ha) deveria ser ~metade do retângulo (${rectArea} ha)`
    );
  });

  // 4. Alteração de vértices recalcula a área proporcionalmente
  await runTest('Alteração de vértices atualiza a área calculada', () => {
    const base: GeoPoint[] = [
      { lat: -12.53, lon: -55.73 },
      { lat: -12.53, lon: -55.72 },
      { lat: -12.54, lon: -55.72 },
      { lat: -12.54, lon: -55.73 },
    ];
    const doubled: GeoPoint[] = [
      { lat: -12.53, lon: -55.74 },
      { lat: -12.53, lon: -55.72 },
      { lat: -12.54, lon: -55.72 },
      { lat: -12.54, lon: -55.74 },
    ];
    const a1 = calculatePolygonAreaHa(base).areaHa!;
    const a2 = calculatePolygonAreaHa(doubled).areaHa!;
    assert.ok(Math.abs(a2 - a1 * 2) < 0.5, `Esperado ~${a1 * 2} ha, obtido ${a2} ha`);
  });

  // 5. Validação de polígonos inválidos e coordenadas incorretas
  await runTest('Rejeição de polígonos inválidos, autointerseção e coordenadas fora de WGS84', () => {
    const tooFew = validatePolygonGeometry([
      { lat: -12.5, lon: -55.7 },
      { lat: -12.51, lon: -55.71 },
    ]);
    assert.equal(tooFew.valid, false);

    const outOfRange = validatePolygonGeometry([
      { lat: -95, lon: -55.7 },
      { lat: -12.5, lon: -55.71 },
      { lat: -12.51, lon: -55.72 },
    ]);
    assert.equal(outOfRange.valid, false);

    const identical = validatePolygonGeometry([
      { lat: -12.5, lon: -55.7 },
      { lat: -12.5, lon: -55.7 },
      { lat: -12.5, lon: -55.7 },
    ]);
    assert.equal(identical.valid, false);

    // Polígono em formato de ampulheta (autointerseção)
    const bowtie = validatePolygonGeometry([
      { lat: -12.53, lon: -55.73 },
      { lat: -12.54, lon: -55.72 },
      { lat: -12.53, lon: -55.72 },
      { lat: -12.54, lon: -55.73 },
    ]);
    assert.equal(bowtie.valid, false);

    // Parser deve rejeitar bowtie e aceitar GeoJSON válido
    const parsedBad = parsePolygonCoordinates(
      '-12.53, -55.73\n-12.54, -55.72\n-12.53, -55.72\n-12.54, -55.73'
    );
    assert.ok(parsedBad.error);

    const parsedGeoJson = parsePolygonCoordinates(
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [-55.73, -12.53],
            [-55.72, -12.53],
            [-55.72, -12.54],
            [-55.73, -12.54],
            [-55.73, -12.53],
          ],
        ],
      })
    );
    assert.equal(parsedGeoJson.error, undefined);
    assert.equal(parsedGeoJson.points.length, 5);
  });

  // 6. Salvamento e recuperação de polígonos com persistência
  await runTest('Salvamento e recuperação de polígonos de propriedade e talhão no workspaceService', async () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      createMemoryLocalStorage() as unknown as Storage;

    const userId = 'test-user-geo';
    let ws = await workspaceService.loadWorkspace(userId, false);

    // Criar propriedade sem perímetro inicial
    ws = workspaceService.addProperty(ws, {
      name: 'Fazenda Sol Nascente',
      municipality: 'Sorriso',
      state: 'MT',
      totalAreaHa: 500,
      centroid: { lat: -12.55, lon: -55.72 },
      biome: 'Cerrado',
    });
    const propId = ws.properties[0].id;
    assert.equal(ws.properties[0].boundaryPolygon, undefined);
    assert.equal(ws.properties[0].calculatedAreaHa, undefined);

    // Salvar perímetro real na propriedade
    const realBoundary: GeoPoint[] = [
      { lat: -12.54, lon: -55.73 },
      { lat: -12.54, lon: -55.71 },
      { lat: -12.56, lon: -55.71 },
      { lat: -12.56, lon: -55.73 },
    ];
    ws = workspaceService.updatePropertyBoundary(ws, propId, realBoundary, 'usuario_geo');
    const expectedPropCalc = calculatePolygonAreaHa(realBoundary).areaHa!;
    assert.equal(ws.properties[0].calculatedAreaHa, expectedPropCalc);
    assert.equal(ws.properties[0].totalAreaHa, 500); // Área manual preservada separadamente

    // Criar talhão sem vértices (referência estimada) e outro com vértices reais
    ws = workspaceService.addPlot(ws, {
      propertyId: propId,
      code: 'SN-01',
      name: 'Talhão Sem Vértices',
      areaHa: 80,
      soilTextureClass: 'Latossolo Vermelho',
      elevationM: 380,
      centroid: { lat: -12.55, lon: -55.72 },
      irrigationSystem: 'sequeiro',
    });
    const plotId = ws.plots[0].id;
    assert.equal(ws.plots[0].polygonSource, 'estimado_area');

    // Atualizar talhão com vértices reais
    const newPlotPoly: GeoPoint[] = [
      { lat: -12.545, lon: -55.728 },
      { lat: -12.545, lon: -55.718 },
      { lat: -12.555, lon: -55.718 },
      { lat: -12.555, lon: -55.728 },
    ];
    ws = workspaceService.updatePlotPolygon(ws, plotId, newPlotPoly, 'usuario_geo');
    const expectedPlotCalc = calculatePolygonAreaHa(newPlotPoly).areaHa!;
    assert.equal(ws.plots[0].polygonSource, 'usuario_geo');
    assert.equal(ws.plots[0].calculatedAreaHa, expectedPlotCalc);
    assert.equal(ws.plots[0].areaHa, 80);

    // Persistir e recarregar do armazenamento simulando atualização de página
    await workspaceService.saveWorkspace(userId, ws);
    const reloaded = await workspaceService.loadWorkspace(userId, false);

    const reloadedProp = reloaded.properties.find((p) => p.id === propId)!;
    assert.equal(reloadedProp.name, 'Fazenda Sol Nascente');
    assert.equal(reloadedProp.boundaryPolygon?.length, 4);
    assert.equal(reloadedProp.boundarySource, 'usuario_geo');
    assert.equal(reloadedProp.calculatedAreaHa, expectedPropCalc);
    assert.equal(reloadedProp.totalAreaHa, 500);

    const reloadedPlot = reloaded.plots.find((pl) => pl.id === plotId)!;
    assert.equal(reloadedPlot.polygon.length, 4);
    assert.equal(reloadedPlot.polygonSource, 'usuario_geo');
    assert.equal(reloadedPlot.calculatedAreaHa, expectedPlotCalc);
    assert.equal(reloadedPlot.areaHa, 80);
  });

  // 7. Bloqueio de consultas para geometria ausente ou estimada e suporte a GeoJSON FeatureCollection
  await runTest('Gate de geometria real (hasValidRealGeometry) e parser FeatureCollection', () => {
    const noPoly = hasValidRealGeometry({ boundaryPolygon: undefined });
    assert.equal(noPoly.valid, false);

    const estimated = hasValidRealGeometry({
      boundaryPolygon: [
        { lat: -12.54, lon: -55.73 },
        { lat: -12.54, lon: -55.71 },
        { lat: -12.56, lon: -55.71 },
        { lat: -12.56, lon: -55.73 },
      ],
      boundarySource: 'estimado_area',
    });
    assert.equal(estimated.valid, false);

    const fcParsed = parsePolygonCoordinates(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-55.73, -12.54],
                  [-55.71, -12.54],
                  [-55.71, -12.56],
                  [-55.73, -12.56],
                  [-55.73, -12.54],
                ],
              ],
            },
            properties: {},
          },
        ],
      })
    );
    assert.equal(fcParsed.error, undefined);
    const validReal = hasValidRealGeometry({
      boundaryPolygon: fcParsed.points,
      boundarySource: 'usuario_geo',
    });
    assert.equal(validReal.valid, true);
    assert.ok(validReal.areaHa && validReal.areaHa > 400);
    assert.ok(validReal.bbox && validReal.centroid);
  });

  // 8. Edição de dados cadastrais preservando polígono, vértices, centróide e área calculada
  await runTest('Edição cadastral preserva polígono (5 vértices), centróide e área calculada', async () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      createMemoryLocalStorage() as unknown as Storage;

    const userId = 'test-user-edit-details';
    let ws = await workspaceService.loadWorkspace(userId, false);

    const fiveVertices: GeoPoint[] = [
      { lat: -22.86804, lon: -42.96492 },
      { lat: -22.86804, lon: -42.9615 },
      { lat: -22.87164, lon: -42.9615 },
      { lat: -22.87164, lon: -42.96492 },
      { lat: -22.86804, lon: -42.96492 },
    ];
    const origCentroid = { lat: -22.86984, lon: -42.96321 };

    ws = workspaceService.addProperty(ws, {
      name: 'Fazenda Sítio Boa Vista',
      municipality: 'Maricá',
      state: 'RJ',
      totalAreaHa: 150,
      centroid: origCentroid,
      boundaryPolygon: fiveVertices,
      boundarySource: 'usuario_geo',
      biome: 'Cerrado',
    });

    const prop = ws.properties[0];
    const calcBefore = prop.calculatedAreaHa;
    assert.ok(calcBefore !== undefined && calcBefore > 13 && calcBefore < 15);
    assert.equal(prop.boundaryPolygon?.length, 5);

    // Rejeitar entradas inválidas
    assert.throws(
      () =>
        workspaceService.updatePropertyDetails(ws, prop.id, {
          name: 'Fazenda Sítio Boa Vista',
          municipality: 'Maricá',
          state: 'RJ',
          biome: 'Mata Atlântica',
          totalAreaHa: 0,
        }),
      RepositoryError
    );

    assert.throws(
      () =>
        workspaceService.updatePropertyDetails(ws, prop.id, {
          name: 'AB',
          municipality: 'Maricá',
          state: 'R',
          biome: 'Mata Atlântica',
          totalAreaHa: 15,
        }),
      RepositoryError
    );

    // Atualizar área informada de 150,0 para 15,0 e metadados cadastrais
    ws = workspaceService.updatePropertyDetails(ws, prop.id, {
      name: 'Sítio Boa Vista',
      municipality: 'Maricá',
      state: 'rj',
      biome: 'Mata Atlântica',
      carCode: 'RJ-3302700-TESTE',
      totalAreaHa: 15.0,
    });

    await workspaceService.saveWorkspace(userId, ws);
    const reloaded = await workspaceService.loadWorkspace(userId, false);
    const updated = reloaded.properties.find((p) => p.id === prop.id)!;

    assert.equal(updated.id, prop.id);
    assert.equal(updated.name, 'Sítio Boa Vista');
    assert.equal(updated.municipality, 'Maricá');
    assert.equal(updated.state, 'RJ');
    assert.equal(updated.biome, 'Mata Atlântica');
    assert.equal(updated.carCode, 'RJ-3302700-TESTE');
    assert.equal(updated.totalAreaHa, 15);
    assert.equal(updated.calculatedAreaHa, calcBefore);
    assert.equal(updated.boundarySource, 'usuario_geo');
    assert.deepEqual(updated.centroid, origCentroid);
    assert.deepEqual(updated.boundaryPolygon, fiveVertices);
    assert.equal(updated.boundaryPolygon?.length, 5);
  });

  console.log('\nTodos os testes geoespaciais e de persistência foram aprovados.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
