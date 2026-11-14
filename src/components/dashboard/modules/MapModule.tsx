import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckSquare,
  Eye,
  Layers,
  Loader2,
  MapPin,
  Maximize2,
  Pencil,
  PenTool,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { nasaClient } from '../../../services/nasaClient';
import { decodeGeoTiffRaster, type DecodedRasterInfo } from '../../../utils/geotiffRaster';
import { calculatePolygonAreaHa, hasValidRealGeometry } from '../../../utils/geospatial';
import {
  formatArea,
  formatCoord,
  formatDateBr,
  formatDateTimeBr,
  parsePolygonCoordinates,
} from '../../../utils/validation';
import type {
  AgrolynxWorkspaceData,
  FieldPlot,
  GeoPoint,
  Property,
} from '../../../types/agrolynx';
import type {
  OrbitalObservationPoint,
  OrbitalSensorCategory,
  TrackedExtractionTask,
} from '../../../types/nasa';

type MapLayerId =
  | 'osm_base'
  | 'property_boundary'
  | 'plot_geometry'
  | 'ndvi'
  | 'evi'
  | 'soil_moisture'
  | 'lst';

interface LayerDefinition {
  id: MapLayerId;
  label: string;
  category: 'mapa_base' | 'vetorial_local' | 'orbital_nasa';
  source: string;
  resolution: string;
  legendItems: { color: string; border?: string; label: string }[];
  unavailableReason?: string;
}

interface MapModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
  onUpdatePropertyBoundary: (
    propertyId: string,
    boundaryPolygon: GeoPoint[],
    boundarySource: Property['boundarySource']
  ) => Promise<void>;
  onUpdatePlotPolygon: (
    plotId: string,
    polygon: GeoPoint[],
    polygonSource?: FieldPlot['polygonSource']
  ) => Promise<void>;
}

const MAP_LAYERS: LayerDefinition[] = [
  {
    id: 'osm_base',
    label: 'Mapa-base OpenStreetMap',
    category: 'mapa_base',
    source: '© OpenStreetMap contributors (Tiles Raster XYZ)',
    resolution: 'Ruas, rodovias, cidades e hidrografia',
    legendItems: [
      { color: '#f8fafc', border: '#94a3b8', label: 'Malha urbana, estradas e limites' },
      { color: '#bae6fd', border: '#0284c7', label: 'Corpos hídricos e drenagem' },
    ],
  },
  {
    id: 'property_boundary',
    label: 'Perímetro da Propriedade',
    category: 'vetorial_local',
    source: 'Cadastro Fundiário Local (EPSG:4326)',
    resolution: 'Polígono vetorial + centróide',
    legendItems: [
      { color: 'rgba(14, 165, 233, 0.15)', border: '#0284c7', label: 'Perímetro real salvo' },
      { color: 'rgba(245, 158, 11, 0.15)', border: '#d97706', label: 'Referência estimada (não real)' },
      { color: '#facc15', border: '#0b1f3a', label: 'Centróide cadastrado' },
    ],
  },
  {
    id: 'plot_geometry',
    label: 'Geometria dos Talhões',
    category: 'vetorial_local',
    source: 'Cadastro Vetorial Local (EPSG:4326)',
    resolution: 'Polígonos individuais por talhão',
    legendItems: [
      { color: 'rgba(22, 163, 74, 0.22)', border: '#15803d', label: 'Talhão cadastrado' },
      { color: 'rgba(34, 197, 94, 0.4)', border: '#16a34a', label: 'Talhão selecionado' },
    ],
  },
  {
    id: 'ndvi',
    label: 'NDVI — Índice de Vegetação',
    category: 'orbital_nasa',
    source: 'NASA Earthdata · HLS L30/S30 & MODIS (LP DAAC)',
    resolution: '30 m (HLS) / 250 m (MODIS)',
    unavailableReason: 'Nenhuma extração NDVI concluída para esta propriedade e período.',
    legendItems: [
      { color: '#b91c1c', label: '-0,2 a 0,1 (Solo exposto / Água)' },
      { color: '#eab308', label: '0,2 a 0,4 (Vegetação esparsa)' },
      { color: '#15803d', label: '0,6 a 0,9+ (Dossel vigoroso)' },
    ],
  },
  {
    id: 'evi',
    label: 'EVI — Índice de Vegetação Realçado',
    category: 'orbital_nasa',
    source: 'NASA Earthdata · HLS L30/S30 & MODIS (LP DAAC)',
    resolution: '30 m (HLS) / 250 m (MODIS)',
    unavailableReason: 'Nenhuma extração EVI concluída para esta propriedade e período.',
    legendItems: [
      { color: '#ca8a04', label: '0,0 a 0,3 (Baixa biomassa)' },
      { color: '#65a30d', label: '0,3 a 0,6 (Crescimento médio)' },
      { color: '#166534', label: '0,6 a 1,0 (Alta biomassa)' },
    ],
  },
  {
    id: 'soil_moisture',
    label: 'Umidade do Solo (SMAP SPL4SMGP)',
    category: 'orbital_nasa',
    source: 'NASA SMAP L4 · SPL4SMGP.008 (NSIDC)',
    resolution: '9 km · Superficial (0–5 cm) e Radicular (0–100 cm)',
    unavailableReason: 'Nenhuma extração SMAP SPL4SMGP concluída para esta propriedade e período.',
    legendItems: [
      { color: '#d97706', label: '0,05 – 0,15 m³/m³ (Solo seco)' },
      { color: '#0ea5e9', label: '0,16 – 0,30 m³/m³ (Umidade moderada)' },
      { color: '#1d4ed8', label: '0,31 – 0,50 m³/m³ (Saturação)' },
    ],
  },
  {
    id: 'lst',
    label: 'Temperatura de Superfície (LST)',
    category: 'orbital_nasa',
    source: 'NASA ECOSTRESS · ECO_L2T_LSTE V002 (JPL / ISS)',
    resolution: '70 m · Kelvin → °C',
    unavailableReason: 'Nenhuma extração ECOSTRESS LST V002 concluída para esta propriedade e período.',
    legendItems: [
      { color: '#0284c7', label: '≤ 24 °C (Superfície fria)' },
      { color: '#f59e0b', label: '25 °C – 33 °C (Faixa moderada)' },
      { color: '#dc2626', label: '≥ 34 °C (Estresse térmico)' },
    ],
  },
];

function isOrbitalLayerId(id: MapLayerId): id is OrbitalSensorCategory {
  return id === 'ndvi' || id === 'evi' || id === 'soil_moisture' || id === 'lst';
}

function isoToAppeears(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${m}-${d}-${y}` : '10-01-2026';
}

function createSafePopupElement(title: string, lines: { label: string; value: string }[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.fontFamily = 'DM Sans, system-ui, sans-serif';
  wrapper.style.fontSize = '12px';
  wrapper.style.lineHeight = '1.45';
  wrapper.style.color = '#0f172a';
  wrapper.style.minWidth = '180px';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.fontWeight = '700';
  heading.style.color = '#0b1f3a';
  heading.style.marginBottom = '4px';
  wrapper.appendChild(heading);

  lines.forEach((item) => {
    const row = document.createElement('div');
    row.style.color = '#475569';
    const strong = document.createElement('strong');
    strong.textContent = `${item.label}: `;
    strong.style.color = '#1e293b';
    strong.style.fontWeight = '600';
    row.appendChild(strong);
    row.appendChild(document.createTextNode(item.value));
    wrapper.appendChild(row);
  });

  return wrapper;
}

export const MapModule: React.FC<MapModuleProps> = ({
  workspace,
  selectedPropertyId,
  onSelectProperty,
  onUpdatePropertyBoundary,
  onUpdatePlotPolygon,
}) => {
  const [enabledLayers, setEnabledLayers] = useState<Record<MapLayerId, boolean>>({
    osm_base: true,
    property_boundary: true,
    plot_geometry: true,
    ndvi: false,
    evi: false,
    soil_moisture: false,
    lst: false,
  });

  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(13);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [tileError, setTileError] = useState(false);

  // Estado orbital real (NASA HLS, MODIS, SMAP SPL4SMGP, ECOSTRESS ECO_L2T_LSTE)
  const [orbitalStartDate, setOrbitalStartDate] = useState('2026-09-15');
  const [orbitalEndDate, setOrbitalEndDate] = useState('2026-11-14');
  const [orbitalLoading, setOrbitalLoading] = useState(false);
  const [orbitalObservations, setOrbitalObservations] = useState<OrbitalObservationPoint[]>([]);
  const [orbitalTasks, setOrbitalTasks] = useState<TrackedExtractionTask[]>([]);
  const [selectedObsBySensor, setSelectedObsBySensor] = useState<
    Partial<Record<OrbitalSensorCategory, string>>
  >({});
  const [overlayStatus, setOverlayStatus] = useState<{
    loading: boolean;
    error: string | null;
    loadedLayers: Partial<
      Record<
        OrbitalSensorCategory,
        { obs: OrbitalObservationPoint; raster: DecodedRasterInfo }
      >
    >;
  }>({ loading: false, error: null, loadedLayers: {} });
  const [triggeringLayer, setTriggeringLayer] = useState<OrbitalSensorCategory | null>(null);
  const [triggerFeedback, setTriggerFeedback] = useState<string | null>(null);

  // Refs do Leaflet
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const orbitalRasterGroupRef = useRef<L.LayerGroup | null>(null);
  const boundaryGroupRef = useRef<L.LayerGroup | null>(null);
  const plotsGroupRef = useRef<L.LayerGroup | null>(null);
  const centroidGroupRef = useRef<L.LayerGroup | null>(null);
  const draftGroupRef = useRef<L.LayerGroup | null>(null);
  const lastCenteredPropertyIdRef = useRef<string | null>(null);

  // Modo interativo de desenho e edição de vértices no mapa
  const [interactionMode, setInteractionMode] = useState<'view' | 'draw_boundary' | 'edit_boundary'>('view');
  const [draftVertices, setDraftVertices] = useState<GeoPoint[]>([]);
  const [draftError, setDraftError] = useState<string | undefined>();
  const [savingDraft, setSavingDraft] = useState(false);

  // Modal de edição de polígono da propriedade por coordenadas/GeoJSON
  const [boundaryModalOpen, setBoundaryModalOpen] = useState(false);
  const [polygonText, setPolygonText] = useState('');
  const [polygonError, setPolygonError] = useState<string | undefined>();
  const [savingBoundary, setSavingBoundary] = useState(false);

  // Modal de edição de polígono do talhão selecionado
  const [plotBoundaryModalOpen, setPlotBoundaryModalOpen] = useState(false);
  const [plotPolygonText, setPlotPolygonText] = useState('');
  const [plotPolygonError, setPlotPolygonError] = useState<string | undefined>();
  const [savingPlotBoundary, setSavingPlotBoundary] = useState(false);

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const plots = useMemo(
    () =>
      activeProperty
        ? workspace.plots.filter((pl) => pl.propertyId === activeProperty.id)
        : [],
    [workspace.plots, activeProperty]
  );

  const selectedPlot: FieldPlot | undefined =
    plots.find((p) => p.id === selectedPlotId) ?? plots[0];

  const hasSavedBoundary = Boolean(
    activeProperty?.boundaryPolygon && activeProperty.boundaryPolygon.length >= 3
  );

  const geometryGate = useMemo(
    () => hasValidRealGeometry(activeProperty),
    [activeProperty]
  );

  const propertyCalcArea = geometryGate.valid ? geometryGate.areaHa ?? null : null;

  const draftAreaCalc = useMemo(() => {
    if (draftVertices.length < 3) return null;
    return calculatePolygonAreaHa(draftVertices);
  }, [draftVertices]);

  const selectedPlotCalcArea = useMemo(() => {
    if (!selectedPlot || selectedPlot.polygonSource === 'estimado_area') {
      return null;
    }
    const res = calculatePolygonAreaHa(selectedPlot.polygon);
    return res.valid ? res.areaHa : null;
  }, [selectedPlot]);

  const boundaryLivePreview = useMemo(() => {
    if (!polygonText.trim()) return null;
    const parsed = parsePolygonCoordinates(polygonText);
    if (parsed.error || parsed.points.length < 3) {
      return { error: parsed.error };
    }
    const area = calculatePolygonAreaHa(parsed.points);
    return { areaHa: area.areaHa, vertices: parsed.points.length };
  }, [polygonText]);

  const plotLivePreview = useMemo(() => {
    if (!plotPolygonText.trim()) return null;
    const parsed = parsePolygonCoordinates(plotPolygonText);
    if (parsed.error || parsed.points.length < 3) {
      return { error: parsed.error };
    }
    const area = calculatePolygonAreaHa(parsed.points);
    return { areaHa: area.areaHa, vertices: parsed.points.length };
  }, [plotPolygonText]);

  const fitMapToActiveProperty = useCallback(
    (map: L.Map, prop: Property, propPlots: FieldPlot[]) => {
      const coords: L.LatLngExpression[] = [];
      if (prop.boundaryPolygon && prop.boundaryPolygon.length >= 3) {
        prop.boundaryPolygon.forEach((pt) => coords.push([pt.lat, pt.lon]));
      }
      propPlots.forEach((pl) => {
        pl.polygon.forEach((pt) => coords.push([pt.lat, pt.lon]));
      });
      if (coords.length >= 2) {
        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      } else {
        map.setView([prop.centroid.lat, prop.centroid.lon], 14);
      }
    },
    []
  );

  // 1. Inicialização única do mapa Leaflet quando há container
  useEffect(() => {
    if (!mapContainerRef.current || !activeProperty || mapInstanceRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [activeProperty.centroid.lat, activeProperty.centroid.lon],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    const orbitalGroup = L.layerGroup().addTo(map);
    const boundaryGroup = L.layerGroup().addTo(map);
    const plotsGroup = L.layerGroup().addTo(map);
    const centroidGroup = L.layerGroup().addTo(map);
    const draftGroup = L.layerGroup().addTo(map);

    orbitalRasterGroupRef.current = orbitalGroup;
    boundaryGroupRef.current = boundaryGroup;
    plotsGroupRef.current = plotsGroup;
    centroidGroupRef.current = centroidGroup;
    draftGroupRef.current = draftGroup;
    mapInstanceRef.current = map;

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
    });
    map.on('mouseout', () => {
      setCursorCoords(null);
    });

    setZoomLevel(map.getZoom());

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      orbitalRasterGroupRef.current = null;
      boundaryGroupRef.current = null;
      plotsGroupRef.current = null;
      centroidGroupRef.current = null;
      draftGroupRef.current = null;
      lastCenteredPropertyIdRef.current = null;
    };
    // Inicializa apenas uma vez quando houver propriedade ativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(activeProperty)]);

  // 2. Controle independente da camada mapa-base OpenStreetMap e tratamento de erro dos tiles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (enabledLayers.osm_base) {
      if (!tileLayerRef.current) {
        const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });
        let failedCount = 0;
        layer.on('tileerror', () => {
          failedCount += 1;
          if (failedCount >= 2) {
            setTileError(true);
          }
        });
        layer.on('tileload', () => {
          failedCount = 0;
          setTileError(false);
        });
        layer.addTo(map);
        tileLayerRef.current = layer;
      }
    } else if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
      setTileError(false);
    }
  }, [enabledLayers.osm_base, activeProperty?.id]);

  // 3. Reenquadramento automático ao trocar de propriedade
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeProperty) return;
    if (lastCenteredPropertyIdRef.current !== activeProperty.id) {
      fitMapToActiveProperty(map, activeProperty, plots);
      lastCenteredPropertyIdRef.current = activeProperty.id;
      setZoomLevel(map.getZoom());
    }
  }, [activeProperty, plots, fitMapToActiveProperty]);

  // 3b. Captura de cliques no mapa durante o modo de desenho
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (interactionMode !== 'draw_boundary') return;
      const newPt: GeoPoint = {
        lat: Number(e.latlng.lat.toFixed(6)),
        lon: Number(e.latlng.lng.toFixed(6)),
      };
      setDraftError(undefined);
      setDraftVertices((prev) => [...prev, newPt]);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [interactionMode]);

  // 3c. Renderização da geometria em desenho / edição interativa (vértices arrastáveis + pontos médios)
  useEffect(() => {
    const draftGroup = draftGroupRef.current;
    if (!draftGroup) return;

    draftGroup.clearLayers();
    if (interactionMode === 'view') return;

    if (draftVertices.length >= 2) {
      const latLngs: L.LatLngExpression[] = draftVertices.map((pt) => [pt.lat, pt.lon]);
      if (draftVertices.length >= 3) {
        L.polygon(latLngs, {
          color: '#0284c7',
          weight: 2.5,
          dashArray: '6 4',
          fillColor: '#0ea5e9',
          fillOpacity: 0.18,
          interactive: false,
        }).addTo(draftGroup);
      } else {
        L.polyline(latLngs, {
          color: '#0284c7',
          weight: 2.5,
          dashArray: '6 4',
          interactive: false,
        }).addTo(draftGroup);
      }
    }

    // Pontos médios para inserir novos vértices durante a edição
    if (interactionMode === 'edit_boundary' && draftVertices.length >= 3) {
      draftVertices.forEach((pt, idx) => {
        const next = draftVertices[(idx + 1) % draftVertices.length];
        const midLat = Number(((pt.lat + next.lat) / 2).toFixed(6));
        const midLon = Number(((pt.lon + next.lon) / 2).toFixed(6));
        const midIcon = L.divIcon({
          className: 'agrolynx-mid-handle',
          html: '<div style="width:12px;height:12px;border-radius:9999px;background:#ffffff;border:2px solid #0284c7;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:#0284c7;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.3);">+</div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const midMarker = L.marker([midLat, midLon], {
          icon: midIcon,
          title: 'Clique para inserir novo vértice nesta aresta',
        });
        midMarker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          setDraftError(undefined);
          setDraftVertices((prev) => {
            const copy = [...prev];
            copy.splice(idx + 1, 0, { lat: midLat, lon: midLon });
            return copy;
          });
        });
        midMarker.addTo(draftGroup);
      });
    }

    // Marcadores arrastáveis para cada vértice do rascunho
    draftVertices.forEach((pt, idx) => {
      const vertexIcon = L.divIcon({
        className: 'agrolynx-vertex-handle',
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#0b1f3a;color:#ffffff;border:2px solid #38bdf8;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.4);">${idx + 1}</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([pt.lat, pt.lon], {
        icon: vertexIcon,
        draggable: true,
        title: `Vértice ${idx + 1}: arraste para mover ou clique direito para remover`,
      });

      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        setDraftError(undefined);
        setDraftVertices((prev) =>
          prev.map((item, i) =>
            i === idx
              ? { lat: Number(ll.lat.toFixed(6)), lon: Number(ll.lng.toFixed(6)) }
              : item
          )
        );
      });

      marker.on('contextmenu', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (draftVertices.length <= 3 && interactionMode === 'edit_boundary') {
          setDraftError('Um polígono precisa manter ao menos 3 vértices.');
          return;
        }
        setDraftError(undefined);
        setDraftVertices((prev) => prev.filter((_, i) => i !== idx));
      });

      marker.addTo(draftGroup);
    });
  }, [interactionMode, draftVertices]);

  // 4. Desenho das camadas vetoriais (perímetro, talhões e centróide)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const boundaryGroup = boundaryGroupRef.current;
    const plotsGroup = plotsGroupRef.current;
    const centroidGroup = centroidGroupRef.current;

    if (!map || !boundaryGroup || !plotsGroup || !centroidGroup || !activeProperty) {
      return;
    }

    boundaryGroup.clearLayers();
    plotsGroup.clearLayers();
    centroidGroup.clearLayers();

    const unit = workspace.preferences.areaUnit;

    // Camada: Perímetro da Propriedade (oculta estático enquanto edita/desenha para evitar sobreposição)
    if (
      interactionMode === 'view' &&
      enabledLayers.property_boundary &&
      activeProperty.boundaryPolygon &&
      activeProperty.boundaryPolygon.length >= 3
    ) {
      const isEstimated = activeProperty.boundarySource === 'estimado_area';
      const polyLatLngs: L.LatLngExpression[] = activeProperty.boundaryPolygon.map((pt) => [
        pt.lat,
        pt.lon,
      ]);

      const boundaryPoly = L.polygon(polyLatLngs, {
        color: isEstimated ? '#d97706' : '#0284c7',
        weight: 2.5,
        dashArray: isEstimated ? '6 6' : undefined,
        fillColor: isEstimated ? '#f59e0b' : '#0ea5e9',
        fillOpacity: 0.1,
      });

      const popupLines = [
        { label: 'Município', value: `${activeProperty.municipality}/${activeProperty.state}` },
        { label: 'Área informada (manual)', value: formatArea(activeProperty.totalAreaHa, unit) },
        {
          label: 'Área calculada (polígono)',
          value: isEstimated
            ? 'Não aplicada (referência estimada)'
            : propertyCalcArea !== null
            ? formatArea(propertyCalcArea, unit)
            : 'Polígono inválido',
        },
        { label: 'Vértices', value: `${activeProperty.boundaryPolygon.length} pontos` },
      ];
      boundaryPoly.bindPopup(createSafePopupElement(`Perímetro: ${activeProperty.name}`, popupLines));
      boundaryPoly.addTo(boundaryGroup);
    }

    // Camada: Geometria dos Talhões
    if (enabledLayers.plot_geometry) {
      plots.forEach((plot) => {
        if (plot.polygon.length < 3) return;
        const isSelected = selectedPlot?.id === plot.id;
        const isEstimated = plot.polygonSource === 'estimado_area';
        const calc = !isEstimated ? calculatePolygonAreaHa(plot.polygon) : null;

        const poly = L.polygon(
          plot.polygon.map((pt) => [pt.lat, pt.lon] as L.LatLngExpression),
          {
            color: isSelected ? '#16a34a' : isEstimated ? '#d97706' : '#15803d',
            weight: isSelected ? 3 : 2,
            dashArray: isEstimated ? '5 5' : undefined,
            fillColor: isSelected ? '#22c55e' : isEstimated ? '#fbbf24' : '#16a34a',
            fillOpacity: isSelected ? 0.36 : 0.2,
          }
        );

        poly.on('click', () => {
          setSelectedPlotId(plot.id);
        });

        const tooltipArea =
          calc?.valid && calc.areaHa !== null
            ? `${formatArea(calc.areaHa, unit)} calc.`
            : `${formatArea(plot.areaHa, unit)} manual`;
        poly.bindTooltip(`${plot.code} · ${tooltipArea}`, {
          direction: 'center',
          sticky: true,
        });

        poly.bindPopup(
          createSafePopupElement(`${plot.code} — ${plot.name}`, [
            { label: 'Área informada (manual)', value: formatArea(plot.areaHa, unit) },
            {
              label: 'Área calculada (polígono)',
              value: isEstimated
                ? 'Sem vértices reais (referência estimada)'
                : calc?.valid && calc.areaHa !== null
                ? formatArea(calc.areaHa, unit)
                : 'Polígono inválido',
            },
            { label: 'Solo', value: plot.soilTextureClass },
            { label: 'Vértices', value: `${plot.polygon.length} pontos` },
          ])
        );

        poly.addTo(plotsGroup);
      });
    }

    // Marcador do Centróide da Propriedade
    if (enabledLayers.property_boundary || (!hasSavedBoundary && plots.length === 0)) {
      const centroidIcon = L.divIcon({
        className: 'agrolynx-centroid-pin',
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:#facc15;border:3px solid #0b1f3a;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([activeProperty.centroid.lat, activeProperty.centroid.lon], {
        icon: centroidIcon,
        title: `Centróide: ${activeProperty.name}`,
      });

      marker.bindPopup(
        createSafePopupElement(`Centróide — ${activeProperty.name}`, [
          {
            label: 'Coordenadas',
            value: `${formatCoord(activeProperty.centroid.lat, 'lat')} · ${formatCoord(
              activeProperty.centroid.lon,
              'lon'
            )}`,
          },
          { label: 'Área informada (manual)', value: formatArea(activeProperty.totalAreaHa, unit) },
          {
            label: 'Área calculada (polígono)',
            value:
              propertyCalcArea !== null
                ? formatArea(propertyCalcArea, unit)
                : 'Sem perímetro real salvo',
          },
        ])
      );

      marker.addTo(centroidGroup);
    }
  }, [
    activeProperty,
    plots,
    selectedPlot?.id,
    enabledLayers.property_boundary,
    enabledLayers.plot_geometry,
    hasSavedBoundary,
    propertyCalcArea,
    workspace.preferences.areaUnit,
    interactionMode,
  ]);

  // 5. Carregamento real das observações orbitais NASA para a propriedade e período
  const loadPropertyOrbitalData = useCallback(async () => {
    if (!activeProperty) {
      setOrbitalObservations([]);
      setOrbitalTasks([]);
      return;
    }
    setOrbitalLoading(true);
    try {
      const res = await nasaClient.getObservations({
        propertyId: activeProperty.id,
        lat: activeProperty.centroid.lat,
        lon: activeProperty.centroid.lon,
        startDate: orbitalStartDate,
        endDate: orbitalEndDate,
        sensor: 'all',
      });
      setOrbitalObservations(res.observations || []);
      setOrbitalTasks(res.tasks || []);
    } catch {
      setOrbitalObservations([]);
    } finally {
      setOrbitalLoading(false);
    }
  }, [activeProperty, orbitalStartDate, orbitalEndDate]);

  useEffect(() => {
    loadPropertyOrbitalData();
  }, [loadPropertyOrbitalData]);

  const observationsBySensor = useMemo(() => {
    const grouped: Record<OrbitalSensorCategory, OrbitalObservationPoint[]> = {
      ndvi: [],
      evi: [],
      soil_moisture: [],
      lst: [],
    };
    for (const obs of orbitalObservations) {
      grouped[obs.sensorKey].push(obs);
    }
    return grouped;
  }, [orbitalObservations]);

  const activeOrbitalSensors = useMemo(
    () =>
      (['ndvi', 'evi', 'soil_moisture', 'lst'] as OrbitalSensorCategory[]).filter(
        (id) => enabledLayers[id]
      ),
    [enabledLayers]
  );

  // 6. Decodificação e renderização real dos GeoTIFFs NASA sobre o mapa Leaflet
  useEffect(() => {
    let cancelled = false;
    const orbitalGroup = orbitalRasterGroupRef.current;
    if (!orbitalGroup) return;

    orbitalGroup.clearLayers();
    if (activeOrbitalSensors.length === 0) {
      setOverlayStatus({ loading: false, error: null, loadedLayers: {} });
      return;
    }

    const targetGroup = orbitalGroup;
    async function loadOverlays() {
      setOverlayStatus((prev) => ({ ...prev, loading: true, error: null }));
      const nextLoaded: Partial<
        Record<OrbitalSensorCategory, { obs: OrbitalObservationPoint; raster: DecodedRasterInfo }>
      > = {};
      let firstError: string | null = null;

      for (const sensor of activeOrbitalSensors) {
        const list = observationsBySensor[sensor];
        if (list.length === 0) continue;
        const chosenKey = selectedObsBySensor[sensor];
        const chosen =
          (chosenKey
            ? list.find((o) => `${o.taskId}::${o.observedAt}::${o.dataset}` === chosenKey)
            : undefined) ?? list[list.length - 1];
        if (!chosen?.geotiffFileId) continue;

        try {
          const resp = await fetch(
            `/api/nasa/appeears/bundle/${encodeURIComponent(chosen.taskId)}/file/${encodeURIComponent(
              chosen.geotiffFileId
            )}`,
            { signal: AbortSignal.timeout(25000) }
          );
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          const buf = await resp.arrayBuffer();
          const raster = await decodeGeoTiffRaster(
            buf,
            chosen.geotiffFileName || chosen.fileName,
            { createDataUrl: true }
          );
          if (cancelled) return;
          if (raster.dataUrl && raster.validCount > 0) {
            const [west, south, east, north] = raster.bbox;
            const overlay = L.imageOverlay(
              raster.dataUrl,
              [
                [south, west],
                [north, east],
              ],
              { opacity: 0.78, interactive: false }
            );
            overlay.addTo(targetGroup);
            nextLoaded[sensor] = { obs: chosen, raster };
          }
        } catch (err) {
          if (!firstError) {
            firstError =
              err instanceof Error
                ? `Falha ao carregar GeoTIFF ${sensor.toUpperCase()}: ${err.message}`
                : `Falha ao carregar GeoTIFF ${sensor.toUpperCase()}.`;
          }
        }
      }

      if (!cancelled) {
        setOverlayStatus({ loading: false, error: firstError, loadedLayers: nextLoaded });
      }
    }

    loadOverlays();
    return () => {
      cancelled = true;
    };
  }, [activeOrbitalSensors, observationsBySensor, selectedObsBySensor]);

  const handleTriggerOrbitalExtraction = async (sensor: OrbitalSensorCategory) => {
    if (!activeProperty || !geometryGate.valid) return;
    setTriggeringLayer(sensor);
    setTriggerFeedback(null);
    try {
      const cfg =
        sensor === 'ndvi'
          ? {
              profileKey: 'hls_ndvi' as const,
              product: 'HLSS30_VI.020',
              layers: ['NDVI'],
              layerSpecs: [
                { product: 'HLSS30_VI.020', layer: 'NDVI' },
                { product: 'HLSL30_VI.020', layer: 'NDVI' },
              ],
              start: orbitalStartDate,
              end: orbitalEndDate,
            }
          : sensor === 'evi'
          ? {
              profileKey: 'hls_evi' as const,
              product: 'HLSS30_VI.020',
              layers: ['EVI'],
              layerSpecs: [
                { product: 'HLSS30_VI.020', layer: 'EVI' },
                { product: 'HLSL30_VI.020', layer: 'EVI' },
              ],
              start: orbitalStartDate,
              end: orbitalEndDate,
            }
          : sensor === 'soil_moisture'
          ? {
              profileKey: 'smap_spl4smgp' as const,
              product: 'SPL4SMGP.008',
              layers: ['Geophysical_Data_sm_surface', 'Geophysical_Data_sm_rootzone'],
              start: '2026-11-08',
              end: orbitalEndDate,
            }
          : {
              profileKey: 'ecostress_lst' as const,
              product: 'ECO_L2T_LSTE.002',
              layers: ['LST', 'cloud'],
              start: orbitalStartDate,
              end: orbitalEndDate,
            };

      const res = await nasaClient.requestAppeearsExtraction({
        property: activeProperty,
        profileKey: cfg.profileKey,
        product: cfg.product,
        layers: cfg.layers,
        layerSpecs: cfg.layerSpecs,
        startDate: isoToAppeears(cfg.start),
        endDate: isoToAppeears(cfg.end),
      });
      setTriggerFeedback(`${cfg.product}: ${res.message}`);
      await loadPropertyOrbitalData();
    } catch (err) {
      setTriggerFeedback(
        err instanceof Error ? err.message : 'Erro ao solicitar extração NASA AppEEARS.'
      );
    } finally {
      setTriggeringLayer(null);
    }
  };

  const toggleLayer = (id: MapLayerId) => {
    setEnabledLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRetryTiles = () => {
    setTileError(false);
    tileLayerRef.current?.redraw();
  };

  const getLayerRuntimeStatus = (layer: LayerDefinition) => {
    if (layer.category === 'mapa_base') {
      if (!enabledLayers.osm_base) {
        return {
          label: 'Desativado',
          tone: 'text-slate-500',
          imageDate: 'Camada oculta pelo usuário',
          operational: true,
        };
      }
      if (tileError) {
        return {
          label: 'Falha nos tiles',
          tone: 'text-amber-700',
          imageDate: 'Rede indisponível / bloqueada',
          operational: false,
        };
      }
      return {
        label: 'Operacional',
        tone: 'text-agro-700',
        imageDate: 'Tiles ao vivo (OpenStreetMap)',
        operational: true,
      };
    }
    if (isOrbitalLayerId(layer.id)) {
      const obsList = observationsBySensor[layer.id];
      const loaded = overlayStatus.loadedLayers[layer.id];
      const pendingTask = orbitalTasks.find((t) => {
        if (t.taskStatus === 'done' || t.taskStatus === 'error') return false;
        if (layer.id === 'ndvi') return t.profileKey === 'hls_ndvi' || t.profileKey === 'modis_ndvi';
        if (layer.id === 'evi') return t.profileKey === 'hls_evi' || t.profileKey === 'modis_evi';
        if (layer.id === 'soil_moisture')
          return t.profileKey === 'smap_spl4smgp' || t.profileKey === 'smap_moisture';
        return t.profileKey === 'ecostress_lst';
      });

      if (obsList.length > 0) {
        const latest = loaded?.obs ?? obsList[obsList.length - 1];
        const dateLabel = latest.observedAt.includes('T')
          ? formatDateTimeBr(latest.observedAt)
          : formatDateBr(latest.date);
        return {
          label: `Dados reais (${obsList.length})`,
          tone: 'text-agro-700',
          imageDate: `${dateLabel} · Média: ${latest.mean} ${latest.unit} (${latest.sourceLabel})`,
          operational: true,
        };
      }
      if (pendingTask) {
        return {
          label: `Fila NASA (${pendingTask.taskStatus})`,
          tone: 'text-amber-700',
          imageDate: `Tarefa ${pendingTask.taskId.slice(0, 8)}… em processamento no AppEEARS`,
          operational: false,
        };
      }
      return {
        label: 'Sem extração local',
        tone: 'text-amber-700',
        imageDate: 'Nenhuma cena extraída nesta propriedade/período',
        operational: false,
      };
    }
    if (layer.id === 'property_boundary') {
      if (hasSavedBoundary) {
        return {
          label:
            activeProperty.boundarySource === 'estimado_area'
              ? 'Ref. estimada'
              : 'Operacional',
          tone:
            activeProperty.boundarySource === 'estimado_area'
              ? 'text-amber-700'
              : 'text-agro-700',
          imageDate: `Cadastro ${formatDateBr(activeProperty.createdAt)}`,
          operational: activeProperty.boundarySource !== 'estimado_area',
        };
      }
      return {
        label: 'Sem polígono salvo',
        tone: 'text-amber-700',
        imageDate: `Centróide ${formatDateBr(activeProperty.createdAt)}`,
        operational: false,
      };
    }
    if (plots.length > 0) {
      return {
        label: 'Operacional',
        tone: 'text-agro-700',
        imageDate: `Cadastro ${formatDateBr(activeProperty.createdAt)}`,
        operational: true,
      };
    }
    return {
      label: 'Sem talhões',
      tone: 'text-slate-500',
      imageDate: 'Nenhum talhão cadastrado',
      operational: false,
    };
  };

  const activeUnavailableOrbitalLayers = MAP_LAYERS.filter(
    (l) =>
      isOrbitalLayerId(l.id) &&
      enabledLayers[l.id] &&
      observationsBySensor[l.id].length === 0
  );
  const activeLayerObjects = MAP_LAYERS.filter((l) => enabledLayers[l.id]);
  const linkedCrop = selectedPlot
    ? workspace.crops.find((c) => c.plotId === selectedPlot.id)
    : undefined;

  const startDrawMode = () => {
    setDraftError(undefined);
    setDraftVertices([]);
    setInteractionMode('draw_boundary');
  };

  const startEditMode = () => {
    if (!activeProperty?.boundaryPolygon || activeProperty.boundaryPolygon.length < 3) return;
    setDraftError(undefined);
    setDraftVertices(activeProperty.boundaryPolygon.map((pt) => ({ ...pt })));
    setInteractionMode('edit_boundary');
  };

  const cancelInteractiveMode = () => {
    setInteractionMode('view');
    setDraftVertices([]);
    setDraftError(undefined);
  };

  const handleSaveInteractivePolygon = async () => {
    if (!activeProperty) return;
    if (draftVertices.length < 3) {
      setDraftError('Marque pelo menos 3 vértices no mapa para formar um polígono válido.');
      return;
    }
    const calc = calculatePolygonAreaHa(draftVertices);
    if (!calc.valid || calc.areaHa === null) {
      setDraftError(calc.error || 'Polígono inválido.');
      return;
    }
    setSavingDraft(true);
    try {
      await onUpdatePropertyBoundary(activeProperty.id, draftVertices, 'usuario_geo');
      setInteractionMode('view');
      setDraftVertices([]);
      setDraftError(undefined);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Erro ao salvar perímetro.');
    } finally {
      setSavingDraft(false);
    }
  };

  const openBoundaryEditor = () => {
    if (!activeProperty) return;
    setPolygonError(undefined);
    setPolygonText(
      activeProperty.boundaryPolygon?.map((pt) => `${pt.lat}, ${pt.lon}`).join('\n') || ''
    );
    setBoundaryModalOpen(true);
  };

  const handleSaveBoundary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProperty) return;
    const parsed = parsePolygonCoordinates(polygonText);
    if (parsed.error || parsed.points.length < 3) {
      setPolygonError(
        parsed.error || 'Informe ao menos 3 vértices (latitude, longitude) ou GeoJSON.'
      );
      return;
    }
    setSavingBoundary(true);
    try {
      await onUpdatePropertyBoundary(activeProperty.id, parsed.points, 'usuario_geo');
      setBoundaryModalOpen(false);
    } finally {
      setSavingBoundary(false);
    }
  };

  const openPlotBoundaryEditor = () => {
    if (!selectedPlot) return;
    setPlotPolygonError(undefined);
    setPlotPolygonText(
      selectedPlot.polygon.map((pt) => `${pt.lat}, ${pt.lon}`).join('\n')
    );
    setPlotBoundaryModalOpen(true);
  };

  const handleSavePlotBoundary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlot) return;
    const parsed = parsePolygonCoordinates(plotPolygonText);
    if (parsed.error || parsed.points.length < 3) {
      setPlotPolygonError(
        parsed.error || 'Informe ao menos 3 vértices (latitude, longitude) ou GeoJSON.'
      );
      return;
    }
    setSavingPlotBoundary(true);
    try {
      await onUpdatePlotPolygon(selectedPlot.id, parsed.points, 'usuario_geo');
      setPlotBoundaryModalOpen(false);
    } finally {
      setSavingPlotBoundary(false);
    }
  };

  if (!activeProperty) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-navy-900 font-display">Mapa Agrícola</h1>
        <EmptyState
          title="Nenhuma propriedade selecionada"
          description="Cadastre uma propriedade rural no módulo Propriedades para visualizar o mapa georreferenciado."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Seletor de Propriedade */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Mapa Agrícola e Monitoramento Geoespacial
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Mapa geográfico interativo OpenStreetMap (EPSG:4326) com cálculo geodésico de área
            por polígono e camadas independentes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="map-prop-select" className="text-xs font-medium text-slate-600">
            Propriedade:
          </label>
          <select
            id="map-prop-select"
            value={activeProperty.id}
            onChange={(e) => {
              onSelectProperty(e.target.value);
              setSelectedPlotId(null);
              cancelInteractiveMode();
            }}
            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-navy-900"
          >
            {workspace.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            variant={interactionMode === 'draw_boundary' ? 'primary' : 'outline'}
            size="sm"
            onClick={interactionMode === 'draw_boundary' ? cancelInteractiveMode : startDrawMode}
            icon={<PenTool className="w-3.5 h-3.5" />}
          >
            {interactionMode === 'draw_boundary' ? 'Sair do desenho' : 'Desenhar no mapa'}
          </Button>
          {hasSavedBoundary && (
            <Button
              variant={interactionMode === 'edit_boundary' ? 'primary' : 'outline'}
              size="sm"
              onClick={interactionMode === 'edit_boundary' ? cancelInteractiveMode : startEditMode}
              icon={<Pencil className="w-3.5 h-3.5" />}
            >
              {interactionMode === 'edit_boundary' ? 'Sair da edição' : 'Editar vértices'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={openBoundaryEditor}
            icon={<Pencil className="w-3.5 h-3.5" />}
          >
            Coordenadas / GeoJSON
          </Button>
        </div>
      </div>

      {/* Diagnóstico Geográfico e Comparativo de Área */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Polígono da propriedade</p>
          <p className="text-sm font-semibold text-navy-900 mt-1">
            {hasSavedBoundary
              ? `Salvo (${activeProperty.boundaryPolygon?.length} vértices)`
              : 'Não salvo (apenas centróide)'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {hasSavedBoundary
              ? activeProperty.boundarySource === 'usuario_geo'
                ? 'Origem: Geometria do usuário'
                : activeProperty.boundarySource === 'estimado_area'
                ? 'Atenção: Referência estimada (não real)'
                : 'Origem: Exemplo demonstrativo'
              : 'Desenhe no mapa ou cole GeoJSON'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Área calculada (polígono) vs. manual</p>
          <p className="text-sm font-semibold font-mono tabular-nums text-agro-700 mt-1">
            {propertyCalcArea !== null
              ? formatArea(propertyCalcArea, workspace.preferences.areaUnit)
              : 'Sem polígono real'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
            Manual declarada:{' '}
            {formatArea(activeProperty.totalAreaHa, workspace.preferences.areaUnit)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Centróide da propriedade</p>
          <p className="text-xs font-mono tabular-nums font-semibold text-navy-900 mt-1">
            {formatCoord(activeProperty.centroid.lat, 'lat')} ·{' '}
            {formatCoord(activeProperty.centroid.lon, 'lon')}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {plots.length} talhão(ões) georreferenciado(s)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Aptidão para consultas NASA</p>
          <p
            className={`text-sm font-semibold mt-1 ${
              geometryGate.valid ? 'text-agro-700' : 'text-amber-700'
            }`}
          >
            {geometryGate.valid ? 'Geometria válida (POWER + CMR)' : 'Bloqueado (sem polígono)'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {geometryGate.valid
              ? 'Pronta para consultas históricas e catálogo orbital'
              : 'Cadastre/desenhe um perímetro real válido'}
          </p>
        </div>
      </div>

      {/* Barra de Controle do Modo Desenho / Edição no Mapa */}
      {interactionMode !== 'view' && (
        <div
          role="region"
          aria-label="Controles de desenho e edição de perímetro"
          className="rounded-xl border border-sky-300 bg-sky-50/90 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-navy-900">
                {interactionMode === 'draw_boundary'
                  ? 'Modo desenho ativo: clique no mapa para marcar os vértices do perímetro'
                  : 'Modo edição de vértices: arraste os pontos numerados, clique no (+) para adicionar ou clique direito para remover'}
              </p>
              <p className="text-xs text-slate-700 font-mono tabular-nums">
                Vértices marcados: {draftVertices.length}
                {draftAreaCalc && draftAreaCalc.valid && draftAreaCalc.areaHa !== null
                  ? ` · Área calculada (Turf.js): ${formatArea(
                      draftAreaCalc.areaHa,
                      workspace.preferences.areaUnit
                    )}`
                  : draftAreaCalc && !draftAreaCalc.valid && draftVertices.length >= 3
                  ? ` · Atenção: ${draftAreaCalc.error}`
                  : ' · Marque ao menos 3 vértices'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {interactionMode === 'draw_boundary' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={draftVertices.length === 0}
                    onClick={() => setDraftVertices((prev) => prev.slice(0, -1))}
                    icon={<Undo2 className="w-3.5 h-3.5" />}
                  >
                    Desfazer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={draftVertices.length === 0}
                    onClick={() => setDraftVertices([])}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Limpar
                  </Button>
                </>
              )}
              {interactionMode === 'edit_boundary' && activeProperty.boundaryPolygon && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraftVertices(activeProperty.boundaryPolygon!.map((pt) => ({ ...pt })))
                  }
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Restaurar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={cancelInteractiveMode}
                icon={<X className="w-3.5 h-3.5" />}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={savingDraft}
                disabled={draftVertices.length < 3}
                onClick={handleSaveInteractivePolygon}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Salvar perímetro
              </Button>
            </div>
          </div>

          {draftError && (
            <p className="text-xs font-medium text-rose-700">{draftError}</p>
          )}
        </div>
      )}

      {/* Aviso de falha no carregamento de tiles OpenStreetMap sem quebrar o mapa */}
      {tileError && enabledLayers.osm_base && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-slate-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-navy-900">
                Falha ao carregar alguns tiles do mapa-base OpenStreetMap
              </p>
              <p className="text-slate-700">
                Verifique sua conectividade ou bloqueios de rede. Os polígonos vetoriais e o
                centróide continuam operacionais sobre a projeção geográfica.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetryTiles}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Recarregar tiles
          </Button>
        </div>
      )}

      {/* Controles reais de período e seleção de cena orbital sobre o mapa */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-navy-900">
              <Calendar className="w-4 h-4 text-agro-700" />
              Período das camadas orbitais NASA:
            </span>
            <input
              type="date"
              aria-label="Data inicial orbital no mapa"
              value={orbitalStartDate}
              max={orbitalEndDate}
              onChange={(e) => setOrbitalStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-navy-900"
            />
            <span className="text-slate-500">até</span>
            <input
              type="date"
              aria-label="Data final orbital no mapa"
              value={orbitalEndDate}
              min={orbitalStartDate}
              onChange={(e) => setOrbitalEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-navy-900"
            />
          </div>

          <div className="flex items-center gap-2">
            {(orbitalLoading || overlayStatus.loading) && (
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-agro-700" />
                Carregando raster GeoTIFF...
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              loading={orbitalLoading}
              onClick={loadPropertyOrbitalData}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Atualizar camadas NASA
            </Button>
          </div>
        </div>

        {activeOrbitalSensors.some((s) => observationsBySensor[s].length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            {activeOrbitalSensors.map((sensor) => {
              const list = observationsBySensor[sensor];
              if (list.length === 0) return null;
              const currentKey =
                selectedObsBySensor[sensor] ??
                `${list[list.length - 1].taskId}::${list[list.length - 1].observedAt}::${
                  list[list.length - 1].dataset
                }`;
              const loaded = overlayStatus.loadedLayers[sensor];
              return (
                <div key={sensor} className="space-y-1">
                  <label className="font-medium text-slate-700 block">
                    Cena / Data exibida no mapa ({sensor.toUpperCase()}):
                  </label>
                  <select
                    value={currentKey}
                    onChange={(e) =>
                      setSelectedObsBySensor((prev) => ({
                        ...prev,
                        [sensor]: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-navy-900"
                  >
                    {[...list].reverse().map((obs) => {
                      const val = `${obs.taskId}::${obs.observedAt}::${obs.dataset}`;
                      const dt = obs.observedAt.includes('T')
                        ? formatDateTimeBr(obs.observedAt)
                        : formatDateBr(obs.date);
                      return (
                        <option key={val} value={val}>
                          {dt} · {obs.dataset} · Média {obs.mean} {obs.unit} ({obs.product})
                        </option>
                      );
                    })}
                  </select>
                  {loaded && (
                    <p className="font-mono text-[11px] text-agro-700">
                      Overlay GeoTIFF ativo: {loaded.raster.width}×{loaded.raster.height} px (
                      {loaded.raster.validCount} válidos) · Média raster:{' '}
                      {loaded.raster.mean !== null ? loaded.raster.mean.toFixed(3) : '—'}{' '}
                      {loaded.raster.unitLabel}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {overlayStatus.error && (
          <p className="text-rose-700 font-medium">{overlayStatus.error}</p>
        )}
        {triggerFeedback && (
          <p className="text-navy-900 font-medium">{triggerFeedback}</p>
        )}
      </div>

      {/* Aviso explícito quando camadas orbitais ainda não têm extração concluída nesta propriedade/período */}
      {activeUnavailableOrbitalLayers.length > 0 && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-slate-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-navy-900">
                Camadas orbitais ativadas sem GeoTIFF concluído nesta propriedade/período (
                {activeUnavailableOrbitalLayers.length})
              </p>
              <p className="text-slate-700 leading-relaxed">
                {activeUnavailableOrbitalLayers.map((l) => l.label).join(', ')} — nenhum raster
                simulado é desenhado. Solicite a extração real AppEEARS ou atualize as tarefas em
                processamento.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeUnavailableOrbitalLayers.map((l) => {
              if (!isOrbitalLayerId(l.id)) return null;
              const sid = l.id;
              return (
                <Button
                  key={sid}
                  variant="outline"
                  size="sm"
                  disabled={!geometryGate.valid}
                  loading={triggeringLayer === sid}
                  onClick={() => handleTriggerOrbitalExtraction(sid)}
                  icon={<Play className="w-3 h-3" />}
                >
                  Extrair {sid.toUpperCase()}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Mapa Interativo Leaflet + Legenda */}
        <div className="lg:col-span-8 space-y-6">
          <DataCard
            noPadding
            title={activeProperty.name}
            subtitle={`${activeProperty.municipality}/${activeProperty.state} · Manual: ${formatArea(
              activeProperty.totalAreaHa,
              workspace.preferences.areaUnit
            )}${
              propertyCalcArea !== null
                ? ` · Calculada (polígono): ${formatArea(
                    propertyCalcArea,
                    workspace.preferences.areaUnit
                  )}`
                : ''
            }`}
            action={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => mapInstanceRef.current?.zoomOut()}
                  aria-label="Reduzir zoom"
                  className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current && activeProperty) {
                      fitMapToActiveProperty(mapInstanceRef.current, activeProperty, plots);
                      setZoomLevel(mapInstanceRef.current.getZoom());
                    }
                  }}
                  aria-label="Centralizar na propriedade"
                  title="Centralizar na propriedade"
                  className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mapInstanceRef.current?.zoomIn()}
                  aria-label="Aumentar zoom"
                  className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            }
          >
            <div className="relative overflow-hidden rounded-b-xl">
              <div
                ref={mapContainerRef}
                className={`relative z-0 w-full h-[380px] sm:h-[480px] ${
                  enabledLayers.osm_base ? 'bg-slate-200' : 'bg-navy-950'
                } ${interactionMode === 'draw_boundary' ? 'cursor-crosshair' : ''}`}
                aria-label={`Mapa geográfico interativo da propriedade ${activeProperty.name}`}
              />

              {/* Barra inferior: Coordenadas + Nível de Zoom + Datum */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-navy-900 border-t border-navy-800 text-xs text-slate-300 font-mono tabular-nums">
                <span>
                  {cursorCoords
                    ? `Cursor: ${formatCoord(cursorCoords.lat, 'lat')} · ${formatCoord(
                        cursorCoords.lon,
                        'lon'
                      )}`
                    : `Centróide: ${formatCoord(activeProperty.centroid.lat, 'lat')} · ${formatCoord(
                        activeProperty.centroid.lon,
                        'lon'
                      )}`}
                </span>
                <div className="flex items-center gap-4">
                  <span>WGS84 / EPSG:4326</span>
                  <span>Zoom: {zoomLevel}</span>
                </div>
              </div>
            </div>
          </DataCard>

          {/* Painel de Legenda, Data da Imagem e Fonte das Camadas Ativadas */}
          <DataCard
            title="Legenda, Fonte e Data das Camadas Ativadas"
            subtitle="Detalhamento transparente de cada camada atualmente marcada"
          >
            {activeLayerObjects.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhuma camada selecionada. Ative uma ou mais camadas no painel lateral para exibir
                sua legenda e metadados.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeLayerObjects.map((layer) => {
                  const st = getLayerRuntimeStatus(layer);
                  return (
                    <div key={layer.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-navy-900">{layer.label}</span>
                        <span className={`font-medium ${st.tone}`}>{st.label}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
                        <span>
                          <strong className="font-medium text-slate-700">Fonte:</strong>{' '}
                          {layer.source}
                        </span>
                        <span>
                          <strong className="font-medium text-slate-700">Data / status:</strong>{' '}
                          <span className="font-mono">{st.imageDate}</span>
                        </span>
                        <span>
                          <strong className="font-medium text-slate-700">Detalhe:</strong>{' '}
                          {layer.resolution}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                        {layer.legendItems.map((item) => (
                          <span
                            key={item.label}
                            className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"
                          >
                            <span
                              className="w-3 h-3 rounded-xs shrink-0"
                              style={{
                                backgroundColor: item.color,
                                border: item.border
                                  ? `1.5px solid ${item.border}`
                                  : '1px solid rgba(0,0,0,0.15)',
                              }}
                              aria-hidden="true"
                            />
                            <span>{item.label}</span>
                          </span>
                        ))}
                      </div>

                      {isOrbitalLayerId(layer.id) &&
                        observationsBySensor[layer.id].length === 0 && (
                          <p className="text-[11px] text-amber-800">
                            {layer.unavailableReason} Escala acima exibida apenas como referência
                            documental do produto orbital.
                          </p>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </DataCard>
        </div>

        {/* Coluna Direita: Camadas Individuais & Inspetor */}
        <div className="lg:col-span-4 space-y-6">
          <DataCard
            title="Camadas do mapa"
            subtitle="Ative ou desative cada camada individualmente"
            action={<Layers className="w-4 h-4 text-slate-400" />}
          >
            <div className="space-y-2">
              {MAP_LAYERS.map((layer) => {
                const checked = enabledLayers[layer.id];
                const st = getLayerRuntimeStatus(layer);

                return (
                  <button
                    key={layer.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleLayer(layer.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
                      checked
                        ? 'border-agro-700 bg-emerald-50/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-agro-700 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-navy-900">{layer.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {layer.source}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-medium whitespace-nowrap shrink-0 ${st.tone}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </DataCard>

          <DataCard
            title="Inspetor do talhão"
            subtitle="Clique sobre um talhão no mapa ou selecione abaixo"
            action={<Maximize2 className="w-4 h-4 text-slate-400" />}
          >
            {plots.length > 0 && selectedPlot ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label htmlFor="map-plot-select" className="sr-only">
                    Selecionar talhão
                  </label>
                  <select
                    id="map-plot-select"
                    value={selectedPlot.id}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedPlotId(nextId);
                      const target = plots.find((pl) => pl.id === nextId);
                      if (target && target.polygon.length >= 3 && mapInstanceRef.current) {
                        mapInstanceRef.current.fitBounds(
                          L.latLngBounds(
                            target.polygon.map((pt) => [pt.lat, pt.lon] as L.LatLngExpression)
                          ),
                          { padding: [48, 48], maxZoom: 16 }
                        );
                      }
                    }}
                    className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-900"
                  >
                    {plots.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.code} — {pl.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1">
                  <div>
                    <p className="font-mono font-semibold text-agro-700">{selectedPlot.code}</p>
                    <p className="text-sm font-semibold text-navy-900 mt-0.5">
                      {selectedPlot.name}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openPlotBoundaryEditor}
                    icon={<Pencil className="w-3 h-3" />}
                  >
                    Vértices
                  </Button>
                </div>

                <dl className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <dt className="text-slate-500">Área manual</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {formatArea(selectedPlot.areaHa, workspace.preferences.areaUnit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Área polígono (Turf)</dt>
                    <dd className="font-mono font-semibold text-agro-700 tabular-nums mt-0.5">
                      {selectedPlotCalcArea !== null
                        ? formatArea(selectedPlotCalcArea, workspace.preferences.areaUnit)
                        : 'Sem vértices reais'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Elevação</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {selectedPlot.elevationM} m
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Vértices salvos</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {selectedPlot.polygon.length} pontos
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Origem geometria</dt>
                    <dd className="font-medium text-slate-800 mt-0.5">
                      {selectedPlot.polygonSource === 'usuario_geo'
                        ? 'Vértices reais (usuário)'
                        : selectedPlot.polygonSource === 'estimado_area'
                        ? 'Ref. estimada (não real)'
                        : 'Polígono demonstrativo'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Sistema</dt>
                    <dd className="font-medium text-slate-800 capitalize mt-0.5">
                      {selectedPlot.irrigationSystem.replace('_', ' ')}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Classe de solo</dt>
                    <dd className="font-medium text-slate-800 mt-0.5">
                      {selectedPlot.soilTextureClass}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Cultura vinculada</dt>
                    <dd className="font-medium text-slate-800 mt-0.5">
                      {linkedCrop
                        ? `${linkedCrop.cropName} (${linkedCrop.cultivar})`
                        : 'Nenhuma cultura vinculada'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2 text-slate-600 font-medium">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>Nenhum talhão cadastrado</span>
                </div>
                <p>
                  O mapa exibe o centróide e o perímetro cadastrados da propriedade. Cadastre
                  talhões no módulo Propriedades para inspecionar seus limites.
                </p>
              </div>
            )}
          </DataCard>
        </div>
      </div>

      {/* Modal para definir/editar o polígono real da propriedade */}
      <Modal
        open={boundaryModalOpen}
        onClose={() => setBoundaryModalOpen(false)}
        title="Polígono geográfico da propriedade"
        subtitle={`${activeProperty.name} · Manual informada: ${formatArea(
          activeProperty.totalAreaHa,
          workspace.preferences.areaUnit
        )}`}
      >
        <form onSubmit={handleSaveBoundary} noValidate className="space-y-4">
          <TextareaField
            id="map-poly-input"
            label="Coordenadas reais dos vértices (lat, lon por linha ou GeoJSON Polygon)"
            rows={5}
            placeholder={'-12.528, -55.738\n-12.528, -55.700\n-12.561, -55.701\n-12.560, -55.738'}
            value={polygonText}
            onChange={(e) => {
              setPolygonText(e.target.value);
              setPolygonError(undefined);
            }}
            error={polygonError}
            hint="Informe no mínimo 3 vértices WGS84 reais em sequência perimetral. A área geodésica será calculada automaticamente."
          />

          {boundaryLivePreview &&
            !('error' in boundaryLivePreview) &&
            typeof boundaryLivePreview.areaHa === 'number' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2">
                <span>
                  Polígono válido ({boundaryLivePreview.vertices} vértices) — área geodésica calculada:
                </span>
                <span className="font-mono font-bold tabular-nums">
                  {formatArea(boundaryLivePreview.areaHa, workspace.preferences.areaUnit)}
                </span>
              </div>
            )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBoundaryModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={savingBoundary}>
              Salvar perímetro
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal para editar os vértices reais do talhão selecionado */}
      <Modal
        open={plotBoundaryModalOpen}
        onClose={() => setPlotBoundaryModalOpen(false)}
        title="Vértices reais do talhão"
        subtitle={
          selectedPlot
            ? `${selectedPlot.code} — ${selectedPlot.name} · Manual: ${formatArea(
                selectedPlot.areaHa,
                workspace.preferences.areaUnit
              )}`
            : ''
        }
      >
        <form onSubmit={handleSavePlotBoundary} noValidate className="space-y-4">
          <TextareaField
            id="map-plot-poly-input"
            label="Coordenadas reais dos vértices (lat, lon por linha ou GeoJSON Polygon)"
            rows={5}
            placeholder={'-12.529, -55.736\n-12.529, -55.719\n-12.543, -55.719\n-12.543, -55.736'}
            value={plotPolygonText}
            onChange={(e) => {
              setPlotPolygonText(e.target.value);
              setPlotPolygonError(undefined);
            }}
            error={plotPolygonError}
            hint="Atualize os vértices WGS84 reais do talhão. A área calculada pelo polígono será recalculada imediatamente."
          />

          {plotLivePreview &&
            !('error' in plotLivePreview) &&
            typeof plotLivePreview.areaHa === 'number' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2">
                <span>
                  Polígono válido ({plotLivePreview.vertices} vértices) — área geodésica calculada:
                </span>
                <span className="font-mono font-bold tabular-nums">
                  {formatArea(plotLivePreview.areaHa, workspace.preferences.areaUnit)}
                </span>
              </div>
            )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPlotBoundaryModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={savingPlotBoundary}>
              Salvar vértices do talhão
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
