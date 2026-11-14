import { useState } from 'react';
import { LandingPage } from './components/pages/LandingPage';
import { AuthViews } from './components/pages/AuthViews';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { authService } from './services/authService';
import type { AppRoute, AuthSession, AuthUser } from './types/agrolynx';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() =>
    authService.getCurrentSession()
  );
  const [route, setRoute] = useState<AppRoute>('landing');

  const handleNavigate = (nextRoute: AppRoute) => {
    if (nextRoute === 'dashboard' && !session) {
      setRoute('login');
      return;
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleAuthSuccess = (newSession: AuthSession) => {
    setSession(newSession);
    setRoute('dashboard');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleQuickDemoLogin = async () => {
    const demoSession = await authService.loginWithDemo();
    handleAuthSuccess(demoSession);
  };

  const handleLogout = () => {
    authService.logout();
    setSession(null);
    setRoute('landing');
  };

  const handleUpdateProfile = (
    updates: Partial<Pick<AuthUser, 'name' | 'organization' | 'region' | 'role'>>
  ) => {
    const updated = authService.updateCurrentUserProfile(updates);
    if (updated) {
      setSession(updated);
    }
  };

  if (route === 'dashboard' && session) {
    return (
      <DashboardShell
        user={session.user}
        onLogout={handleLogout}
        onUpdateProfile={handleUpdateProfile}
        onBackToLanding={() => handleNavigate('landing')}
      />
    );
  }

  if (route === 'login' || route === 'register' || route === 'recover') {
    return (
      <AuthViews
        mode={route}
        onNavigate={handleNavigate}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  return (
    <LandingPage
      onNavigate={handleNavigate}
      onQuickDemoLogin={handleQuickDemoLogin}
      isAuthenticated={Boolean(session)}
    />
  );
}
