import React, { useState } from 'react';
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { InputField, SelectField } from '../../ui/FormControls';
import type {
  AgrolynxWorkspaceData,
  AuthUser,
  PlatformPreferences,
} from '../../../types/agrolynx';

interface SettingsModuleProps {
  user: AuthUser;
  workspace: AgrolynxWorkspaceData;
  onUpdateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'organization' | 'region' | 'role'>>) => void;
  onUpdatePreferences: (prefs: Partial<PlatformPreferences>) => Promise<void>;
  onResetDemoSeed: () => Promise<void>;
  onClearAllData: () => Promise<void>;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  user,
  workspace,
  onUpdateProfile,
  onUpdatePreferences,
  onResetDemoSeed,
  onClearAllData,
}) => {
  const [name, setName] = useState(user.name);
  const [organization, setOrganization] = useState(user.organization);
  const [region, setRegion] = useState(user.region);
  const [role, setRole] = useState<AuthUser['role']>(user.role);
  const [areaUnit, setAreaUnit] = useState<PlatformPreferences['areaUnit']>(
    workspace.preferences.areaUnit
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'save' | 'reset' | 'clear' | null>(null);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(null);
    setBusyAction('save');
    try {
      onUpdateProfile({
        name: name.trim() || user.name,
        organization: organization.trim() || user.organization,
        region: region.trim() || user.region,
        role,
      });
      await onUpdatePreferences({ areaUnit });
      setSavedNotice('Perfil e preferências atualizados localmente.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetDemo = async () => {
    setSavedNotice(null);
    setBusyAction('reset');
    try {
      await onResetDemoSeed();
      setSavedNotice('Dados demonstrativos de referência restaurados.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearData = async () => {
    setSavedNotice(null);
    setBusyAction('clear');
    try {
      await onClearAllData();
      setSavedNotice('Todos os registros demonstrativos e locais foram limpos.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
          Configurações da Plataforma
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Perfil técnico, unidades de medida e gerenciamento do ambiente local demonstrativo.
        </p>
      </div>

      {savedNotice && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-agro-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <DataCard title="Perfil do usuário e preferências">
            <form onSubmit={handleSaveAll} className="space-y-4">
              <InputField
                id="set-name"
                label="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <InputField
                id="set-email"
                label="E-mail (identificador da sessão)"
                value={user.email}
                disabled
                className="bg-slate-50 text-slate-500"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="set-org"
                  label="Organização / Fazenda"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  required
                />
                <InputField
                  id="set-region"
                  label="Região agrícola"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                  id="set-role"
                  label="Função"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AuthUser['role'])}
                  options={[
                    { value: 'agronomo', label: 'Eng. Agrônomo(a)' },
                    { value: 'produtor', label: 'Produtor(a) Rural' },
                    { value: 'gestor', label: 'Gestor(a) de Operações' },
                  ]}
                />
                <SelectField
                  id="set-unit"
                  label="Unidade de área"
                  value={areaUnit}
                  onChange={(e) =>
                    setAreaUnit(e.target.value as PlatformPreferences['areaUnit'])
                  }
                  options={[
                    { value: 'ha', label: 'Hectares (ha)' },
                    { value: 'alqueire_paulista', label: 'Alqueire Paulista (2,42 ha)' },
                  ]}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={busyAction === 'save'}
                >
                  Salvar alterações
                </Button>
              </div>
            </form>
          </DataCard>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <DataCard
            title="Armazenamento e dados demonstrativos"
            subtitle="Controle explícito dos dados locais desta etapa"
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Você pode limpar todos os dados de exemplo para iniciar um cadastro do zero, ou
                restaurar a fazenda modelo para testar fluxos e relatórios.
              </p>

              <div className="flex flex-col gap-2.5">
                <Button
                  variant="outline"
                  onClick={handleResetDemo}
                  loading={busyAction === 'reset'}
                  icon={<RotateCcw className="w-4 h-4" />}
                >
                  Restaurar dados demonstrativos
                </Button>
                <Button
                  variant="danger"
                  onClick={handleClearData}
                  loading={busyAction === 'clear'}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Limpar todos os registros locais
                </Button>
              </div>
            </div>
          </DataCard>

          <DemoNotice
            variant="integration"
            title="Chaves de API e Banco PostgreSQL"
            description="Nenhuma chave de API é solicitada ou armazenada no navegador nesta primeira versão. As credenciais futuras da NASA Earthdata e PostgreSQL serão configuradas exclusivamente no servidor."
          />
        </div>
      </div>
    </div>
  );
};
