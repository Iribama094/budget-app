import 'react-native-gesture-handler';

import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, StyleSheet, View, Pressable, Text, Animated, PanResponder } from 'react-native';
import { useFonts as useInter, Inter_400Regular } from '@expo-google-fonts/inter';
import { useFonts as usePlusJakarta, PlusJakartaSans_400Regular, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import * as Font from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Home, Wallet, BarChart3, Target } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AmountVisibilityProvider } from './src/contexts/AmountVisibilityContext';
import { AssistantBubbleProvider, useAssistantBubble } from './src/contexts/AssistantBubbleContext';
import { NotificationBadgeProvider } from './src/contexts/NotificationBadgeContext';
import { HintsProvider } from './src/contexts/HintsContext';
import { SpaceProvider } from './src/contexts/SpaceContext';
import { ToastProvider } from './src/components/Common/Toast';
import { AppBackground } from './src/components/Common/AppBackground';
import { tokens } from './src/theme/tokens';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import TransactionDetailScreen from './src/screens/TransactionDetailScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import CreateGoalScreen from './src/screens/CreateGoalScreen';
import GoalDetailScreen from './src/screens/GoalDetailScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import BudgetDetailScreen from './src/screens/BudgetDetailScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AddTransactionScreen } from './src/screens/AddTransactionScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { AuthLandingScreen } from './src/screens/AuthLandingScreen';
import { Moon, Sun } from 'lucide-react-native';
import TaxSettingsScreen from './src/screens/TaxSettingsScreen';
import ExportDataScreen from './src/screens/ExportDataScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import AnalyticsCategoryDetailScreen from './src/screens/AnalyticsCategoryDetailScreen';
import AnalyticsWeeklyDetailScreen from './src/screens/AnalyticsWeeklyDetailScreen';
import AnalyticsBucketDetailScreen from './src/screens/AnalyticsBucketDetailScreen';
import AnalyticsMiniBudgetsDetailScreen from './src/screens/AnalyticsMiniBudgetsDetailScreen';
import { navigationRef } from './src/navigation/navigationRef';
import { TourProvider } from './src/contexts/TourContext';
import { NudgesProvider } from './src/contexts/NudgesContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

const ONBOARDING_KEY = 'bf_onboarding_done_v1';

function MainTabs() {
  const { theme } = useTheme();

  return (
      <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.mode === 'dark' ? tokens.colors.gray[400] : tokens.colors.gray[500],
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: Platform.select({ ios: 96, default: 80 }),
          paddingTop: 10,
          paddingBottom: Platform.select({ ios: 36, default: 14 }),
          borderRadius: 0,
          backgroundColor: theme.colors.backgroundAlt, // opaque surface
          borderTopWidth: 0,
          borderColor: 'transparent',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 18,
          elevation: 10
        },
        tabBarIcon: ({ focused, color, size }) => {
          const iconSize = Math.max(20, Math.min(size, 24));
          const iconColor = focused ? theme.colors.primary : color;

          if (route.name === 'Dashboard') return <Home color={iconColor} size={iconSize} />;
          if (route.name === 'Budget') return <Wallet color={iconColor} size={iconSize} />;
          if (route.name === 'Analytics') return <BarChart3 color={iconColor} size={iconSize} />;
          if (route.name === 'Goals') return <Target color={iconColor} size={iconSize} />;
          return <Home color={iconColor} size={iconSize} />;
        }
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Budget" component={BudgetScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
    </Tab.Navigator>
  );
}

function AuthedStack() {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="BudgetDetail" component={BudgetDetailScreen} />
      <Stack.Screen name="CreateGoal" component={CreateGoalScreen} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <Stack.Screen name="AssistantModal" component={require('./src/screens/AssistantScreen').default} options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="Account" component={require('./src/screens/AccountScreen').default} />
      <Stack.Screen name="Settings" component={require('./src/screens/SettingsScreen').default} />
      <Stack.Screen name="ProfileEdit" component={require('./src/screens/ProfileEditScreen').default} />
        <Stack.Screen name="ChangePassword" component={require('./src/screens/ChangePasswordScreen').default} />
        <Stack.Screen name="TaxSettings" component={TaxSettingsScreen} />
        <Stack.Screen name="MiniBudgets" component={require('./src/screens/MiniBudgetsScreen').default} />
      <Stack.Screen name="Assistant" component={require('./src/screens/AssistantScreen').default} />
      <Stack.Screen name="BankConnections" component={require('./src/screens/BankConnectionsScreen').default} />
      <Stack.Screen name="BankConnectTerms" component={require('./src/screens/BankConnectTermsScreen').default} />
      <Stack.Screen name="BankConnectForm" component={require('./src/screens/BankConnectFormScreen').default} />
      <Stack.Screen name="PendingTransactions" component={require('./src/screens/PendingTransactionsScreen').default} />
      <Stack.Screen name="About" component={() => (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>BudgetFriendly v1 — Smart budgeting for everyone.</Text>
        </View>
      )} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen name="AddTransaction" component={AddTransactionScreen} />
      <Stack.Screen name="ExportData" component={ExportDataScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="AnalyticsCategoryDetail" component={AnalyticsCategoryDetailScreen} />
      <Stack.Screen name="AnalyticsWeeklyDetail" component={AnalyticsWeeklyDetailScreen} />
      <Stack.Screen name="AnalyticsBucketDetail" component={AnalyticsBucketDetailScreen} />
      <Stack.Screen name="AnalyticsMiniBudgetsDetail" component={AnalyticsMiniBudgetsDetailScreen} />
      <Stack.Screen name="WeeklyCheckInDetail" component={require('./src/screens/WeeklyCheckInDetailScreen').default} />
      <Stack.Screen name="BudgetStreakDetail" component={require('./src/screens/BudgetStreakDetailScreen').default} />
    </Stack.Navigator>
  );
}

function Root() {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();

  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);
  const [sessionOnboardingComplete, setSessionOnboardingComplete] = React.useState(false);
  const [splashMinElapsed, setSplashMinElapsed] = React.useState(false);
  const [authStartMode, setAuthStartMode] = React.useState<'landing' | 'login' | 'register'>('landing');
  const forceOnboarding = process.env.EXPO_PUBLIC_FORCE_ONBOARDING === '1';

  const authInitialRoute = authStartMode === 'register' ? 'Register' : authStartMode === 'login' ? 'Login' : 'AuthLanding';

  React.useEffect(() => {
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(ONBOARDING_KEY);
        setOnboardingDone(v === '1');
      } catch {
        setOnboardingDone(false);
      }
    })();
  }, []);

  // Ensure splash screen is shown for at least 5 seconds
  React.useEffect(() => {
    const t = setTimeout(() => setSplashMinElapsed(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const markOnboardingDone = async () => {
    setSessionOnboardingComplete(true);
    setOnboardingDone(true);
    try {
      await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
    } catch {
      // ignore
    }
  };

  if (isLoading || onboardingDone === null || !splashMinElapsed) return <SplashScreen />;
  if (!user && !sessionOnboardingComplete && (!onboardingDone || forceOnboarding)) {
    return (
      <OnboardingScreen
        onDone={() => void markOnboardingDone()}
        onContinueToAuth={(mode) => {
          setAuthStartMode(mode);
          void markOnboardingDone();
        }}
      />
    );
  }
  if (!user)
    return (
      <AuthStack.Navigator
        key={authInitialRoute}
        initialRouteName={authInitialRoute}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
      >
        <AuthStack.Screen name="AuthLanding" component={AuthLandingScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    );

  return (
    <View style={{ flex: 1 }}>
      <AuthedStack />
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function FloatingThemeToggle() {
  const { toggleDarkMode, isDarkMode, theme } = useTheme();
  return (
    <Pressable
      onPress={() => toggleDarkMode()}
      style={({ pressed }) => [
        {
          position: 'absolute',
          right: 18,
          bottom: Platform.select({ ios: 96, default: 86 }),
          width: 52,
          height: 52,
          borderRadius: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 6,
          opacity: pressed ? 0.9 : 1
        }
      ]}
    >
      {isDarkMode ? <Sun color={theme.colors.primary} size={20} /> : <Moon color={theme.colors.primary} size={20} />}
    </Pressable>
  );
}

function FloatingAssistantButton() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { showAssistantBubble } = useAssistantBubble();
  const { user } = useAuth();

  const pan = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const floatAnim = React.useRef(new Animated.Value(0)).current;
  const lastOffset = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1200,
          useNativeDriver: true
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true
        })
      ])
    ).start();
  }, [floatAnim]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        pan.setOffset(lastOffset.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([
        null,
        { dx: pan.x, dy: pan.y }
      ], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gestureState) => {
        lastOffset.current = {
          x: lastOffset.current.x + gestureState.dx,
          y: lastOffset.current.y + gestureState.dy
        };
        pan.flattenOffset();
      }
    })
  ).current;

  // Fully disable assistant bubble on mobile app (use header icon instead)
  return null;
}

export default function App() {
  // load fonts used by the web design so mobile matches typography
  const [interLoaded] = useInter({ Inter_400Regular });
  const [plusLoaded] = usePlusJakarta({ PlusJakartaSans_400Regular, PlusJakartaSans_700Bold });

  // when both font sets are ready, set a sensible default Text style
  React.useEffect(() => {
    if (interLoaded || plusLoaded) {
      const TextAny = Text as any;
      TextAny.defaultProps = TextAny.defaultProps || {};
      TextAny.defaultProps.style = { ...(TextAny.defaultProps.style || {}), fontFamily: 'Inter_400Regular' };
    }
  }, [interLoaded, plusLoaded]);

  if (!interLoaded || !plusLoaded) {
    return null; // keep splash handled by Expo; avoid rendering before fonts are ready
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SpaceProvider>
          <AmountVisibilityProvider>
            <AssistantBubbleProvider>
              <NotificationBadgeProvider>
                <HintsProvider>
                  <AuthProvider>
                    <ToastProvider>
                      <NavigationContainer ref={navigationRef}>
                        <TourProvider>
                          <NudgesProvider>
                            <View style={styles.container}>
                              <AppBackground />
                              <Root />
                              {/* FloatingAssistantButton removed: use header AI icon instead */}
                              {/* theme toggle moved to Settings (Account -> Settings) */}
                            </View>
                          </NudgesProvider>
                        </TourProvider>
                      </NavigationContainer>
                    </ToastProvider>
                  </AuthProvider>
                </HintsProvider>
              </NotificationBadgeProvider>
            </AssistantBubbleProvider>
          </AmountVisibilityProvider>
        </SpaceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
});
