import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { InputField, SelectField, TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { nasaClient } from '../../../services/nasaClient';
import { formatDateBr, formatDateTimeBr } from '../../../utils/validation';
import type {
  AgrolynxWorkspaceData,
  FieldObservation,
  ObservationSeverity,
} from '../../../types/agrolynx';
import type { OrbitalObservationPoint, OrbitalSensorCategory } from '../../../types/nasa';

interface MonitoringModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddObservation: (input: Omit<FieldObservation, 'id' | 'isDemo'>) => Promise<void>;
}

const SEVERITY_LABEL: Record<ObservationSeverity, { text: string; cls: string }> = {
  informativo: { text: 'Informativo', cls: 'text-navy-800' },
  atencao: { text: 'Atenção', cls: 'text-amber-700' },
  critico: { text: 'Crítico', cls: 'text-rose-700' },
};

export const MonitoringModule: React.FC<MonitoringModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddObservation,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'todas' | ObservationSeverity>('todas');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [orbitalObs, setOrbitalObs] = useState<OrbitalObservationPoint[]>([]);

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeProperty) {
        setOrbitalObs([]);
        return;
      }
      try {
        const res = await nasaClient.getObservations({
          propertyId: activeProperty.id,
          lat: activeProperty.centroid.lat,
          lon: activeProperty.centroid.lon,
        });
        if (!cancelled) {
          setOrbitalObs(res.observations || []);
        }
      } catch {
        if (!cancelled) setOrbitalObs([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeProperty?.id, activeProperty?.centroid.lat, activeProperty?.centroid.lon]);

  const availablePlots = useMemo(
    () =>
      activeProperty
        ? workspace.plots.filter((pl) => pl.propertyId === activeProperty.id)
        : workspace.plots,
    [workspace.plots, activeProperty]
  );

  const [plotId, setPlotId] = useState(availablePlots[0]?.id || '');
  const [date, setDate] = useState('2026-11-14');
  const [category, setCategory] =
    useState<FieldObservation['category']>('fenologia');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<ObservationSeverity>('informativo');
  const [localRainMm, setLocalRainMm] = useState('');

  const filteredObservations = useMemo(() => {
    return workspace.observations.filter((o) => {
      const propOk = activeProperty ? o.propertyId === activeProperty.id : true;
      const sevOk = severityFilter === 'todas' ? true : o.severity === severityFilter;
      return propOk && sevOk;
    });
  }, [workspace.observations, activeProperty, severityFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPlotId = plotId || availablePlots[0]?.id || '';

    if (!targetPlotId) errs.plotId = 'Selecione um talhão.';
    if (title.trim().length < 3) errs.title = 'Informe um título para o apontamento.';
    if (description.trim().length < 5) errs.description = 'Descreva a observação de campo.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const plot = workspace.plots.find((pl) => pl.id === targetPlotId);
    const rainNum = localRainMm ? Number(localRainMm) : undefined;

    setSubmitting(true);
    try {
      await onAddObservation({
        propertyId: plot?.propertyId || activeProperty?.id || '',
        plotId: targetPlotId,
        date,
        category,
        title: title.trim(),
        description: description.trim(),
        severity,
        localRainMm: Number.isFinite(rainNum) ? rainNum : undefined,
      });
      setModalOpen(false);
      setTitle('');
      setDescription('');
      setLocalRainMm('');
      setErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Monitoramento e Diário de Campo
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Apontamentos agronômicos locais e leituras orbitais reais da NASA.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          disabled={availablePlots.length === 0}
          onClick={() => {
            setErrors({});
            setPlotId(availablePlots[0]?.id || '');
            setModalOpen(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          Novo apontamento
        </Button>
      </div>

      {/* Leituras Orbitais Reais / Prontidão */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              sensor: 'ndvi' as OrbitalSensorCategory,
              code: 'NDVI',
              name: 'Vigor Vegetativo',
              fallbackSource: 'NASA HLS L30/S30 · MODIS',
            },
            {
              sensor: 'evi' as OrbitalSensorCategory,
              code: 'EVI',
              name: 'Biomassa Densa',
              fallbackSource: 'NASA HLS L30/S30 · MODIS',
            },
            {
              sensor: 'soil_moisture' as OrbitalSensorCategory,
              code: 'SMAP',
              name: 'Umidade do Solo',
              fallbackSource: 'NASA SMAP SPL4SMGP',
            },
            {
              sensor: 'lst' as OrbitalSensorCategory,
              code: 'LST',
              name: 'Temperatura de Superfície',
              fallbackSource: 'NASA ECOSTRESS L2T LSTE V002',
            },
          ] as const
        ).map((card) => {
          const matching = orbitalObs.filter((o) => o.sensorKey === card.sensor);
          const latest = matching[matching.length - 1];
          return (
            <div key={card.code} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono font-semibold text-navy-900">{card.code}</p>
                {latest && (
                  <span className="text-xs font-mono font-bold text-agro-700">
                    {latest.mean} {latest.unit}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 font-medium">{card.name}</p>
              <p className="text-[11px] text-slate-500 pt-1">
                {latest
                  ? `${latest.sourceLabel} · ${
                      latest.observedAt.includes('T')
                        ? formatDateTimeBr(latest.observedAt)
                        : formatDateBr(latest.date)
                    }`
                  : `${card.fallbackSource} · Sem extração concluída`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(['todas', 'informativo', 'atencao', 'critico'] as const).map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => setSeverityFilter(sev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              severityFilter === sev
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {sev === 'todas' ? 'Todos os níveis' : SEVERITY_LABEL[sev].text}
          </button>
        ))}
      </div>

      {filteredObservations.length === 0 ? (
        <EmptyState
          title="Nenhum registro de campo nesta seleção"
          description="Registre inspeções fenológicas, ocorrências fitossanitárias ou leituras de pluviômetro da fazenda."
          actionLabel="Registrar primeiro apontamento"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <DataCard title="Registros de monitoramento" noPadding>
          <div className="divide-y divide-slate-100">
            {filteredObservations.map((obs) => {
              const plot = workspace.plots.find((pl) => pl.id === obs.plotId);
              const sevInfo = SEVERITY_LABEL[obs.severity];
              return (
                <div key={obs.id} className="p-5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-navy-900">
                        {plot?.code || obs.plotId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateBr(obs.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${sevInfo.cls}`}>{sevInfo.text}</span>
                      {obs.isDemo && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Exemplo demonstrativo</span>
                        </>
                      )}
                    </div>
                    {typeof obs.localRainMm === 'number' && (
                      <span className="text-xs font-mono tabular-nums text-navy-800 font-semibold">
                        Pluviômetro local: {obs.localRainMm.toFixed(1)} mm
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900">{obs.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{obs.description}</p>
                </div>
              );
            })}
          </div>
        </DataCard>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar apontamento de campo"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="obs-plot"
              label="Talhão"
              value={plotId}
              onChange={(e) => setPlotId(e.target.value)}
              error={errors.plotId}
              options={availablePlots.map((pl) => ({
                value: pl.id,
                label: `${pl.code} — ${pl.name}`,
              }))}
            />
            <InputField
              id="obs-date"
              label="Data da inspeção"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="obs-cat"
              label="Categoria"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as FieldObservation['category'])
              }
              options={[
                { value: 'fenologia', label: 'Fenologia / Estande' },
                { value: 'fitossanidade', label: 'Fitossanidade (Pragas/Doenças)' },
                { value: 'pluviometria_local', label: 'Pluviometria local' },
                { value: 'solo', label: 'Condição do solo' },
                { value: 'manejo', label: 'Manejo operacional' },
              ]}
            />
            <SelectField
              id="obs-sev"
              label="Nível de severidade"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ObservationSeverity)}
              options={[
                { value: 'informativo', label: 'Informativo' },
                { value: 'atencao', label: 'Atenção' },
                { value: 'critico', label: 'Crítico' },
              ]}
            />
          </div>

          <InputField
            id="obs-title"
            label="Título resumido"
            placeholder="Ex.: Inspeção de emergência em V2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            required
          />

          <InputField
            id="obs-rain"
            label="Chuva medida no pluviômetro local (mm, opcional)"
            type="number"
            step="0.5"
            placeholder="Ex.: 14.5"
            value={localRainMm}
            onChange={(e) => setLocalRainMm(e.target.value)}
          />

          <TextareaField
            id="obs-desc"
            label="Descrição detalhada"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar apontamento
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
