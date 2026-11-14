import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { InputField, SelectField, TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import {
  formatArea,
  formatCoord,
  isValidLatitude,
  isValidLongitude,
  parsePolygonCoordinates,
} from '../../../utils/validation';
import { calculatePolygonAreaHa } from '../../../utils/geospatial';
import type { PropertyDetailsUpdateInput } from '../../../services/workspaceService';
import type { AgrolynxWorkspaceData, FieldPlot, GeoPoint, Property } from '../../../types/agrolynx';

const BASE_BIOME_OPTIONS = [
  'Cerrado',
  'Mata Atlântica',
  'Amazônia',
  'Pampa',
  'Caatinga',
  'Pantanal',
];

function parseAreaDecimalInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  let normalized = trimmed;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

interface PropertiesModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
  onAddProperty: (input: Omit<Property, 'id' | 'createdAt' | 'isDemo'>) => Promise<void>;
  onUpdatePropertyDetails: (
    propertyId: string,
    updates: PropertyDetailsUpdateInput
  ) => Promise<void>;
  onUpdatePropertyBoundary: (
    propertyId: string,
    boundaryPolygon: GeoPoint[],
    boundarySource: Property['boundarySource']
  ) => Promise<void>;
  onDeleteProperty: (id: string) => Promise<void>;
  onAddPlot: (
    input: Omit<FieldPlot, 'id' | 'polygon' | 'isDemo'> & { polygon?: GeoPoint[] }
  ) => Promise<void>;
  onUpdatePlotPolygon: (
    plotId: string,
    polygon: GeoPoint[],
    polygonSource?: FieldPlot['polygonSource']
  ) => Promise<void>;
}

export const PropertiesModule: React.FC<PropertiesModuleProps> = ({
  workspace,
  selectedPropertyId,
  onSelectProperty,
  onAddProperty,
  onUpdatePropertyDetails,
  onUpdatePropertyBoundary,
  onDeleteProperty,
  onAddPlot,
  onUpdatePlotPolygon,
}) => {
  const [search, setSearch] = useState('');
  const [propModalOpen, setPropModalOpen] = useState(false);
  const [editPropModalOpen, setEditPropModalOpen] = useState(false);
  const [plotModalOpen, setPlotModalOpen] = useState(false);
  const [boundaryModalOpen, setBoundaryModalOpen] = useState(false);
  const [editingPlot, setEditingPlot] = useState<FieldPlot | null>(null);
  const [editPlotPolyText, setEditPlotPolyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [propSuccessMessage, setPropSuccessMessage] = useState<string | null>(null);

  // Form Propriedade
  const [propName, setPropName] = useState('');
  const [propMun, setPropMun] = useState('');
  const [propState, setPropState] = useState('MT');
  const [propArea, setPropArea] = useState('');
  const [propLat, setPropLat] = useState('-12.5400');
  const [propLon, setPropLon] = useState('-55.7200');
  const [propBiome, setPropBiome] = useState('Cerrado');
  const [propCar, setPropCar] = useState('');
  const [propPolygonMode, setPropPolygonMode] = useState<'none' | 'manual'>('none');
  const [propPolygonText, setPropPolygonText] = useState('');

  // Form Edição dos Dados Cadastrais da Propriedade
  const [editPropName, setEditPropName] = useState('');
  const [editPropMun, setEditPropMun] = useState('');
  const [editPropState, setEditPropState] = useState('');
  const [editPropBiome, setEditPropBiome] = useState('Cerrado');
  const [editPropCar, setEditPropCar] = useState('');
  const [editPropArea, setEditPropArea] = useState('');

  // Form Edição de Polígono da Propriedade
  const [editPolygonText, setEditPolygonText] = useState('');

  // Form Talhão
  const [plotPropId, setPlotPropId] = useState(selectedPropertyId || workspace.properties[0]?.id || '');
  const [plotCode, setPlotCode] = useState('');
  const [plotName, setPlotName] = useState('');
  const [plotArea, setPlotArea] = useState('');
  const [plotSoil, setPlotSoil] = useState('Latossolo Vermelho-Amarelo');
  const [plotElev, setPlotElev] = useState('380');
  const [plotLat, setPlotLat] = useState('-12.5400');
  const [plotLon, setPlotLon] = useState('-55.7200');
  const [plotIrr, setPlotIrr] = useState<FieldPlot['irrigationSystem']>('sequeiro');
  const [plotPolygonText, setPlotPolygonText] = useState('');

  const filteredProperties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspace.properties;
    return workspace.properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.municipality.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q)
    );
  }, [workspace.properties, search]);

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  useEffect(() => {
    setPropSuccessMessage(null);
  }, [activeProperty?.id]);

  const activePlots = useMemo(
    () =>
      activeProperty
        ? workspace.plots.filter((pl) => pl.propertyId === activeProperty.id)
        : [],
    [workspace.plots, activeProperty]
  );

  const editBiomeOptions = useMemo(() => {
    const list = [...BASE_BIOME_OPTIONS];
    if (activeProperty?.biome && !list.includes(activeProperty.biome)) {
      list.unshift(activeProperty.biome);
    }
    return list.map((b) => ({ value: b, label: b }));
  }, [activeProperty?.biome]);

  const openEditPropertyModal = () => {
    if (!activeProperty) return;
    setFormErrors({});
    setEditSaveError(null);
    setEditPropName(activeProperty.name);
    setEditPropMun(activeProperty.municipality);
    setEditPropState(activeProperty.state);
    setEditPropBiome(activeProperty.biome);
    setEditPropCar(activeProperty.carCode || '');
    setEditPropArea(
      activeProperty.totalAreaHa.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 4,
        useGrouping: false,
      })
    );
    setEditPropModalOpen(true);
  };

  const handleSaveEditedProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProperty) return;

    const errs: Record<string, string> = {};
    const areaNum = parseAreaDecimalInput(editPropArea);

    if (editPropName.trim().length < 3) {
      errs.editPropName = 'O nome da propriedade deve ter pelo menos 3 caracteres.';
    }
    if (editPropMun.trim().length < 2) {
      errs.editPropMun = 'Informe o município da propriedade.';
    }
    if (!/^[A-Za-z]{2}$/.test(editPropState.trim())) {
      errs.editPropState = 'Informe uma UF válida com 2 letras (ex.: RJ, MT).';
    }
    if (editPropBiome.trim().length < 2) {
      errs.editPropBiome = 'Selecione o bioma predominante.';
    }
    if (areaNum === null || areaNum <= 0) {
      errs.editPropArea = 'Informe uma área manual válida maior que zero (ex.: 15,0).';
    }

    if (Object.keys(errs).length > 0 || areaNum === null) {
      setFormErrors(errs);
      setEditSaveError('Revise os campos obrigatórios destacados antes de salvar.');
      return;
    }

    setSubmitting(true);
    setEditSaveError(null);
    try {
      await onUpdatePropertyDetails(activeProperty.id, {
        name: editPropName.trim(),
        municipality: editPropMun.trim(),
        state: editPropState.trim().toUpperCase(),
        biome: editPropBiome.trim(),
        carCode: editPropCar.trim() || undefined,
        totalAreaHa: areaNum,
      });
      setEditPropModalOpen(false);
      setFormErrors({});
      setPropSuccessMessage(
        `Dados cadastrais de "${editPropName.trim()}" salvos com sucesso. Polígono geográfico, vértices, centróide e área calculada foram preservados.`
      );
    } catch (err) {
      setEditSaveError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar as alterações da propriedade.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const areaNum = Number(propArea);
    const latNum = Number(propLat);
    const lonNum = Number(propLon);

    if (propName.trim().length < 3) errs.propName = 'Informe o nome da propriedade.';
    if (propMun.trim().length < 2) errs.propMun = 'Informe o município.';
    if (!Number.isFinite(areaNum) || areaNum <= 0) errs.propArea = 'Área deve ser maior que zero.';
    if (!isValidLatitude(latNum)) errs.propLat = 'Latitude deve estar entre -90 e 90.';
    if (!isValidLongitude(lonNum)) errs.propLon = 'Longitude deve estar entre -180 e 180.';

    let boundaryPolygon: GeoPoint[] | undefined;
    let boundarySource: Property['boundarySource'] | undefined;

    if (propPolygonMode === 'manual') {
      const parsed = parsePolygonCoordinates(propPolygonText);
      if (parsed.error) {
        errs.propPolygonText = parsed.error;
      } else if (parsed.points.length < 3) {
        errs.propPolygonText = 'Informe ao menos 3 vértices para salvar o polígono.';
      } else {
        boundaryPolygon = parsed.points;
        boundarySource = 'usuario_geo';
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await onAddProperty({
        name: propName.trim(),
        municipality: propMun.trim(),
        state: propState.trim().toUpperCase(),
        totalAreaHa: areaNum,
        centroid: { lat: latNum, lon: lonNum },
        boundaryPolygon,
        boundarySource,
        biome: propBiome,
        carCode: propCar.trim() || undefined,
      });
      setPropModalOpen(false);
      setPropName('');
      setPropMun('');
      setPropArea('');
      setPropCar('');
      setPropPolygonText('');
      setFormErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditedBoundary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProperty) return;
    const parsed = parsePolygonCoordinates(editPolygonText);
    if (parsed.error || parsed.points.length < 3) {
      setFormErrors({
        editPolygonText:
          parsed.error || 'Informe ao menos 3 vértices (latitude, longitude) ou GeoJSON.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await onUpdatePropertyBoundary(activeProperty.id, parsed.points, 'usuario_geo');
      setBoundaryModalOpen(false);
      setFormErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditedPlotPolygon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlot) return;
    const parsed = parsePolygonCoordinates(editPlotPolyText);
    if (parsed.error || parsed.points.length < 3) {
      setFormErrors({
        editPlotPolyText:
          parsed.error || 'Informe ao menos 3 vértices (latitude, longitude) ou GeoJSON.',
      });
      return;
    }
    setSubmitting(true);
    try {
      await onUpdatePlotPolygon(editingPlot.id, parsed.points, 'usuario_geo');
      setEditingPlot(null);
      setFormErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  const activePropertyCalcArea = useMemo(() => {
    if (!activeProperty?.boundaryPolygon || activeProperty.boundaryPolygon.length < 3) {
      return null;
    }
    if (activeProperty.boundarySource === 'estimado_area') {
      return null;
    }
    const res = calculatePolygonAreaHa(activeProperty.boundaryPolygon);
    return res.valid ? res.areaHa : null;
  }, [activeProperty]);

  const editBoundaryLivePreview = useMemo(() => {
    if (!editPolygonText.trim()) return null;
    const parsed = parsePolygonCoordinates(editPolygonText);
    if (parsed.error || parsed.points.length < 3) return { error: parsed.error };
    const area = calculatePolygonAreaHa(parsed.points);
    return { areaHa: area.areaHa, vertices: parsed.points.length };
  }, [editPolygonText]);

  const editPlotLivePreview = useMemo(() => {
    if (!editPlotPolyText.trim()) return null;
    const parsed = parsePolygonCoordinates(editPlotPolyText);
    if (parsed.error || parsed.points.length < 3) return { error: parsed.error };
    const area = calculatePolygonAreaHa(parsed.points);
    return { areaHa: area.areaHa, vertices: parsed.points.length };
  }, [editPlotPolyText]);

  const handleCreatePlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPropId = plotPropId || activeProperty?.id || '';
    const areaNum = Number(plotArea);
    const elevNum = Number(plotElev);
    const latNum = Number(plotLat);
    const lonNum = Number(plotLon);

    if (!targetPropId) errs.plotPropId = 'Selecione uma propriedade.';
    if (plotCode.trim().length < 2) errs.plotCode = 'Informe o código do talhão.';
    if (plotName.trim().length < 2) errs.plotName = 'Informe o nome do talhão.';
    if (!Number.isFinite(areaNum) || areaNum <= 0) errs.plotArea = 'Área deve ser positiva.';
    if (!isValidLatitude(latNum)) errs.plotLat = 'Latitude inválida.';
    if (!isValidLongitude(lonNum)) errs.plotLon = 'Longitude inválida.';

    let customPolygon: GeoPoint[] | undefined;
    if (plotPolygonText.trim()) {
      const parsed = parsePolygonCoordinates(plotPolygonText);
      if (parsed.error) {
        errs.plotPolygonText = parsed.error;
      } else if (parsed.points.length >= 3) {
        customPolygon = parsed.points;
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await onAddPlot({
        propertyId: targetPropId,
        code: plotCode.trim().toUpperCase(),
        name: plotName.trim(),
        areaHa: areaNum,
        soilTextureClass: plotSoil.trim(),
        elevationM: Number.isFinite(elevNum) ? elevNum : 0,
        centroid: { lat: latNum, lon: lonNum },
        polygon: customPolygon,
        irrigationSystem: plotIrr,
      });
      setPlotModalOpen(false);
      setPlotCode('');
      setPlotName('');
      setPlotArea('');
      setPlotPolygonText('');
      setFormErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  const hasDemoItems = workspace.properties.some((p) => p.isDemo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Propriedades e Talhões
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cadastro fundiário, coordenadas geográficas e divisão operacional em talhões.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            disabled={workspace.properties.length === 0}
            onClick={() => {
              setFormErrors({});
              setPlotPropId(activeProperty?.id || workspace.properties[0]?.id || '');
              if (activeProperty) {
                setPlotLat(String(activeProperty.centroid.lat));
                setPlotLon(String(activeProperty.centroid.lon));
              }
              setPlotModalOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Novo talhão
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setFormErrors({});
              setPropModalOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Nova propriedade
          </Button>
        </div>
      </div>

      {hasDemoItems && (
        <DemoNotice
          variant="demo"
          title="Registros demonstrativos presentes"
          description="As fazendas marcadas como Exemplo ilustram o esquema de dados fundiários. Você pode cadastrar suas próprias propriedades ou removê-las em Configurações."
        />
      )}

      {/* Barra de busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome, município ou UF..."
            className="w-full min-h-[40px] pl-10 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agro-700"
          />
        </div>
        <p className="text-xs text-slate-500 tabular-nums">
          {filteredProperties.length} propriedade(s) · {workspace.plots.length} talhão(ões)
        </p>
      </div>

      {filteredProperties.length === 0 ? (
        <EmptyState
          title="Nenhuma propriedade cadastrada"
          description="Cadastre uma propriedade rural com coordenadas geográficas para habilitar os módulos de mapa, clima, solo e planejamento."
          actionLabel="Cadastrar primeira propriedade"
          onAction={() => setPropModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Lista de propriedades */}
          <div className="lg:col-span-5 space-y-3">
            {filteredProperties.map((prop) => {
              const isSelected = activeProperty?.id === prop.id;
              const plotsCount = workspace.plots.filter((pl) => pl.propertyId === prop.id).length;

              return (
                <div
                  key={prop.id}
                  onClick={() => onSelectProperty(prop.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectProperty(prop.id);
                    }
                  }}
                  className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/50 border-agro-700'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-navy-900 font-display truncate">
                        {prop.name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {prop.municipality}/{prop.state} · {prop.biome}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProperty(prop.id);
                      }}
                      aria-label={`Excluir ${prop.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                    <span>{formatArea(prop.totalAreaHa, workspace.preferences.areaUnit)}</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{plotsCount} talhão(ões)</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{prop.isDemo ? 'Demonstrativo' : 'Cadastro usuário'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detalhes e Talhões da Propriedade Selecionada */}
          <div className="lg:col-span-7 space-y-6">
            {activeProperty && (
              <DataCard
                title={activeProperty.name}
                subtitle={`${activeProperty.municipality}/${activeProperty.state} · Centróide: ${formatCoord(
                  activeProperty.centroid.lat,
                  'lat'
                )}, ${formatCoord(activeProperty.centroid.lon, 'lon')}`}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditPropertyModal}
                    icon={<Pencil className="w-3.5 h-3.5" />}
                  >
                    Editar propriedade
                  </Button>
                }
              >
                {propSuccessMessage && (
                  <div
                    role="status"
                    className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900"
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-agro-700 shrink-0 mt-0.5" />
                      <span>{propSuccessMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPropSuccessMessage(null)}
                      aria-label="Fechar aviso"
                      className="text-emerald-700 hover:text-emerald-950 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Área informada (manual)</p>
                    <p className="text-base font-semibold text-navy-900 font-mono tabular-nums mt-0.5">
                      {formatArea(activeProperty.totalAreaHa, workspace.preferences.areaUnit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Área calculada (polígono)</p>
                    <p className="text-base font-semibold text-agro-700 font-mono tabular-nums mt-0.5">
                      {activePropertyCalcArea !== null
                        ? formatArea(activePropertyCalcArea, workspace.preferences.areaUnit)
                        : activeProperty.boundarySource === 'estimado_area'
                        ? 'Ref. estimada (não real)'
                        : 'Sem polígono'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Bioma / CAR</p>
                    <p className="text-xs font-medium text-slate-800 mt-0.5">
                      {activeProperty.biome}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5 break-all">
                      {activeProperty.carCode || 'CAR não informado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Polígono geográfico</p>
                    <p className="text-xs font-mono text-slate-800 mt-1">
                      {activeProperty.boundaryPolygon && activeProperty.boundaryPolygon.length >= 3
                        ? `${activeProperty.boundaryPolygon.length} vértices (${
                            activeProperty.boundarySource === 'usuario_geo'
                              ? 'vértices reais'
                              : activeProperty.boundarySource === 'estimado_area'
                              ? 'estimativa não real'
                              : 'demonstrativo'
                          })`
                        : 'Não cadastrado'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFormErrors({});
                        setEditPolygonText(
                          activeProperty.boundaryPolygon
                            ?.map((pt) => `${pt.lat}, ${pt.lon}`)
                            .join('\n') || ''
                        );
                        setBoundaryModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-agro-700 hover:underline mt-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>
                        {activeProperty.boundaryPolygon?.length
                          ? 'Editar vértices'
                          : 'Definir vértices reais'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">
                      Talhões vinculados ({activePlots.length})
                    </h3>
                  </div>

                  {activePlots.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      Nenhum talhão vinculado a esta propriedade. Clique em "Novo talhão" para
                      adicionar.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3 font-medium">Código</th>
                            <th className="py-2 pr-3 font-medium">Talhão</th>
                            <th className="py-2 pr-3 font-medium text-right">Área manual</th>
                            <th className="py-2 pr-3 font-medium text-right">Área polígono</th>
                            <th className="py-2 font-medium text-right">Geometria</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activePlots.map((plot) => {
                            const plotCalc = calculatePolygonAreaHa(plot.polygon);
                            const isEstimated = plot.polygonSource === 'estimado_area';
                            return (
                              <tr key={plot.id} className="hover:bg-slate-50">
                                <td className="py-2.5 pr-3 font-mono font-semibold text-navy-900">
                                  {plot.code}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-800">
                                  <p className="font-medium">{plot.name}</p>
                                  <p className="text-slate-500">
                                    {plot.soilTextureClass} · {plot.elevationM} m
                                  </p>
                                </td>
                                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">
                                  {formatArea(plot.areaHa, workspace.preferences.areaUnit)}
                                </td>
                                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                                  {isEstimated ? (
                                    <span className="text-amber-700" title="Polígono gerado automaticamente por falta de vértices reais">
                                      Sem vértices reais
                                    </span>
                                  ) : plotCalc.valid && plotCalc.areaHa !== null ? (
                                    <span className="text-agro-700 font-semibold">
                                      {formatArea(plotCalc.areaHa, workspace.preferences.areaUnit)}
                                    </span>
                                  ) : (
                                    <span className="text-rose-700">Inválido</span>
                                  )}
                                </td>
                                <td className="py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormErrors({});
                                      setEditingPlot(plot);
                                      setEditPlotPolyText(
                                        plot.polygon.map((pt) => `${pt.lat}, ${pt.lon}`).join('\n')
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-800 hover:underline cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Editar ({plot.polygon.length})</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </DataCard>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova Propriedade */}
      <Modal
        open={propModalOpen}
        onClose={() => setPropModalOpen(false)}
        title="Cadastrar nova propriedade"
        subtitle="Os dados ficam salvos localmente até a conexão com o PostgreSQL."
      >
        <form onSubmit={handleCreateProperty} noValidate className="space-y-4">
          <InputField
            id="prop-name"
            label="Nome da propriedade"
            placeholder="Ex.: Fazenda Boa Esperança"
            value={propName}
            onChange={(e) => setPropName(e.target.value)}
            error={formErrors.propName}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <InputField
                id="prop-mun"
                label="Município"
                placeholder="Ex.: Rio Verde"
                value={propMun}
                onChange={(e) => setPropMun(e.target.value)}
                error={formErrors.propMun}
                required
              />
            </div>
            <InputField
              id="prop-state"
              label="UF"
              maxLength={2}
              placeholder="GO"
              value={propState}
              onChange={(e) => setPropState(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="prop-area"
              label="Área total (ha)"
              type="number"
              step="0.1"
              placeholder="450"
              value={propArea}
              onChange={(e) => setPropArea(e.target.value)}
              error={formErrors.propArea}
              required
            />
            <SelectField
              id="prop-biome"
              label="Bioma predominante"
              value={propBiome}
              onChange={(e) => setPropBiome(e.target.value)}
              options={[
                { value: 'Cerrado', label: 'Cerrado' },
                { value: 'Mata Atlântica', label: 'Mata Atlântica' },
                { value: 'Amazônia', label: 'Amazônia' },
                { value: 'Pampa', label: 'Pampa' },
                { value: 'Caatinga', label: 'Caatinga' },
                { value: 'Pantanal', label: 'Pantanal' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="prop-lat"
              label="Latitude do centróide"
              type="number"
              step="0.0001"
              value={propLat}
              onChange={(e) => setPropLat(e.target.value)}
              error={formErrors.propLat}
              hint="Ex.: -17.7925 (Sul negativo)"
              required
            />
            <InputField
              id="prop-lon"
              label="Longitude do centróide"
              type="number"
              step="0.0001"
              value={propLon}
              onChange={(e) => setPropLon(e.target.value)}
              error={formErrors.propLon}
              hint="Ex.: -50.9192 (Oeste negativo)"
              required
            />
          </div>

          <InputField
            id="prop-car"
            label="Código CAR (opcional)"
            placeholder="Ex.: GO-5218805-..."
            value={propCar}
            onChange={(e) => setPropCar(e.target.value)}
          />

          <SelectField
            id="prop-poly-mode"
            label="Perímetro geográfico da propriedade"
            value={propPolygonMode}
            onChange={(e) =>
              setPropPolygonMode(e.target.value as 'none' | 'manual')
            }
            options={[
              {
                value: 'none',
                label: 'Salvar apenas o centróide (informar vértices reais depois)',
              },
              {
                value: 'manual',
                label: 'Informar vértices reais do polígono (lat, lon ou GeoJSON)',
              },
            ]}
          />

          {propPolygonMode === 'manual' && (
            <TextareaField
              id="prop-poly-text"
              label="Vértices do polígono (um par lat, lon por linha ou GeoJSON Polygon)"
              rows={4}
              placeholder={'-12.528, -55.738\n-12.528, -55.700\n-12.561, -55.701\n-12.560, -55.738'}
              value={propPolygonText}
              onChange={(e) => setPropPolygonText(e.target.value)}
              error={formErrors.propPolygonText}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPropModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar propriedade
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Editar Dados Cadastrais da Propriedade */}
      <Modal
        open={editPropModalOpen}
        onClose={() => setEditPropModalOpen(false)}
        title="Editar dados da propriedade"
        subtitle={
          activeProperty
            ? `${activeProperty.name} · O polígono geográfico e a área calculada não serão alterados.`
            : ''
        }
      >
        <form onSubmit={handleSaveEditedProperty} noValidate className="space-y-4">
          {editSaveError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{editSaveError}</span>
            </div>
          )}

          <InputField
            id="edit-prop-name"
            label="Nome da propriedade"
            value={editPropName}
            onChange={(e) => setEditPropName(e.target.value)}
            error={formErrors.editPropName}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <InputField
                id="edit-prop-mun"
                label="Município"
                value={editPropMun}
                onChange={(e) => setEditPropMun(e.target.value)}
                error={formErrors.editPropMun}
                required
              />
            </div>
            <InputField
              id="edit-prop-state"
              label="UF"
              maxLength={2}
              value={editPropState}
              onChange={(e) => setEditPropState(e.target.value.toUpperCase())}
              error={formErrors.editPropState}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="edit-prop-area"
              label="Área informada (manual, ha)"
              type="text"
              inputMode="decimal"
              placeholder="15,0"
              value={editPropArea}
              onChange={(e) => setEditPropArea(e.target.value)}
              error={formErrors.editPropArea}
              hint="Aceita vírgula ou ponto decimal (ex.: 15,0)."
              required
            />
            <SelectField
              id="edit-prop-biome"
              label="Bioma predominante"
              value={editPropBiome}
              onChange={(e) => setEditPropBiome(e.target.value)}
              error={formErrors.editPropBiome}
              options={editBiomeOptions}
            />
          </div>

          <InputField
            id="edit-prop-car"
            label="Código CAR (opcional)"
            placeholder="Ex.: RJ-3302700-..."
            value={editPropCar}
            onChange={(e) => setEditPropCar(e.target.value)}
          />

          {activeProperty && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-navy-900">
                Dados geográficos preservados automaticamente:
              </p>
              <p className="font-mono tabular-nums">
                Centróide: {formatCoord(activeProperty.centroid.lat, 'lat')},{' '}
                {formatCoord(activeProperty.centroid.lon, 'lon')} ·{' '}
                {activeProperty.boundaryPolygon && activeProperty.boundaryPolygon.length >= 3
                  ? `${activeProperty.boundaryPolygon.length} vértices salvos`
                  : 'Sem polígono salvo'}
                {activePropertyCalcArea !== null
                  ? ` · Área calculada: ${formatArea(activePropertyCalcArea, workspace.preferences.areaUnit)}`
                  : ''}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditPropModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Editar Perímetro da Propriedade */}
      <Modal
        open={boundaryModalOpen}
        onClose={() => setBoundaryModalOpen(false)}
        title="Editar vértices reais do perímetro da propriedade"
        subtitle={activeProperty ? `${activeProperty.name} · Área informada: ${activeProperty.totalAreaHa} ha` : ''}
      >
        <form onSubmit={handleSaveEditedBoundary} noValidate className="space-y-4">
          <TextareaField
            id="edit-poly-text"
            label="Vértices do polígono (lat, lon por linha ou GeoJSON Polygon)"
            rows={5}
            placeholder={'-12.528, -55.738\n-12.528, -55.700\n-12.561, -55.701\n-12.560, -55.738'}
            value={editPolygonText}
            onChange={(e) => setEditPolygonText(e.target.value)}
            error={formErrors.editPolygonText}
            hint="Mínimo 3 vértices em WGS84 (EPSG:4326) sem autointerseções."
          />

          {editBoundaryLivePreview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              {'error' in editBoundaryLivePreview ? (
                <span className="text-rose-700 font-medium">{editBoundaryLivePreview.error}</span>
              ) : (
                <span className="text-navy-900 font-mono tabular-nums">
                  Prévia Turf.js ({editBoundaryLivePreview.vertices} vértices):{' '}
                  <strong className="text-agro-700">
                    {editBoundaryLivePreview.areaHa?.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ha
                  </strong>
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBoundaryModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar vértices reais
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Editar Polígono do Talhão */}
      <Modal
        open={Boolean(editingPlot)}
        onClose={() => setEditingPlot(null)}
        title="Editar vértices do talhão"
        subtitle={editingPlot ? `${editingPlot.code} — ${editingPlot.name}` : ''}
      >
        <form onSubmit={handleSaveEditedPlotPolygon} noValidate className="space-y-4">
          <TextareaField
            id="edit-plot-poly"
            label="Vértices do talhão (lat, lon por linha ou GeoJSON Polygon)"
            rows={5}
            value={editPlotPolyText}
            onChange={(e) => setEditPlotPolyText(e.target.value)}
            error={formErrors.editPlotPolyText}
          />

          {editPlotLivePreview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              {'error' in editPlotLivePreview ? (
                <span className="text-rose-700 font-medium">{editPlotLivePreview.error}</span>
              ) : (
                <span className="text-navy-900 font-mono tabular-nums">
                  Área calculada do talhão ({editPlotLivePreview.vertices} vértices):{' '}
                  <strong className="text-agro-700">
                    {editPlotLivePreview.areaHa?.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ha
                  </strong>
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingPlot(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar polígono do talhão
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Novo Talhão */}
      <Modal
        open={plotModalOpen}
        onClose={() => setPlotModalOpen(false)}
        title="Cadastrar novo talhão"
        subtitle="Defina a subdivisão operacional e coordenadas do centro do talhão."
      >
        <form onSubmit={handleCreatePlot} noValidate className="space-y-4">
          <SelectField
            id="plot-prop"
            label="Propriedade vinculada"
            value={plotPropId}
            onChange={(e) => setPlotPropId(e.target.value)}
            error={formErrors.plotPropId}
            options={workspace.properties.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.municipality}/${p.state})`,
            }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField
              id="plot-code"
              label="Código"
              placeholder="TH-04"
              value={plotCode}
              onChange={(e) => setPlotCode(e.target.value)}
              error={formErrors.plotCode}
              required
            />
            <div className="sm:col-span-2">
              <InputField
                id="plot-name"
                label="Nome do talhão"
                placeholder="Gleba Sudoeste"
                value={plotName}
                onChange={(e) => setPlotName(e.target.value)}
                error={formErrors.plotName}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField
              id="plot-area"
              label="Área (ha)"
              type="number"
              step="0.1"
              placeholder="120"
              value={plotArea}
              onChange={(e) => setPlotArea(e.target.value)}
              error={formErrors.plotArea}
              required
            />
            <InputField
              id="plot-elev"
              label="Elevação (m)"
              type="number"
              value={plotElev}
              onChange={(e) => setPlotElev(e.target.value)}
            />
            <SelectField
              id="plot-irr"
              label="Sistema hídrico"
              value={plotIrr}
              onChange={(e) =>
                setPlotIrr(e.target.value as FieldPlot['irrigationSystem'])
              }
              options={[
                { value: 'sequeiro', label: 'Sequeiro' },
                { value: 'pivo_central', label: 'Pivô Central' },
                { value: 'gotejamento', label: 'Gotejamento' },
                { value: 'aspersao', label: 'Aspersão' },
              ]}
            />
          </div>

          <InputField
            id="plot-soil"
            label="Classe textural / Solo predominante"
            value={plotSoil}
            onChange={(e) => setPlotSoil(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="plot-lat"
              label="Latitude central"
              type="number"
              step="0.0001"
              value={plotLat}
              onChange={(e) => setPlotLat(e.target.value)}
              error={formErrors.plotLat}
              required
            />
            <InputField
              id="plot-lon"
              label="Longitude central"
              type="number"
              step="0.0001"
              value={plotLon}
              onChange={(e) => setPlotLon(e.target.value)}
              error={formErrors.plotLon}
              required
            />
          </div>

          <TextareaField
            id="plot-poly-text"
            label="Vértices do polígono do talhão (opcional — lat, lon por linha ou GeoJSON)"
            rows={3}
            placeholder="Se vazio, será gerado um retângulo proporcional à área informada ao redor do centróide."
            value={plotPolygonText}
            onChange={(e) => setPlotPolygonText(e.target.value)}
            error={formErrors.plotPolygonText}
          />

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>
              A geometria salva será renderizada imediatamente no Mapa Agrícola em EPSG:4326.
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPlotModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar talhão
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
