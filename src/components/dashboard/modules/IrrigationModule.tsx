import React, { useMemo, useState } from 'react';
import { Droplets, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { InputField, SelectField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { formatDateBr } from '../../../utils/validation';
import type {
  AgrolynxWorkspaceData,
  IrrigationEvent,
  IrrigationSector,
} from '../../../types/agrolynx';

interface IrrigationModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddSector: (input: Omit<IrrigationSector, 'id' | 'isDemo'>) => Promise<void>;
  onAddEvent: (input: Omit<IrrigationEvent, 'id' | 'isDemo'>) => Promise<void>;
}

export const IrrigationModule: React.FC<IrrigationModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddSector,
  onAddEvent,
}) => {
  const [sectorModalOpen, setSectorModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calculadora conceitual (claramente marcada como simulação de fórmula)
  const [simEto, setSimEto] = useState('5.2');
  const [simKc, setSimKc] = useState('0.85');
  const [simRain, setSimRain] = useState('0.0');
  const [simEff, setSimEff] = useState('85');

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const availablePlots = useMemo(
    () =>
      activeProperty
        ? workspace.plots.filter((pl) => pl.propertyId === activeProperty.id)
        : workspace.plots,
    [workspace.plots, activeProperty]
  );

  const sectors = useMemo(
    () =>
      activeProperty
        ? workspace.irrigationSectors.filter((s) => s.propertyId === activeProperty.id)
        : workspace.irrigationSectors,
    [workspace.irrigationSectors, activeProperty]
  );

  const events = useMemo(
    () =>
      activeProperty
        ? workspace.irrigationEvents.filter((e) => e.propertyId === activeProperty.id)
        : workspace.irrigationEvents,
    [workspace.irrigationEvents, activeProperty]
  );

  // Form Setor
  const [secPlotId, setSecPlotId] = useState(availablePlots[0]?.id || '');
  const [secName, setSecName] = useState('');
  const [secMethod, setSecMethod] =
    useState<IrrigationSector['method']>('Pivô Central');
  const [secFlow, setSecFlow] = useState('220');
  const [secEff, setSecEff] = useState('85');

  // Form Evento
  const [evtSectorId, setEvtSectorId] = useState(sectors[0]?.id || '');
  const [evtDate, setEvtDate] = useState('2026-11-14');
  const [evtDepth, setEvtDepth] = useState('10.0');
  const [evtDuration, setEvtDuration] = useState('5.5');
  const [evtNotes, setEvtNotes] = useState('');

  const simResult = useMemo(() => {
    const eto = Number(simEto) || 0;
    const kc = Number(simKc) || 0;
    const rain = Number(simRain) || 0;
    const eff = Math.max(Number(simEff) || 85, 10) / 100;
    const etc = eto * kc;
    const netNeed = Math.max(0, etc - rain);
    const grossDepth = netNeed / eff;
    return { etc, netNeed, grossDepth };
  }, [simEto, simKc, simRain, simEff]);

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetPlotId = secPlotId || availablePlots[0]?.id || '';
    const flow = Number(secFlow);
    const eff = Number(secEff);

    if (!targetPlotId) errs.secPlotId = 'Selecione um talhão.';
    if (secName.trim().length < 2) errs.secName = 'Informe o nome do setor/pivô.';
    if (!Number.isFinite(flow) || flow <= 0) errs.secFlow = 'Vazão deve ser positiva.';
    if (!Number.isFinite(eff) || eff < 30 || eff > 100) errs.secEff = 'Eficiência entre 30% e 100%.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const plot = workspace.plots.find((pl) => pl.id === targetPlotId);
    setSubmitting(true);
    try {
      await onAddSector({
        propertyId: plot?.propertyId || activeProperty?.id || '',
        plotId: targetPlotId,
        name: secName.trim(),
        method: secMethod,
        flowRateM3H: flow,
        efficiencyPercent: eff,
        status: 'disponivel',
      });
      setSectorModalOpen(false);
      setSecName('');
      setErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const targetSectorId = evtSectorId || sectors[0]?.id || '';
    const depth = Number(evtDepth);
    const duration = Number(evtDuration);

    if (!targetSectorId) errs.evtSectorId = 'Selecione um setor.';
    if (!Number.isFinite(depth) || depth <= 0) errs.evtDepth = 'Lâmina deve ser maior que zero.';
    if (!Number.isFinite(duration) || duration <= 0) errs.evtDuration = 'Duração deve ser maior que zero.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const sector = workspace.irrigationSectors.find((s) => s.id === targetSectorId);
    setSubmitting(true);
    try {
      await onAddEvent({
        propertyId: sector?.propertyId || activeProperty?.id || '',
        sectorId: targetSectorId,
        date: evtDate,
        appliedDepthMm: depth,
        durationHours: duration,
        notes: evtNotes.trim() || undefined,
      });
      setEventModalOpen(false);
      setEvtNotes('');
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
            Irrigação e Balanço Hídrico
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gestão de pivôs e setores preparados para cruzar ETo (NASA POWER), chuva (GPM IMERG) e
            estresse (ECOSTRESS).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            disabled={availablePlots.length === 0}
            onClick={() => {
              setErrors({});
              setSecPlotId(availablePlots[0]?.id || '');
              setSectorModalOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Novo setor
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={sectors.length === 0}
            onClick={() => {
              setErrors({});
              setEvtSectorId(sectors[0]?.id || '');
              setEventModalOpen(true);
            }}
            icon={<Droplets className="w-4 h-4" />}
          >
            Registrar lâmina
          </Button>
        </div>
      </div>

      <DemoNotice
        variant="integration"
        title="Balanço hídrico automático aguardando NASA POWER + ECOSTRESS + SMAP"
        description="A calculadora abaixo utiliza apenas parâmetros informados manualmente por você como exercício estrutural da fórmula agronômica (ETc = ETo × Kc), sem medições reais de satélite."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <DataCard title="Setores e equipamentos" subtitle="Equipamentos vinculados à propriedade">
            {sectors.length === 0 ? (
              <EmptyState
                title="Nenhum setor cadastrado"
                description="Cadastre pivôs, setores de gotejamento ou aspersão para registrar lâminas aplicadas."
                actionLabel="Cadastrar setor"
                onAction={() => setSectorModalOpen(true)}
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {sectors.map((sec) => {
                  const plot = workspace.plots.find((pl) => pl.id === sec.plotId);
                  return (
                    <div
                      key={sec.id}
                      className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{sec.name}</p>
                        <p className="text-slate-500">
                          {sec.method} · Talhão {plot?.code || sec.plotId}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 font-mono tabular-nums text-slate-700">
                        <span>{sec.flowRateM3H} m³/h</span>
                        <span>Efic. {sec.efficiencyPercent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DataCard>

          <DataCard title="Lâminas aplicadas (registros)" noPadding>
            {events.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">
                Nenhum evento de irrigação lançado até o momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-4 font-semibold">Data</th>
                      <th className="py-2.5 px-4 font-semibold">Setor</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Lâmina (mm)</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Duração (h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {events.map((evt) => {
                      const sec = workspace.irrigationSectors.find((s) => s.id === evt.sectorId);
                      return (
                        <tr key={evt.id}>
                          <td className="py-2.5 px-4 text-slate-700">{formatDateBr(evt.date)}</td>
                          <td className="py-2.5 px-4 font-sans text-navy-900 font-medium">
                            {sec?.name || evt.sectorId}
                          </td>
                          <td className="py-2.5 px-4 text-right text-agro-800 font-semibold">
                            {evt.appliedDepthMm.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-600">
                            {evt.durationHours.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DataCard>
        </div>

        {/* Simulador conceitual de lâmina */}
        <div className="lg:col-span-5">
          <DataCard
            title="Simulador conceitual de lâmina"
            subtitle="Modelo demonstrativo parametrizado pelo usuário"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  id="sim-eto"
                  label="ETo referência (mm/dia)"
                  type="number"
                  step="0.1"
                  value={simEto}
                  onChange={(e) => setSimEto(e.target.value)}
                />
                <InputField
                  id="sim-kc"
                  label="Coeficiente Kc"
                  type="number"
                  step="0.05"
                  value={simKc}
                  onChange={(e) => setSimKc(e.target.value)}
                />
                <InputField
                  id="sim-rain"
                  label="Chuva efetiva (mm)"
                  type="number"
                  step="0.5"
                  value={simRain}
                  onChange={(e) => setSimRain(e.target.value)}
                />
                <InputField
                  id="sim-eff"
                  label="Eficiência sistema (%)"
                  type="number"
                  step="1"
                  value={simEff}
                  onChange={(e) => setSimEff(e.target.value)}
                />
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Evapotranspiração da cultura (ETc):</span>
                  <span className="font-mono font-semibold text-navy-900 tabular-nums">
                    {simResult.etc.toFixed(2)} mm/dia
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Necessidade líquida estimada:</span>
                  <span className="font-mono font-semibold text-navy-900 tabular-nums">
                    {simResult.netNeed.toFixed(2)} mm/dia
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-sm">
                  <span className="font-semibold text-navy-900">Lâmina bruta calculada:</span>
                  <span className="font-mono font-bold text-agro-700 tabular-nums">
                    {simResult.grossDepth.toFixed(2)} mm/dia
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Nota: cálculo algébrico simples sobre entradas manuais. Substituir por série
                integrada NASA POWER + ECOSTRESS + SMAP na fase de produção.
              </p>
            </div>
          </DataCard>
        </div>
      </div>

      {/* Modal Novo Setor */}
      <Modal
        open={sectorModalOpen}
        onClose={() => setSectorModalOpen(false)}
        title="Cadastrar setor de irrigação"
      >
        <form onSubmit={handleCreateSector} noValidate className="space-y-4">
          <SelectField
            id="sec-plot"
            label="Talhão atendido"
            value={secPlotId}
            onChange={(e) => setSecPlotId(e.target.value)}
            error={errors.secPlotId}
            options={availablePlots.map((pl) => ({
              value: pl.id,
              label: `${pl.code} — ${pl.name}`,
            }))}
          />
          <InputField
            id="sec-name"
            label="Nome do equipamento / setor"
            placeholder="Ex.: Pivô Central 02"
            value={secName}
            onChange={(e) => setSecName(e.target.value)}
            error={errors.secName}
            required
          />
          <SelectField
            id="sec-method"
            label="Método"
            value={secMethod}
            onChange={(e) =>
              setSecMethod(e.target.value as IrrigationSector['method'])
            }
            options={[
              { value: 'Pivô Central', label: 'Pivô Central' },
              { value: 'Gotejamento Subsuperficial', label: 'Gotejamento Subsuperficial' },
              { value: 'Aspersão Convencional', label: 'Aspersão Convencional' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              id="sec-flow"
              label="Vazão (m³/h)"
              type="number"
              value={secFlow}
              onChange={(e) => setSecFlow(e.target.value)}
              error={errors.secFlow}
              required
            />
            <InputField
              id="sec-eff"
              label="Eficiência (%)"
              type="number"
              value={secEff}
              onChange={(e) => setSecEff(e.target.value)}
              error={errors.secEff}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSectorModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar setor
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Novo Evento */}
      <Modal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title="Registrar aplicação de lâmina"
      >
        <form onSubmit={handleCreateEvent} noValidate className="space-y-4">
          <SelectField
            id="evt-sec"
            label="Setor"
            value={evtSectorId}
            onChange={(e) => setEvtSectorId(e.target.value)}
            error={errors.evtSectorId}
            options={sectors.map((s) => ({ value: s.id, label: s.name }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField
              id="evt-date"
              label="Data"
              type="date"
              value={evtDate}
              onChange={(e) => setEvtDate(e.target.value)}
              required
            />
            <InputField
              id="evt-depth"
              label="Lâmina (mm)"
              type="number"
              step="0.5"
              value={evtDepth}
              onChange={(e) => setEvtDepth(e.target.value)}
              error={errors.evtDepth}
              required
            />
            <InputField
              id="evt-dur"
              label="Duração (horas)"
              type="number"
              step="0.5"
              value={evtDuration}
              onChange={(e) => setEvtDuration(e.target.value)}
              error={errors.evtDuration}
              required
            />
          </div>
          <InputField
            id="evt-notes"
            label="Observações (opcional)"
            value={evtNotes}
            onChange={(e) => setEvtNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEventModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Registrar lâmina
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
