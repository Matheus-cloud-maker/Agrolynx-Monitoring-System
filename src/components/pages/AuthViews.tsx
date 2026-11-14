import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Sprout } from 'lucide-react';
import { Button } from '../ui/Button';
import { InputField, SelectField } from '../ui/FormControls';
import { DemoNotice } from '../ui/DemoNotice';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import { authService, AuthError } from '../../services/authService';
import { isValidEmail } from '../../utils/validation';
import type { AppRoute, AuthSession } from '../../types/agrolynx';

interface AuthViewsProps {
  mode: 'login' | 'register' | 'recover';
  onNavigate: (route: AppRoute) => void;
  onAuthSuccess: (session: AuthSession) => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({
  mode,
  onNavigate,
  onAuthSuccess,
}) => {
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regOrg, setRegOrg] = useState('');
  const [regRole, setRegRole] = useState<'produtor' | 'agronomo' | 'gestor'>('agronomo');
  const [regRegion, setRegRegion] = useState('Centro-Oeste');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Recover state
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSuccessMsg, setRecoverSuccessMsg] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetFeedback = () => {
    setFieldErrors({});
    setServerError(null);
    setRecoverSuccessMsg(null);
  };

  const switchMode = (target: 'login' | 'register' | 'recover') => {
    resetFeedback();
    onNavigate(target);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const errors: Record<string, string> = {};
    if (!isValidEmail(loginEmail)) {
      errors.loginEmail = 'Informe um endereço de e-mail válido.';
    }
    if (loginPassword.length < 6) {
      errors.loginPassword = 'Informe sua senha (mínimo de 6 caracteres).';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const session = await authService.login({
        email: loginEmail,
        password: loginPassword,
      });
      onAuthSuccess(session);
    } catch (err) {
      setServerError(
        err instanceof AuthError ? err.message : 'Erro inesperado ao autenticar.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    resetFeedback();
    setLoading(true);
    try {
      const session = await authService.loginWithDemo();
      onAuthSuccess(session);
    } catch {
      setServerError('Não foi possível iniciar a sessão demonstrativa.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const errors: Record<string, string> = {};
    if (regName.trim().length < 3) {
      errors.regName = 'Informe seu nome completo (mínimo 3 caracteres).';
    }
    if (!isValidEmail(regEmail)) {
      errors.regEmail = 'Informe um endereço de e-mail válido.';
    }
    if (regOrg.trim().length < 2) {
      errors.regOrg = 'Informe a fazenda, cooperativa ou instituição.';
    }
    if (regPassword.length < 8) {
      errors.regPassword = 'A senha deve conter no mínimo 8 caracteres.';
    }
    if (regConfirm !== regPassword) {
      errors.regConfirm = 'As senhas digitadas não coincidem.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const session = await authService.register({
        name: regName,
        email: regEmail,
        organization: regOrg,
        role: regRole,
        region: regRegion,
        password: regPassword,
        confirmPassword: regConfirm,
      });
      onAuthSuccess(session);
    } catch (err) {
      setServerError(
        err instanceof AuthError ? err.message : 'Erro inesperado ao concluir cadastro.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (!isValidEmail(recoverEmail)) {
      setFieldErrors({ recoverEmail: 'Informe um endereço de e-mail válido.' });
      return;
    }

    setLoading(true);
    try {
      const res = await authService.recoverPassword({ email: recoverEmail });
      setRecoverSuccessMsg(res.deliveredNotice);
    } catch (err) {
      setServerError(
        err instanceof AuthError ? err.message : 'Não foi possível processar a solicitação.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Coluna Visual Institucional */}
      <aside className="hidden lg:flex lg:col-span-5 bg-navy-900 text-white flex-col justify-between p-10 relative overflow-hidden">
        <div className="space-y-6 relative z-10">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar à página inicial</span>
          </button>

          <div className="pt-4 space-y-3">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <Sprout className="w-6 h-6" aria-hidden="true" />
              <span className="font-display font-bold text-xl tracking-tight text-white">
                AGROLYNX
              </span>
            </div>
            <h1 className="text-2xl font-bold font-display leading-snug text-balance">
              Plataforma de agricultura inteligente e observação orbital.
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Estrutura organizada para gestão fundiária, solo, clima e planejamento agrícola com
              integração futura às bases NASA e PostgreSQL.
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="aspect-[16/9] rounded-xl overflow-hidden border border-navy-700">
            <ImageWithFallback
              src="/src/assets/images/feature_satellite_orbit_1794663660801.jpg"
              alt="Satélite de observação agrícola"
              className="w-full h-full object-cover"
              fallbackTitle="AGROLYNX Orbital"
            />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            NASA Space Apps Challenge 2026 · Sessão local segura para validação funcional sem
            serviços externos pagos.
          </p>
        </div>
      </aside>

      {/* Coluna do Formulário */}
      <main className="lg:col-span-7 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="lg:hidden flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-navy-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Início</span>
            </button>
            <span className="font-display font-bold text-lg text-navy-900">AGROLYNX</span>
          </div>

          {/* Navegação por abas entre Login / Cadastro / Recuperação */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-navy-900 shadow-xs'
                  : 'text-slate-600 hover:text-navy-900'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-navy-900 shadow-xs'
                  : 'text-slate-600 hover:text-navy-900'
              }`}
            >
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => switchMode('recover')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'recover'
                  ? 'bg-white text-navy-900 shadow-xs'
                  : 'text-slate-600 hover:text-navy-900'
              }`}
            >
              Recuperar senha
            </button>
          </div>

          <DemoNotice
            variant="demo"
            title="Autenticação local demonstrativa (Etapa 1)"
            description="Os cadastros desta versão ficam salvos localmente no navegador até a conexão com o servidor PostgreSQL."
          />

          {serverError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 font-medium"
            >
              {serverError}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} noValidate className="space-y-4 bg-white border border-slate-200 rounded-xl p-6">
              <div>
                <h2 className="text-xl font-bold text-navy-900 font-display">
                  Acessar plataforma
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Entre com sua conta local ou utilize o acesso demonstrativo imediato.
                </p>
              </div>

              <InputField
                id="login-email"
                label="E-mail institucional ou pessoal"
                type="email"
                autoComplete="email"
                placeholder="nome@propriedade.agr.br"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                error={fieldErrors.loginEmail}
                required
              />

              <InputField
                id="login-password"
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                error={fieldErrors.loginPassword}
                required
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => switchMode('recover')}
                  className="text-navy-800 hover:underline font-medium cursor-pointer"
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-agro-700 hover:underline font-medium cursor-pointer"
                >
                  Criar nova conta
                </button>
              </div>

              <div className="space-y-2.5 pt-2">
                <Button type="submit" variant="primary" className="w-full" loading={loading}>
                  Entrar no painel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleDemoLogin}
                  disabled={loading}
                >
                  Entrar com conta demonstrativa
                </Button>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} noValidate className="space-y-4 bg-white border border-slate-200 rounded-xl p-6">
              <div>
                <h2 className="text-xl font-bold text-navy-900 font-display">
                  Criar conta AGROLYNX
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Cadastre seu perfil técnico para organizar propriedades e simulações estruturais.
                </p>
              </div>

              <InputField
                id="reg-name"
                label="Nome completo"
                placeholder="Ex.: João Pedro Almeida"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                error={fieldErrors.regName}
                required
              />

              <InputField
                id="reg-email"
                label="E-mail"
                type="email"
                placeholder="nome@fazenda.agr.br"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                error={fieldErrors.regEmail}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="reg-org"
                  label="Propriedade ou organização"
                  placeholder="Fazenda Santa Clara"
                  value={regOrg}
                  onChange={(e) => setRegOrg(e.target.value)}
                  error={fieldErrors.regOrg}
                  required
                />
                <SelectField
                  id="reg-role"
                  label="Perfil de atuação"
                  value={regRole}
                  onChange={(e) =>
                    setRegRole(e.target.value as 'produtor' | 'agronomo' | 'gestor')
                  }
                  options={[
                    { value: 'agronomo', label: 'Eng. Agrônomo(a)' },
                    { value: 'produtor', label: 'Produtor(a) Rural' },
                    { value: 'gestor', label: 'Gestor(a) de Operações' },
                  ]}
                />
              </div>

              <InputField
                id="reg-region"
                label="Região agrícola principal"
                placeholder="Ex.: Centro-Oeste, MATOPIBA, Sul"
                value={regRegion}
                onChange={(e) => setRegRegion(e.target.value)}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="reg-password"
                  label="Senha"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  error={fieldErrors.regPassword}
                  required
                />
                <InputField
                  id="reg-confirm"
                  label="Confirmar senha"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  error={fieldErrors.regConfirm}
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="rounded border-slate-300 text-agro-700 focus:ring-agro-700"
                  />
                  <span>Mostrar senhas</span>
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-navy-800 hover:underline font-medium cursor-pointer"
                >
                  Já tenho conta
                </button>
              </div>

              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Concluir cadastro e acessar painel
              </Button>
            </form>
          )}

          {mode === 'recover' && (
            <form onSubmit={handleRecoverSubmit} noValidate className="space-y-4 bg-white border border-slate-200 rounded-xl p-6">
              <div>
                <h2 className="text-xl font-bold text-navy-900 font-display">
                  Recuperação de senha
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Valide o e-mail cadastrado. O envio real de e-mails será habilitado na integração
                  com backend e SMTP.
                </p>
              </div>

              <InputField
                id="recover-email"
                label="E-mail cadastrado"
                type="email"
                placeholder="demonstracao@agrolynx.agr.br"
                value={recoverEmail}
                onChange={(e) => setRecoverEmail(e.target.value)}
                error={fieldErrors.recoverEmail}
                required
              />

              {recoverSuccessMsg && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900"
                >
                  <CheckCircle2 className="w-4 h-4 text-agro-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{recoverSuccessMsg}</p>
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Validar solicitação de recuperação
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-xs text-navy-800 hover:underline font-medium cursor-pointer"
                >
                  Voltar para o login
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
