import React, { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CloudSun,
  Droplets,
  FileText,
  Layers,
  LogOut,
  Map as MapIcon,
  Menu,
  Satellite,
  Settings,
  Sprout,
  Tractor,
  TrendingUp,
  X,
} from 'lucide-react';
import { LoadingSkeleton, ErrorBanner } from '../ui/StateViews';
import { workspaceService, RepositoryError } from '../../services/workspaceService';
import { PropertiesModule } from './modules/PropertiesModule';
import { MapModule } from './modules/MapModule';
import { WeatherModule } from './modules/WeatherModule';
import { SoilModule } from './modules/SoilModule';
import { SatellitesModule } from './modules/SatellitesModule';
import { CropsModule } from './modules/CropsModule';
import { IrrigationModule } from './modules/IrrigationModule';
import { MonitoringModule } from './modules/MonitoringModule';
import { AlertsModule } from './modules/AlertsModule';
import { PlanningModule } from './modules/PlanningModule';
import { ReportsModule } from './modules/ReportsModule';
import { SettingsModule } from './modules/SettingsModule';
import type {
  AgrolynxWorkspaceData,
  AuthUser,
  DashboardModuleId,
} from '../../types/agrolynx';

interface DashboardShellProps {
  user: AuthUser;
  onLogout: () => void;
  onUpdateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'organization' | 'region' | 'role'>>) => void;
  onBackToLanding: () => void;
}

interface NavItem {
  id: DashboardModuleId;
  label: string;
  icon: React.ReactNode;
}

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Base Territorial e Orbital',
    items: [
      { id: 'properties', label: 'Propriedades', icon: <Tractor className="w-4 h-4" /> },
      { id: 'map', label: 'Mapa Agrícola', icon: <MapIcon className="w-4 h-4" /> },
      { id: 'weather', label: 'Clima', icon: <CloudSun className="w-4 h-4" /> },
      { id: 'soil', label: 'Solo', icon: <Layers className="w-4 h-4" /> },
      { id: 'satellites', label: 'Satélites e Dados NASA', icon: <Satellite className="w-4 h-4" /> },
    ],
  },
  {
    heading: 'Operação da Safra',
    items: [
      { id: 'crops', label: 'Culturas', icon: <Sprout className="w-4 h-4" /> },
      { id: 'irrigation', label: 'Irrigação', icon: <Droplets className="w-4 h-4" /> },
      { id: 'monitoring', label: 'Monitoramento', icon: <TrendingUp className="w-4 h-4" /> },
      { id: 'alerts', label: 'Alertas', icon: <Bell className="w-4 h-4" /> },
      { id: 'planning', label: 'Planejamento', icon: <CalendarDays className="w-4 h-4" /> },
    ],
  },
  {
    heading: 'Sistema',
    items: [
      { id: 'reports', label: 'Relatórios', icon: <FileText className="w-4 h-4" /> },
      { id: 'settings', label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
    ],
  },
];

export const DashboardShell: React.FC<DashboardShellProps> = ({
  user,
  onLogout,
  onUpdateProfile,
  onBackToLanding,
}) => {
  const [activeModule, setActiveModule] = useState<DashboardModuleId>('properties');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState<AgrolynxWorkspaceData | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceService.loadWorkspace(user.id, true);
      setWorkspace(data);
      setSelectedPropertyId(data.properties[0]?.id || '');
    } catch (err) {
      setError(
        err instanceof RepositoryError
          ? err.message
          : 'Erro ao carregar a área de trabalho.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const persist = async (next: AgrolynxWorkspaceData) => {
    setError(null);
    setWorkspace(next);
    try {
      await workspaceService.saveWorkspace(user.id, next);
      if (
        next.properties.length > 0 &&
        !next.properties.some((p) => p.id === selectedPropertyId)
      ) {
        setSelectedPropertyId(next.properties[0].id);
      }
    } catch (err) {
      setError(
        err instanceof RepositoryError ? err.message : 'Erro ao persistir alterações.'
      );
    }
  };

  const activeNavLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeModule)?.label ||
    'Propriedades';

  const activeAlertsCount =
    workspace?.alerts.filter((a) => a.status === 'ativo').length ?? 0;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-navy-900 text-slate-100 select-none">
      {/* Brand header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-navy-800 shrink-0">
        <button
          type="button"
          onClick={onBackToLanding}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
        >
          <Sprout className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="font-display font-bold text-base tracking-tight text-white">
            AGROLYNX
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Fechar menu lateral"
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Módulos da plataforma" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="space-y-1">
            <p className="px-3 text-[11px] font-medium text-slate-400 pb-1">
              {group.heading}
            </p>
            {group.items.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveModule(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-agro-700 text-white'
                      : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'alerts' && activeAlertsCount > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-amber-300 shrink-0">
                      {activeAlertsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-navy-800 space-y-3 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{user.name}</p>
          <p className="text-[11px] text-slate-400 truncate">{user.organization}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-navy-700 text-xs font-medium text-slate-200 hover:bg-navy-800 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Encerrar sessão</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Sidebar Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-navy-950/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-[272px] max-w-[85vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar do Painel */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu lateral"
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Caminho atual" className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <span className="font-semibold text-navy-900 whitespace-nowrap">AGROLYNX</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-700 font-medium truncate">{activeNavLabel}</span>
            </nav>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
            <span className="hidden sm:inline">
              Ambiente local · NASA Space Apps 2026
            </span>
            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              className="text-navy-800 hover:underline font-medium whitespace-nowrap cursor-pointer"
            >
              Preferências
            </button>
          </div>
        </header>

        {/* Viewport principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {error && <ErrorBanner message={error} onRetry={loadData} />}

          {loading || !workspace ? (
            <LoadingSkeleton rows={5} />
          ) : (
            <>
              {activeModule === 'properties' && (
                <PropertiesModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={setSelectedPropertyId}
                  onAddProperty={async (input) => {
                    const next = workspaceService.addProperty(workspace, input);
                    await persist(next);
                    setSelectedPropertyId(next.properties[0].id);
                  }}
                  onUpdatePropertyDetails={async (propertyId, updates) => {
                    const previous = workspace;
                    const next = workspaceService.updatePropertyDetails(
                      workspace,
                      propertyId,
                      updates
                    );
                    setError(null);
                    setWorkspace(next);
                    try {
                      await workspaceService.saveWorkspace(user.id, next);
                    } catch (err) {
                      setWorkspace(previous);
                      const message =
                        err instanceof RepositoryError
                          ? err.message
                          : 'Erro ao persistir alterações da propriedade.';
                      setError(message);
                      throw err instanceof Error ? err : new RepositoryError(message);
                    }
                  }}
                  onUpdatePropertyBoundary={async (propertyId, boundaryPolygon, boundarySource) => {
                    await persist(
                      workspaceService.updatePropertyBoundary(
                        workspace,
                        propertyId,
                        boundaryPolygon,
                        boundarySource
                      )
                    );
                  }}
                  onDeleteProperty={async (id) => {
                    await persist(workspaceService.deleteProperty(workspace, id));
                  }}
                  onAddPlot={async (input) => {
                    await persist(workspaceService.addPlot(workspace, input));
                  }}
                  onUpdatePlotPolygon={async (plotId, polygon, polygonSource) => {
                    await persist(
                      workspaceService.updatePlotPolygon(
                        workspace,
                        plotId,
                        polygon,
                        polygonSource
                      )
                    );
                  }}
                />
              )}

              {activeModule === 'map' && (
                <MapModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={setSelectedPropertyId}
                  onUpdatePropertyBoundary={async (propertyId, boundaryPolygon, boundarySource) => {
                    await persist(
                      workspaceService.updatePropertyBoundary(
                        workspace,
                        propertyId,
                        boundaryPolygon,
                        boundarySource
                      )
                    );
                  }}
                  onUpdatePlotPolygon={async (plotId, polygon, polygonSource) => {
                    await persist(
                      workspaceService.updatePlotPolygon(
                        workspace,
                        plotId,
                        polygon,
                        polygonSource
                      )
                    );
                  }}
                />
              )}

              {activeModule === 'weather' && (
                <WeatherModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={setSelectedPropertyId}
                />
              )}

              {activeModule === 'soil' && (
                <SoilModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddSoilSample={async (input) => {
                    await persist(workspaceService.addSoilSample(workspace, input));
                  }}
                />
              )}

              {activeModule === 'satellites' && (
                <SatellitesModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={setSelectedPropertyId}
                />
              )}

              {activeModule === 'crops' && (
                <CropsModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddCrop={async (input) => {
                    await persist(workspaceService.addCrop(workspace, input));
                  }}
                />
              )}

              {activeModule === 'irrigation' && (
                <IrrigationModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddSector={async (input) => {
                    await persist(workspaceService.addIrrigationSector(workspace, input));
                  }}
                  onAddEvent={async (input) => {
                    await persist(workspaceService.addIrrigationEvent(workspace, input));
                  }}
                />
              )}

              {activeModule === 'monitoring' && (
                <MonitoringModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddObservation={async (input) => {
                    await persist(workspaceService.addObservation(workspace, input));
                  }}
                />
              )}

              {activeModule === 'alerts' && (
                <AlertsModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddRule={async (input) => {
                    await persist(workspaceService.addAlertRule(workspace, input));
                  }}
                  onToggleRule={async (id) => {
                    await persist(workspaceService.toggleAlertRule(workspace, id));
                  }}
                  onUpdateAlertStatus={async (id, st) => {
                    await persist(workspaceService.updateAlertStatus(workspace, id, st));
                  }}
                />
              )}

              {activeModule === 'planning' && (
                <PlanningModule
                  workspace={workspace}
                  selectedPropertyId={selectedPropertyId}
                  onAddOperation={async (input) => {
                    await persist(workspaceService.addOperation(workspace, input));
                  }}
                  onUpdateOperationStatus={async (id, st) => {
                    await persist(workspaceService.updateOperationStatus(workspace, id, st));
                  }}
                />
              )}

              {activeModule === 'reports' && (
                <ReportsModule
                  workspace={workspace}
                  user={user}
                  selectedPropertyId={selectedPropertyId}
                />
              )}

              {activeModule === 'settings' && (
                <SettingsModule
                  user={user}
                  workspace={workspace}
                  onUpdateProfile={onUpdateProfile}
                  onUpdatePreferences={async (prefs) => {
                    await persist(workspaceService.updatePreferences(workspace, prefs));
                  }}
                  onResetDemoSeed={async () => {
                    const seed = await workspaceService.resetToDemoSeed(user.id);
                    setWorkspace(seed);
                    setSelectedPropertyId(seed.properties[0]?.id || '');
                  }}
                  onClearAllData={async () => {
                    const clean = await workspaceService.clearAllData(user.id);
                    setWorkspace(clean);
                    setSelectedPropertyId('');
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
