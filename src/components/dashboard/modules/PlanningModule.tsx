import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { InputField, SelectField, TextareaField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { formatDateBr } from '../../../utils/validation';
import type {
  AgrolynxWorkspaceData,
  OperationStatus,
  PlannedOperation,
} from '../../../types/agrolynx';

interface PlanningModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddOperation: (input: Omit<PlannedOperation, 'id' | 'isDemo'>) => Promise<void>;
  onUpdateOperationStatus: (id: string, status: OperationStatus) => Promise<void>;
}

const OP_CATEGORY_LABEL: Record<PlannedOperation['category'], string> = {
  preparo_solo: 'Preparo de solo',
  semeadura: 'Semeadura',
  adubacao: 'Adubação',
  defensivos: 'Defensivos',
  irrigacao: 'Irrigação',
  colheita: 'Colheita',
};

const OP_STATUS_LABEL: Record<OperationStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  adiada: 'Adiada',
};

export const PlanningModule: React.FC<PlanningModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddOperation,
  onUpdateOperationStatus,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todas' | OperationStatus>('todas');
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
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PlannedOperation['category']>('adubacao');
  const [scheduledDate, setScheduledDate] = useState('2026-11-25');
  const [responsible, setResponsible] = useState('');
  const [notes, setNotes] = useState('');

  const filteredOperations = useMemo(() => {
    return workspace.operations.filter((op) => {
      const propOk = activeProperty ? op.propertyId === activeProperty.id : true;
      const stOk = statusFilter === 'todas' ? true : op.status === statusFilter;
      return propOk && stOk;
    });
  }, [workspace.operations, activeProperty, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPlotId = plotId || availablePlots[0]?.id || '';

    if (!targetPlotId) errs.plotId = 'Selecione um talhão.';
    if (title.trim().length < 3) errs.title = 'Descreva a operação planejada.';
    if (responsible.trim().length < 2) errs.responsible = 'Informe a equipe ou responsável.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const plot = workspace.plots.find((pl) => pl.id === targetPlotId);
    setSubmitting(true);
    try {
      await onAddOperation({
        propertyId: plot?.propertyId || activeProperty?.id || '',
        plotId: targetPlotId,
        title: title.trim(),
        category,
        scheduledDate,
        responsible: responsible.trim(),
        status: 'pendente',
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
      setTitle('');
      setResponsible('');
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
            Planejamento de Operações
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cronograma agronômico por talhão com atualização de execução em campo.
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
          Agendar operação
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(['todas', 'pendente', 'em_andamento', 'concluida', 'adiada'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              statusFilter === st
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {st === 'todas' ? 'Todas' : OP_STATUS_LABEL[st]}
          </button>
        ))}
      </div>

      {filteredOperations.length === 0 ? (
        <EmptyState
          title="Nenhuma operação encontrada"
          description="Agende atividades de preparo de solo, semeadura, adubação ou colheita para organizar a equipe."
          actionLabel="Agendar primeira operação"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <DataCard title="Agenda operacional" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Data prevista</th>
                  <th className="py-3 px-4 font-semibold">Talhão</th>
                  <th className="py-3 px-4 font-semibold">Operação</th>
                  <th className="py-3 px-4 font-semibold">Categoria</th>
                  <th className="py-3 px-4 font-semibold">Responsável</th>
                  <th className="py-3 px-4 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOperations.map((op) => {
                  const plot = workspace.plots.find((pl) => pl.id === op.plotId);
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatDateBr(op.scheduledDate)}
                      </td>
                      <td className="py-3 px-4 font-mono text-navy-900 font-semibold">
                        {plot?.code || op.plotId}
                      </td>
                      <td className="py-3 px-4 font-medium text-navy-900">{op.title}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {OP_CATEGORY_LABEL[op.category]}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{op.responsible}</td>
                      <td className="py-3 px-4">
                        <select
                          aria-label={`Atualizar status de ${op.title}`}
                          value={op.status}
                          onChange={(e) =>
                            onUpdateOperationStatus(
                              op.id,
                              e.target.value as OperationStatus
                            )
                          }
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-navy-900"
                        >
                          {(Object.keys(OP_STATUS_LABEL) as OperationStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {OP_STATUS_LABEL[k]}
                            </option>
                          ))}
                        </select>
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
        title="Agendar operação agrícola"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="op-plot"
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
              id="op-cat"
              label="Categoria"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as PlannedOperation['category'])
              }
              options={(Object.keys(OP_CATEGORY_LABEL) as PlannedOperation['category'][]).map(
                (k) => ({
                  value: k,
                  label: OP_CATEGORY_LABEL[k],
                })
              )}
            />
          </div>

          <InputField
            id="op-title"
            label="Descrição da operação"
            placeholder="Ex.: Aplicação de fungicida protetor"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="op-date"
              label="Data prevista"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
            />
            <InputField
              id="op-resp"
              label="Responsável / Equipe"
              placeholder="Ex.: Equipe Pulverização 01"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              error={errors.responsible}
              required
            />
          </div>

          <TextareaField
            id="op-notes"
            label="Recomendações técnicas (opcional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar agendamento
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
