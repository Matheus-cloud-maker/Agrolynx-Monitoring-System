import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { InputField, SelectField, TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { formatDateBr } from '../../../utils/validation';
import type { AgrolynxWorkspaceData, CropCycle, PhenologicalStage } from '../../../types/agrolynx';

interface CropsModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddCrop: (input: Omit<CropCycle, 'id' | 'isDemo'>) => Promise<void>;
}

const STAGE_LABELS: Record<PhenologicalStage, string> = {
  pre_plantio: 'Pré-plantio',
  emergencia: 'Emergência',
  vegetativo: 'Vegetativo',
  florescimento: 'Florescimento',
  enchimento_graos: 'Enchimento de grãos',
  maturacao: 'Maturação',
  colhido: 'Colhido',
};

export const CropsModule: React.FC<CropsModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddCrop,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>('todos');
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
  const [cropName, setCropName] = useState('Soja');
  const [cultivar, setCultivar] = useState('');
  const [season, setSeason] = useState('2026/2027');
  const [plantingDate, setPlantingDate] = useState('2026-10-15');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('2027-02-15');
  const [stage, setStage] = useState<PhenologicalStage>('vegetativo');
  const [targetKc, setTargetKc] = useState('0.85');
  const [notes, setNotes] = useState('');

  const filteredCrops = useMemo(() => {
    return workspace.crops.filter((c) => {
      const propMatch = activeProperty ? c.propertyId === activeProperty.id : true;
      const stageMatch = stageFilter === 'todos' ? true : c.stage === stageFilter;
      return propMatch && stageMatch;
    });
  }, [workspace.crops, activeProperty, stageFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPlotId = plotId || availablePlots[0]?.id || '';
    const kc = Number(targetKc);

    if (!targetPlotId) errs.plotId = 'Selecione um talhão.';
    if (cropName.trim().length < 2) errs.cropName = 'Informe a cultura.';
    if (cultivar.trim().length < 2) errs.cultivar = 'Informe a cultivar/híbrido.';
    if (!Number.isFinite(kc) || kc <= 0 || kc > 2) errs.targetKc = 'Kc deve estar entre 0,1 e 2,0.';
    if (expectedHarvestDate < plantingDate) {
      errs.expectedHarvestDate = 'Data prevista de colheita deve ser posterior ao plantio.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const plot = workspace.plots.find((pl) => pl.id === targetPlotId);
    setSubmitting(true);
    try {
      await onAddCrop({
        propertyId: plot?.propertyId || activeProperty?.id || '',
        plotId: targetPlotId,
        cropName: cropName.trim(),
        cultivar: cultivar.trim(),
        season: season.trim(),
        plantingDate,
        expectedHarvestDate,
        stage,
        targetKc: kc,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
      setCultivar('');
      setNotes('');
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
            Culturas e Safras
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Controle de culturas implantadas, cultivares, janelas fenológicas e coeficiente Kc.
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
          Registrar cultura
        </Button>
      </div>

      {/* Filtro por estágio */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setStageFilter('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
            stageFilter === 'todos'
              ? 'bg-navy-900 text-white border-navy-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todos os estágios
        </button>
        {(Object.keys(STAGE_LABELS) as PhenologicalStage[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStageFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              stageFilter === key
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {STAGE_LABELS[key]}
          </button>
        ))}
      </div>

      {filteredCrops.length === 0 ? (
        <EmptyState
          title="Nenhuma cultura encontrada neste filtro"
          description="Cadastre uma cultura vinculada a um talhão para acompanhar o calendário fenológico e o coeficiente Kc."
          actionLabel="Cadastrar cultura"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <DataCard
          title="Safras vinculadas"
          subtitle={activeProperty ? `Propriedade: ${activeProperty.name}` : undefined}
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Cultura / Cultivar</th>
                  <th className="py-3 px-4 font-semibold">Talhão</th>
                  <th className="py-3 px-4 font-semibold">Safra</th>
                  <th className="py-3 px-4 font-semibold">Estágio</th>
                  <th className="py-3 px-4 font-semibold">Plantio</th>
                  <th className="py-3 px-4 font-semibold">Colheita prev.</th>
                  <th className="py-3 px-4 font-semibold text-right">Kc alvo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCrops.map((crop) => {
                  const plot = workspace.plots.find((pl) => pl.id === crop.plotId);
                  return (
                    <tr key={crop.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-navy-900">{crop.cropName}</p>
                        <p className="text-slate-500">{crop.cultivar}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {plot ? plot.code : crop.plotId}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                        {crop.season}
                      </td>
                      <td className="py-3 px-4 text-agro-800 font-medium">
                        {STAGE_LABELS[crop.stage]}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {formatDateBr(crop.plantingDate)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {formatDateBr(crop.expectedHarvestDate)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-navy-900">
                        {crop.targetKc.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar cultura no talhão"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <SelectField
            id="crop-plot"
            label="Talhão"
            value={plotId}
            onChange={(e) => setPlotId(e.target.value)}
            error={errors.plotId}
            options={availablePlots.map((pl) => ({
              value: pl.id,
              label: `${pl.code} — ${pl.name}`,
            }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="crop-name"
              label="Cultura"
              value={cropName}
              onChange={(e) => setCropName(e.target.value)}
              error={errors.cropName}
              options={[
                { value: 'Soja', label: 'Soja' },
                { value: 'Milho', label: 'Milho' },
                { value: 'Algodão', label: 'Algodão' },
                { value: 'Café', label: 'Café' },
                { value: 'Cana-de-açúcar', label: 'Cana-de-açúcar' },
                { value: 'Trigo', label: 'Trigo' },
                { value: 'Feijão', label: 'Feijão' },
              ]}
            />
            <InputField
              id="crop-cultivar"
              label="Cultivar / Híbrido"
              placeholder="Ex.: TMG 7062 IPRO"
              value={cultivar}
              onChange={(e) => setCultivar(e.target.value)}
              error={errors.cultivar}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField
              id="crop-season"
              label="Safra"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              required
            />
            <SelectField
              id="crop-stage"
              label="Estágio fenológico"
              value={stage}
              onChange={(e) => setStage(e.target.value as PhenologicalStage)}
              options={(Object.keys(STAGE_LABELS) as PhenologicalStage[]).map((k) => ({
                value: k,
                label: STAGE_LABELS[k],
              }))}
            />
            <InputField
              id="crop-kc"
              label="Kc referência"
              type="number"
              step="0.05"
              value={targetKc}
              onChange={(e) => setTargetKc(e.target.value)}
              error={errors.targetKc}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="crop-plant"
              label="Data de plantio"
              type="date"
              value={plantingDate}
              onChange={(e) => setPlantingDate(e.target.value)}
              required
            />
            <InputField
              id="crop-harvest"
              label="Colheita prevista"
              type="date"
              value={expectedHarvestDate}
              onChange={(e) => setExpectedHarvestDate(e.target.value)}
              error={errors.expectedHarvestDate}
              required
            />
          </div>

          <TextareaField
            id="crop-notes"
            label="Notas agronômicas (opcional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar cultura
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
