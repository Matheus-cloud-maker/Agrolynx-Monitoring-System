import React, { useState } from 'react';
import {
  ArrowRight,
  Compass,
  Database,
  Layers,
  Menu,
  Satellite,
  Sprout,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import { INTEGRATION_SPECS } from '../../services/contracts/dataSources';
import type { AppRoute } from '../../types/agrolynx';

interface LandingPageProps {
  onNavigate: (route: AppRoute) => void;
  onQuickDemoLogin: () => Promise<void>;
  isAuthenticated: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onQuickDemoLogin,
  isAuthenticated,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoAccess = async () => {
    setDemoLoading(true);
    try {
      await onQuickDemoLogin();
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Top Bar Contract: exatamente 3 zonas */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zona 1: Wordmark em linha única */}
          <a
            href="#inicio"
            className="text-xl font-extrabold tracking-tight text-navy-900 font-display whitespace-nowrap shrink-0"
          >
            AGROLYNX
          </a>

          {/* Zona 2: Links de navegação concisos em linha única */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#capacidades"
              className="hover:text-navy-900 transition-colors whitespace-nowrap shrink-0"
            >
              Capacidades
            </a>
            <a
              href="#modulos"
              className="hover:text-navy-900 transition-colors whitespace-nowrap shrink-0"
            >
              Módulos
            </a>
            <a
              href="#fontes-nasa"
              className="hover:text-navy-900 transition-colors whitespace-nowrap shrink-0"
            >
              Fontes NASA
            </a>
            <a
              href="#arquitetura"
              className="hover:text-navy-900 transition-colors whitespace-nowrap shrink-0"
            >
              Arquitetura
            </a>
          </nav>

          {/* Zona 3: 1 Ação primária */}
          <div className="hidden md:flex items-center shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
            >
              {isAuthenticated ? 'Abrir painel' : 'Entrar na plataforma'}
            </Button>
          </div>

          <button
            type="button"
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 space-y-3">
            <a
              href="#capacidades"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-sm font-medium text-slate-700"
            >
              Capacidades
            </a>
            <a
              href="#modulos"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-sm font-medium text-slate-700"
            >
              Módulos
            </a>
            <a
              href="#fontes-nasa"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-sm font-medium text-slate-700"
            >
              Fontes NASA
            </a>
            <a
              href="#arquitetura"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-sm font-medium text-slate-700"
            >
              Arquitetura
            </a>
            <div className="pt-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate(isAuthenticated ? 'dashboard' : 'login');
                }}
              >
                {isAuthenticated ? 'Abrir painel' : 'Entrar na plataforma'}
              </Button>
            </div>
          </div>
        )}
      </header>

      <main id="inicio" className="flex-1">
        {/* Hero Section */}
        <section className="bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-xs font-medium text-agro-800 tracking-wide">
                NASA Space Apps Challenge 2026 · Versão estrutural inicial
              </p>

              <h1
                className="font-display font-bold text-navy-900 tracking-tight leading-[1.1] text-balance"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)' }}
              >
                Inteligência agrícola preparada para observação da Terra.
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                O AGROLYNX organiza propriedades, talhões, culturas, análises de solo, irrigação e
                planejamento de safra em uma arquitetura pronta para conectar dados orbitais da NASA,
                SoilGrids e banco PostgreSQL.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'register')}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  {isAuthenticated ? 'Ir para o painel' : 'Criar conta na plataforma'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  loading={demoLoading}
                  onClick={handleDemoAccess}
                >
                  Explorar painel demonstrativo
                </Button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed max-w-xl border-t border-slate-200 pt-4">
                Transparência técnica: esta primeira versão executa localmente sem chaves de API ou
                medições reais conectadas. Registros de exemplo são identificados explicitamente como
                conteúdo demonstrativo.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-navy-900">
                <ImageWithFallback
                  src="/src/assets/images/hero_agrolynx_farm_1794663660779.jpg"
                  alt="Vista aérea de lavoura agrícola brasileira com linhas de plantio e pivô central de irrigação"
                  className="w-full h-full object-cover"
                  fallbackTitle="AGROLYNX — Agricultura de Precisão"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Faixa de escopo imediato */}
        <section className="bg-navy-900 text-white border-b border-navy-800">
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-300">Módulos operacionais</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1">12</p>
              <p className="text-xs text-slate-400 mt-0.5">Gestão ponta a ponta da safra</p>
            </div>
            <div>
              <p className="text-xs text-slate-300">Conectores previstos</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1">7</p>
              <p className="text-xs text-slate-400 mt-0.5">NASA, SoilGrids e PostgreSQL</p>
            </div>
            <div>
              <p className="text-xs text-slate-300">Persistência atual</p>
              <p className="text-2xl font-bold font-display mt-1">Local</p>
              <p className="text-xs text-slate-400 mt-0.5">Sem serviços pagos nesta etapa</p>
            </div>
            <div>
              <p className="text-xs text-slate-300">Idioma nativo</p>
              <p className="text-2xl font-bold font-display mt-1">PT-BR</p>
              <p className="text-xs text-slate-400 mt-0.5">Terminologia agronômica nacional</p>
            </div>
          </div>
        </section>

        {/* Capacidades Principais — Bento Assimétrico */}
        <section id="capacidades" className="max-w-7xl mx-auto px-6 py-16 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold text-agro-700">Capacidades da plataforma</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-900 font-display tracking-tight text-balance">
              Do talhão georreferenciado ao planejamento hídrico e fitossanitário.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <div className="aspect-[16/9] bg-navy-900 overflow-hidden">
                <ImageWithFallback
                  src="/src/assets/images/feature_satellite_orbit_1794663660801.jpg"
                  alt="Ilustração científica de satélite de observação da Terra mapeando talhões agrícolas"
                  className="w-full h-full object-cover"
                  fallbackTitle="Observação Orbital"
                />
              </div>
              <div className="p-6 space-y-2 flex-1">
                <h3 className="text-lg font-semibold text-navy-900 font-display">
                  01. Observação Orbital e Mapa Agrícola Interativo
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Cadastro de propriedades com coordenadas geográficas, polígonos de talhões e
                  visualização vetorial com inspetor de camadas preparado para receber índices
                  espectrais (Earthdata HLS), umidade superficial (SMAP) e temperatura de superfície
                  (ECOSTRESS).
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                <ImageWithFallback
                  src="/src/assets/images/feature_soil_agronomy_1794663663327.jpg"
                  alt="Inspeção agronômica de amostra de solo em lavoura de soja"
                  className="w-full h-full object-cover"
                  fallbackTitle="Análise de Solo e Agronomia"
                />
              </div>
              <div className="p-6 space-y-2 flex-1">
                <h3 className="text-lg font-semibold text-navy-900 font-display">
                  02. Solo, Culturas e Diário Agronômico
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Registre análises laboratoriais por profundidade, acompanhe estágios fenológicos
                  com coeficientes Kc e consolide apontamentos de campo para cruzar futuramente com
                  a linha de base SoilGrids v2.0.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 border border-slate-200 rounded-xl p-6 bg-slate-50 space-y-2">
              <div className="flex items-center gap-2 text-agro-700">
                <Compass className="w-5 h-5" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-navy-900 font-display">
                  03. Clima, Irrigação e Regras de Alerta
                </h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Estruturas prontas para consumir séries diárias NASA POWER e precipitação GPM
                IMERG, gerenciar pivôs e gotejamento e configurar limiares de alerta para déficit
                hídrico ou chuvas intensas.
              </p>
            </div>

            <div className="lg:col-span-6 border border-slate-200 rounded-xl p-6 bg-slate-50 space-y-2">
              <div className="flex items-center gap-2 text-navy-900">
                <Layers className="w-5 h-5" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-navy-900 font-display">
                  04. Planejamento de Safra e Relatórios Exportáveis
                </h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Cronograma operacional por talhão com controle de status, pré-visualização para
                impressão técnica e exportação imediata dos registros em CSV e JSON.
              </p>
            </div>
          </div>
        </section>

        {/* Grade dos 12 Módulos */}
        <section id="modulos" className="bg-slate-50 border-y border-slate-200 py-16">
          <div className="max-w-7xl mx-auto px-6 space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-agro-700">Estrutura do painel</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy-900 font-display tracking-tight">
                Doze módulos integrados no mesmo espaço de trabalho.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Propriedades', desc: 'Cadastro fundiário, municípios, biomas e talhões.' },
                { title: 'Mapa Agrícola', desc: 'Visualização georreferenciada e seletor de camadas.' },
                { title: 'Clima', desc: 'Estrutura preparada para NASA POWER e GPM IMERG.' },
                { title: 'Solo', desc: 'Perfis por profundidade, laudos locais e SoilGrids.' },
                { title: 'Satélites e Dados NASA', desc: 'Catálogo técnico de conectores e esquemas.' },
                { title: 'Culturas', desc: 'Safras, cultivares, estágios fenológicos e Kc.' },
                { title: 'Irrigação', desc: 'Setores, pivôs, lâminas aplicadas e balanço conceitual.' },
                { title: 'Monitoramento', desc: 'Diário de campo e prontidão de índices espectrais.' },
                { title: 'Alertas', desc: 'Regras configuráveis e fila operacional de eventos.' },
                { title: 'Planejamento', desc: 'Cronograma de operações agrícolas por talhão.' },
                { title: 'Relatórios', desc: 'Prévia de impressão e exportação em CSV e JSON.' },
                { title: 'Configurações', desc: 'Perfil, unidades métricas e gestão de dados locais.' },
              ].map((item, idx) => (
                <div
                  key={item.title}
                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5"
                >
                  <p className="text-xs font-mono text-slate-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </p>
                  <h3 className="text-sm font-semibold text-navy-900 font-display">{item.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fontes NASA, SoilGrids e Arquitetura PostgreSQL */}
        <section id="fontes-nasa" className="max-w-7xl mx-auto px-6 py-16 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-agro-700">Ecossistema científico previsto</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy-900 font-display tracking-tight">
                Contratos preparados para NASA, SoilGrids e PostgreSQL.
              </h2>
            </div>
            <p className="text-xs text-slate-500 max-w-sm">
              Nenhuma chave de API é solicitada ou ativada nesta etapa. Os adaptadores documentam o
              esquema esperado para a fase de backend.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="py-3 px-4 font-semibold">Fonte / Camada</th>
                  <th className="py-3 px-4 font-semibold">Provedor</th>
                  <th className="py-3 px-4 font-semibold">Resolução Espacial</th>
                  <th className="py-3 px-4 font-semibold">Cadência Temporal</th>
                  <th className="py-3 px-4 font-semibold">Estado Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {INTEGRATION_SPECS.map((spec) => (
                  <tr key={spec.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-navy-900 whitespace-nowrap">
                      {spec.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{spec.provider}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {spec.spatialResolution}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{spec.temporalResolution}</td>
                    <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                      {spec.status === 'conectada' ? (
                        <span className="text-agro-700">Conectada (ao vivo)</span>
                      ) : spec.status === 'catalogo_ativo' ? (
                        <span className="text-agro-700">Catálogo CMR ativo</span>
                      ) : spec.status === 'requer_credenciais' ? (
                        <span className="text-amber-700">CMR ativo · Requer login EDL</span>
                      ) : (
                        <span className="text-navy-800">Arquitetura preparada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Seção de Arquitetura e Chamada para Ação */}
        <section id="arquitetura" className="bg-navy-900 text-white py-16">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                <Database className="w-4 h-4" aria-hidden="true" />
                <span>Pronto para evolução incremental</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-balance">
                Estrutura modular preparada para expansão em etapas.
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Cada módulo possui modelos TypeScript, validação de formulários, estados de
                carregamento, tratamento de erros e interfaces de repositório desacopladas do
                armazenamento local para facilitar a migração para PostgreSQL + PostGIS e rotas de
                ingestão da NASA.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onNavigate('register')}
                icon={<Satellite className="w-4 h-4" />}
              >
                Cadastrar usuário
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleDemoAccess}
                loading={demoLoading}
              >
                Modo demonstrativo
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer discreto */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2 text-navy-900 font-semibold">
            <Sprout className="w-4 h-4 text-agro-700" aria-hidden="true" />
            <span>AGROLYNX</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-normal text-slate-500">
              NASA Space Apps Challenge 2026
            </span>
          </div>
          <p>
            Protótipo funcional v1 em português brasileiro · Sem coleta ativa de dados reais ou
            serviços pagos conectados.
          </p>
        </div>
      </footer>
    </div>
  );
};
