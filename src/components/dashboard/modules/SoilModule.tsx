import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { InputField, SelectField, TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { formatDateBr } from '../../../utils/validation';
import type { AgrolynxWorkspaceData, SoilSample } from '../../../types/agrolynx';

interface SoilModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddSoilSample: (
    input: Omit<SoilSample, 'id' | 'isDemo' | 'source'>
  ) => Promise<void>;
}

export const SoilModule: React.FC<SoilModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddSoilSample,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const availablePlots = useMemo(
    () =>
      activeProperty
        ? workspace.plots.filter((pl) => pl.propertyId === activeProperty.id)
        : workspace.plots,
    [workspace.plots, activeProperty]
  );

  const [plotId, setPlotId] = useState(availablePlots[0]?.id || '');
  const [collectedAt, setCollectedAt] = useState('2026-11-01');
  const [depthLabel, setDepthLabel] = useState<SoilSample['depthLabel']>('0-5 cm');
  const [phH2O, setPhH2O] = useState('5.8');
  const [clayPercent, setClayPercent] = useState('42');
  const [siltPercent, setSiltPercent] = useState('20');
  const [sandPercent, setSandPercent] = useState('38');
  const [organicCarbon, setOrganicCarbon] = useState('18.5');
  const [cec, setCec] = useState('9.2');
  const [notes, setNotes] = useState('');

  const filteredSamples = useMemo(() => {
    if (!activeProperty) return workspace.soilSamples;
    return workspace.soilSamples.filter((s) => s.propertyId === activeProperty.id);
  }, [workspace.soilSamples, activeProperty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPlotId = plotId || availablePlots[0]?.id || '';
    const ph = Number(phH2O);
    const clay = Number(clayPercent);
    const silt = Number(siltPercent);
    const sand = Number(sandPercent);
    const soc = Number(organicCarbon);
    const cecNum = Number(cec);

    if (!targetPlotId) errs.plotId = 'Selecione um talhão.';
    if (!Number.isFinite(ph) || ph < 3 || ph > 9.5) errs.phH2O = 'pH deve estar entre 3,0 e 9,5.';
    if (Math.round(clay + silt + sand) !== 100) {
      errs.granulometry = 'A soma de argila + silte + areia deve totalizar 100%.';
    }
    if (!Number.isFinite(soc) || soc < 0) errs.organicCarbon = 'Valor inválido para carbono orgânico.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const targetPlot = workspace.plots.find((pl) => pl.id === targetPlotId);
    setSubmitting(true);
    try {
      await onAddSoilSample({
        propertyId: targetPlot?.propertyId || activeProperty?.id || '',
        plotId: targetPlotId,
        collectedAt,
        depthLabel,
        phH2O: ph,
        clayPercent: clay,
        siltPercent: silt,
        sandPercent: sand,
        organicCarbonGKg: soc,
        cecCmolKg: Number.isFinite(cecNum) ? cecNum : undefined,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
      setErrors({});
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Solo e Pedologia
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Laudos laboratoriais locais preparados para cruzamento com SoilGrids v2.0 e umidade SMAP.
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
          Registrar análise de solo
        </Button>
      </div>

      <DemoNotice
        variant="integration"
        title="Integração SoilGrids v2.0 e SMAP em preparação"
        description="Enquanto a consulta automática por coordenadas ao SoilGrids (250 m) e SMAP (9 km) não está conectada, você pode registrar suas análises laboratoriais reais abaixo."
      />

      {filteredSamples.length === 0 ? (
        <EmptyState
          title="Nenhuma análise de solo registrada para esta propriedade"
          description="Lance os resultados de textura (argila, silte, areia), pH e carbono orgânico do seu talhão."
          actionLabel="Registrar primeira análise"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <DataCard
          title="Perfis e amostras cadastradas"
          subtitle={
            activeProperty
              ? `Propriedade: ${activeProperty.name}`
              : 'Todas as propriedades'
          }
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Talhão</th>
                  <th className="py-3 px-4 font-semibold">Coleta</th>
                  <th className="py-3 px-4 font-semibold">Profundidade</th>
                  <th className="py-3 px-4 font-semibold text-right">pH (H₂O)</th>
                  <th className="py-3 px-4 font-semibold text-right">Argila / Silte / Areia</th>
                  <th className="py-3 px-4 font-semibold text-right">C. Org (g/kg)</th>
                  <th className="py-3 px-4 font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSamples.map((sample) => {
                  const plot = workspace.plots.find((pl) => pl.id === sample.plotId);
                  return (
                    <tr key={sample.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-medium text-navy-900">
                        {plot ? `${plot.code} — ${plot.name}` : sample.plotId}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {formatDateBr(sample.collectedAt)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {sample.depthLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-navy-900">
                        {sample.phH2O.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {sample.clayPercent}% / {sample.siltPercent}% / {sample.sandPercent}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {sample.organicCarbonGKg.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {sample.isDemo ? 'Exemplo estrutural' : 'Laudo usuário'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      {/* Camadas SoilGrids preparadas */}
      <DataCard
        title="Camadas de referência SoilGrids v2.0 (Aguardando backend)"
        subtitle="Variáveis pedológicas que serão consultadas automaticamente para cada centróide"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {[
            { name: 'clay (Argila)', depth: '0–5 / 5–15 / 15–30 cm', unit: 'g/kg' },
            { name: 'sand (Areia)', depth: '0–5 / 5–15 / 15–30 cm', unit: 'g/kg' },
            { name: 'phh2o (pH em Água)', depth: '0–5 / 5–15 / 15–30 cm', unit: 'pH × 10' },
            { name: 'soc (Carbono Orgânico)', depth: '0–5 / 5–15 / 15–30 cm', unit: 'dg/kg' },
          ].map((item) => (
            <div key={item.name} className="border border-slate-200 rounded-lg p-3 space-y-1">
              <p className="font-mono font-semibold text-navy-900">{item.name}</p>
              <p className="text-slate-500">{item.depth}</p>
              <p className="text-slate-400 font-mono">Unidade: {item.unit} · Pendente</p>
            </div>
          ))}
        </div>
      </DataCard>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar análise laboratorial de solo"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="soil-plot"
              label="Talhão"
              value={plotId}
              onChange={(e) => setPlotId(e.target.value)}
              error={errors.plotId}
              options={availablePlots.map((pl) => ({
                value: pl.id,
                label: `${pl.code} — ${pl.name}`,
              }))}
            />
            <SelectField
              id="soil-depth"
              label="Camada de profundidade"
              value={depthLabel}
              onChange={(e) =>
                setDepthLabel(e.target.value as SoilSample['depthLabel'])
              }
              options={[
                { value: '0-5 cm', label: '0-5 cm' },
                { value: '5-15 cm', label: '5-15 cm' },
                { value: '15-30 cm', label: '15-30 cm' },
                { value: '30-60 cm', label: '30-60 cm' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField
              id="soil-date"
              label="Data da coleta"
              type="date"
              value={collectedAt}
              onChange={(e) => setCollectedAt(e.target.value)}
              required
            />
            <InputField
              id="soil-ph"
              label="pH (H₂O)"
              type="number"
              step="0.1"
              value={phH2O}
              onChange={(e) => setPhH2O(e.target.value)}
              error={errors.phH2O}
              required
            />
            <InputField
              id="soil-soc"
              label="Carbono orgânico (g/kg)"
              type="number"
              step="0.1"
              value={organicCarbon}
              onChange={(e) => setOrganicCarbon(e.target.value)}
              error={errors.organicCarbon}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InputField
              id="soil-clay"
              label="Argila (%)"
              type="number"
              value={clayPercent}
              onChange={(e) => setClayPercent(e.target.value)}
              required
            />
            <InputField
              id="soil-silt"
              label="Silte (%)"
              type="number"
              value={siltPercent}
              onChange={(e) => setSiltPercent(e.target.value)}
              required
            />
            <InputField
              id="soil-sand"
              label="Areia (%)"
              type="number"
              value={sandPercent}
              onChange={(e) => setSandPercent(e.target.value)}
              required
            />
          </div>
          {errors.granulometry && (
            <p className="text-xs text-rose-700 font-medium">{errors.granulometry}</p>
          )}

          <InputField
            id="soil-cec"
            label="CTC — Capacidade de Troca Catiônica (cmolc/kg, opcional)"
            type="number"
            step="0.1"
            value={cec}
            onChange={(e) => setCec(e.target.value)}
          />

          <TextareaField
            id="soil-notes"
            label="Observações laboratoriais (opcional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar análise
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
