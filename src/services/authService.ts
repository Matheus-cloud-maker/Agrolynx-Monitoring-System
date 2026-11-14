import type {
  AuthSession,
  AuthUser,
  LoginCredentials,
  RecoverPasswordPayload,
  RegisterPayload,
} from '../types/agrolynx';
import { DEMO_USER } from '../data/demoSeed';

const USERS_KEY = 'agrolynx_v1_users';
const SESSION_KEY = 'agrolynx_v1_session';

interface StoredAccount {
  user: AuthUser;
  password: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_CREDENTIALS' | 'EMAIL_EXISTS' | 'USER_NOT_FOUND' | 'VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
}

function createSession(user: AuthUser): AuthSession {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const session: AuthSession = {
    user,
    tokenType: 'local_demo_session',
    expiresAt,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export const authService = {
  getCurrentSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as AuthSession;
      if (!session?.user?.id || new Date(session.expiresAt).getTime() < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    await delay(350);
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    if (!email || !password) {
      throw new AuthError('Informe seu e-mail e senha para continuar.', 'VALIDATION_ERROR');
    }

    if (email === DEMO_USER.email && password === 'Agrolynx@2026') {
      return createSession(DEMO_USER);
    }

    const accounts = readStoredAccounts();
    const match = accounts.find(
      (item) => item.user.email.toLowerCase() === email && item.password === password
    );

    if (!match) {
      throw new AuthError(
        'E-mail ou senha não encontrados no ambiente local. Verifique seus dados ou entre com a conta demonstrativa.',
        'INVALID_CREDENTIALS'
      );
    }

    return createSession(match.user);
  },

  async loginWithDemo(): Promise<AuthSession> {
    await delay(280);
    return createSession(DEMO_USER);
  },

  async register(payload: RegisterPayload): Promise<AuthSession> {
    await delay(400);
    const email = payload.email.trim().toLowerCase();

    if (!payload.name.trim() || !email || !payload.organization.trim()) {
      throw new AuthError('Preencha todos os campos obrigatórios do cadastro.', 'VALIDATION_ERROR');
    }
    if (payload.password.length < 8) {
      throw new AuthError('A senha deve possuir no mínimo 8 caracteres.', 'VALIDATION_ERROR');
    }
    if (payload.password !== payload.confirmPassword) {
      throw new AuthError('A confirmação de senha não confere.', 'VALIDATION_ERROR');
    }

    const accounts = readStoredAccounts();
    if (
      email === DEMO_USER.email ||
      accounts.some((item) => item.user.email.toLowerCase() === email)
    ) {
      throw new AuthError('Já existe uma conta cadastrada com este endereço de e-mail.', 'EMAIL_EXISTS');
    }

    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      name: payload.name.trim(),
      email,
      organization: payload.organization.trim(),
      role: payload.role,
      region: payload.region.trim() || 'Brasil',
      createdAt: new Date().toISOString(),
      isDemoAccount: false,
    };

    writeStoredAccounts([...accounts, { user: newUser, password: payload.password }]);
    return createSession(newUser);
  },

  async recoverPassword(payload: RecoverPasswordPayload): Promise<{ deliveredNotice: string }> {
    await delay(350);
    const email = payload.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthError('Informe um endereço de e-mail válido.', 'VALIDATION_ERROR');
    }

    const accounts = readStoredAccounts();
    const exists =
      email === DEMO_USER.email ||
      accounts.some((item) => item.user.email.toLowerCase() === email);

    if (!exists) {
      throw new AuthError(
        'Nenhum usuário encontrado com este e-mail no armazenamento local desta etapa.',
        'USER_NOT_FOUND'
      );
    }

    return {
      deliveredNotice:
        'Fluxo validado com sucesso. Em produção (após conexão com servidor SMTP e PostgreSQL), um link temporário de redefinição será enviado para ' +
        email +
        '.',
    };
  },

  updateCurrentUserProfile(updates: Partial<Pick<AuthUser, 'name' | 'organization' | 'region' | 'role'>>): AuthSession | null {
    const session = this.getCurrentSession();
    if (!session) return null;
    const updatedUser: AuthUser = { ...session.user, ...updates };
    const accounts = readStoredAccounts();
    const idx = accounts.findIndex((a) => a.user.id === updatedUser.id);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], user: updatedUser };
      writeStoredAccounts(accounts);
    }
    return createSession(updatedUser);
  },

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  },
};
