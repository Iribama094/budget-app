import { useEffect, useState } from 'react';
import { OnboardingContainer } from './components/Onboarding/OnboardingContainer';
import { Dashboard } from './components/Dashboard/Dashboard';
import { LoginPage } from './components/Auth/LoginPage';
import { SplashScreen } from './components/Splash/SplashScreen';
import { AppBackground } from './components/Background/AppBackground';
import { ThemeProvider } from './contexts/ThemeContext';
import { useAuth } from './contexts/AuthContext';

const ONBOARDING_SEEN_KEY = 'bf_onboarding_seen_v1';
const ALWAYS_SHOW_ONBOARDING = import.meta.env.VITE_ALWAYS_SHOW_ONBOARDING === 'true';

export function App() {
  const { user } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'onboarding' | 'login' | 'dashboard'>('splash');

  useEffect(() => {
    if (currentScreen === 'login' && user) setCurrentScreen('dashboard');
    if (currentScreen === 'dashboard' && !user) setCurrentScreen('login');
  }, [currentScreen, user]);

  const handleSplashComplete = () => {
    const hasSeenOnboarding = !ALWAYS_SHOW_ONBOARDING && localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
    if (!hasSeenOnboarding) {
      setCurrentScreen('onboarding');
      return;
    }
    setCurrentScreen(user ? 'dashboard' : 'login');
  };

  const handleOnboardingComplete = () => {
    if (!ALWAYS_SHOW_ONBOARDING) {
      localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    }
    setCurrentScreen('login');
  };

  const handleLogin = () => {
    setCurrentScreen('dashboard');
  };

  return (
    <ThemeProvider>
      <div className="w-full min-h-screen font-sans antialiased relative bg-white dark:bg-gray-900 transition-colors duration-300">
        <AppBackground />

        {currentScreen === 'splash' && (
          <SplashScreen onComplete={handleSplashComplete} />
        )}

        {currentScreen === 'onboarding' && (
          <OnboardingContainer onComplete={handleOnboardingComplete} />
        )}

        {currentScreen === 'login' && (
          <LoginPage onLogin={handleLogin} />
        )}

        {currentScreen === 'dashboard' && (
          <Dashboard />
        )}
      </div>
    </ThemeProvider>
  );
}