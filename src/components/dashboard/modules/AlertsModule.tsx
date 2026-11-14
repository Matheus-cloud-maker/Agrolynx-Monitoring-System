import React, { useMemo, useState } from 'react';
import { BellPlus, Check, CheckCheck } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { InputField, SelectField } from '../../ui/FormControls';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/StateViews';
import { formatDateTimeBr } from '../../../utils/validation';
import type {
  AgrolynxWorkspaceData,
  AlertRule,
  AlertStatus,
} from '../../../types/agrolynx';

interface AlertsModuleProps {
  workspace: AgrolynxWorkspaceData;
  selectedPropertyId: string;
  onAddRule: (input: Omit<AlertRule, 'id' | 'isDemo'>) => Promise<void>;
  onToggleRule: (ruleId: string) => Promise<void>;
  onUpdateAlertStatus: (alertId: string, status: AlertStatus) => Promise<void>;
}

const STATUS_TEXT: Record<AlertStatus, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'text-amber-700' },
  reconhecido: { label: 'Reconhecido', cls: 'text-navy-800' },
  resolvido: { label: 'Resolvido', cls: 'text-agro-700' },
};

export const AlertsModule: React.FC<AlertsModuleProps> = ({
  workspace,
  selectedPropertyId,
  onAddRule,
  onToggleRule,
  onUpdateAlertStatus,
}) => {
  const [statusFilter, setStatusFilter] = useState<'todos' | AlertStatus>('todos');
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeProperty =
    workspace.properties.find((p) => p.id === selectedPropertyId) ?? workspace.properties[0];

  const [ruleName, setRuleName] = useState('');
  const [dataSource, setDataSource] = useState<AlertRule['dataSource']>('SMAP');
  const [parameter, setParameter] = useState('sm_surface');
  const [condition, setCondition] = useState<AlertRule['condition']>('menor_que');
  const [threshold, setThreshold] = useState('0.15');
  const [unit, setUnit] = useState('m³/m³');

  const filteredAlerts = useMemo(() => {
    return workspace.alerts.filter((a) => {
      const propOk = activeProperty ? a.propertyId === activeProperty.id : true;
      const stOk = statusFilter === 'todos' ? true : a.status === statusFilter;
      return propOk && stOk;
    });
  }, [workspace.alerts, activeProperty, statusFilter]);

  const rules = useMemo(() => {
    return activeProperty
      ? workspace.alertRules.filter((r) => r.propertyId === activeProperty.id)
      : workspace.alertRules;
  }, [workspace.alertRules, activeProperty]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const val = Number(threshold);

    if (!activeProperty) errs.prop = 'Cadastre ou selecione uma propriedade.';
    if (ruleName.trim().length < 3) errs.ruleName = 'Informe o nome da regra.';
    if (parameter.trim().length < 2) errs.parameter = 'Informe o código da variável.';
    if (!Number.isFinite(val)) errs.threshold = 'Informe um limiar numérico válido.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await onAddRule({
        propertyId: activeProperty!.id,
        name: ruleName.trim(),
        dataSource,
        parameter: parameter.trim(),
        condition,
        thresholdValue: val,
        unit: unit.trim() || '-',
        enabled: true,
      });
      setRuleModalOpen(false);
      setRuleName('');
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
            Central de Alertas e Regras
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Configuração de limiares operacionais preparados para disparo automático com dados NASA.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          disabled={!activeProperty}
          onClick={() => {
            setErrors({});
            setRuleModalOpen(true);
          }}
          icon={<BellPlus className="w-4 h-4" />}
        >
          Nova regra de alerta
        </Button>
      </div>

      <DemoNotice
        variant="demo"
        title="Monitor de disparo automático aguardando ingestão"
        description="As regras configuradas aqui já ficam armazenadas no seu perfil. O disparo automático dependerá da conexão futura com NASA POWER, GPM IMERG, SMAP e ECOSTRESS."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Fila de Alertas */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['todos', 'ativo', 'reconhecido', 'resolvido'] as const).map((st) => (
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
                {st === 'todos' ? 'Todos' : STATUS_TEXT[st].label}
              </button>
            ))}
          </div>

          {filteredAlerts.length === 0 ? (
            <EmptyState
              title="Nenhum alerta neste filtro"
              description="Quando eventos forem disparados por regras ou testes operacionais, eles aparecerão nesta fila."
            />
          ) : (
            <DataCard title="Fila operacional de alertas" noPadding>
              <div className="divide-y divide-slate-100">
                {filteredAlerts.map((alert) => {
                  const stInfo = STATUS_TEXT[alert.status];
                  return (
                    <div key={alert.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${stInfo.cls}`}>{stInfo.label}</span>
                          <span aria-hidden="true">·</span>
                          <span>{alert.source}</span>
                        </div>
                        <span className="font-mono tabular-nums">
                          {formatDateTimeBr(alert.createdAt)}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-navy-900">{alert.title}</h3>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {alert.message}
                        </p>
                      </div>

                      {alert.status !== 'resolvido' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {alert.status === 'ativo' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUpdateAlertStatus(alert.id, 'reconhecido')}
                              icon={<Check className="w-3.5 h-3.5" />}
                            >
                              Reconhecer
                            </Button>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onUpdateAlertStatus(alert.id, 'resolvido')}
                            icon={<CheckCheck className="w-3.5 h-3.5" />}
                          >
                            Marcar como resolvido
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DataCard>
          )}
        </div>

        {/* Regras Configuradas */}
        <div className="lg:col-span-5">
          <DataCard
            title="Regras configuradas"
            subtitle="Limiares por fonte e variável"
          >
            {rules.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma regra configurada para esta propriedade.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <div key={rule.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="space-y-0.5 text-xs">
                      <p className="font-semibold text-navy-900">{rule.name}</p>
                      <p className="text-slate-500 font-mono">
                        {rule.dataSource} · {rule.parameter} ({rule.condition.replace(/_/g, ' ')}{' '}
                        {rule.thresholdValue} {rule.unit})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleRule(rule.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer border shrink-0 ${
                        rule.enabled
                          ? 'bg-emerald-50 text-agro-800 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {rule.enabled ? 'Ativa' : 'Pausada'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DataCard>
        </div>
      </div>

      <Modal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        title="Criar regra de monitoramento"
      >
        <form onSubmit={handleCreateRule} noValidate className="space-y-4">
          <InputField
            id="rule-name"
            label="Nome da regra"
            placeholder="Ex.: Risco de estresse térmico foliar"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            error={errors.ruleName}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="rule-source"
              label="Fonte de dados"
              value={dataSource}
              onChange={(e) =>
                setDataSource(e.target.value as AlertRule['dataSource'])
              }
              options={[
                { value: 'SMAP', label: 'SMAP (Umidade do solo)' },
                { value: 'GPM IMERG', label: 'GPM IMERG (Precipitação)' },
                { value: 'NASA POWER', label: 'NASA POWER (Clima)' },
                { value: 'ECOSTRESS', label: 'ECOSTRESS (Estresse térmico)' },
                { value: 'Earthdata HLS', label: 'Earthdata HLS (NDVI/EVI)' },
                { value: 'Registro Local', label: 'Registro Local' },
              ]}
            />
            <InputField
              id="rule-param"
              label="Código da variável"
              placeholder="sm_surface"
              value={parameter}
              onChange={(e) => setParameter(e.target.value)}
              error={errors.parameter}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              id="rule-cond"
              label="Condição"
              value={condition}
              onChange={(e) =>
                setCondition(e.target.value as AlertRule['condition'])
              }
              options={[
                { value: 'menor_que', label: 'Menor que' },
                { value: 'maior_que', label: 'Maior que' },
                { value: 'variacao_acima_de', label: 'Variação acima de' },
              ]}
            />
            <InputField
              id="rule-val"
              label="Limiar"
              type="number"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              error={errors.threshold}
              required
            />
            <InputField
              id="rule-unit"
              label="Unidade"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRuleModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Salvar regra
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
