import 'react-native-gesture-handler';

import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as SecureStore from 'expo-secure-store';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AmountVisibilityProvider } from './src/contexts/AmountVisibilityContext';
import { AssistantBubbleProvider } from './src/contexts/AssistantBubbleContext';
import { NotificationBadgeProvider } from './src/contexts/NotificationBadgeContext';
import { HintsProvider } from './src/contexts/HintsContext';
import { SpaceProvider } from './src/contexts/SpaceContext';
import { ToastProvider } from './src/components/Common/Toast';
import { AppBackground } from './src/components/Common/AppBackground';
import { AppTabBar } from './src/components/Common/TabBar';
import { PrivacyCover } from './src/components/Common/PrivacyCover';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
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
import TaxSettingsScreen from './src/screens/TaxSettingsScreen';
import ExportDataScreen from './src/screens/ExportDataScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import AnalyticsCategoryDetailScreen from './src/screens/AnalyticsCategoryDetailScreen';
import AnalyticsWeeklyDetailScreen from './src/screens/AnalyticsWeeklyDetailScreen';
import AnalyticsBucketDetailScreen from './src/screens/AnalyticsBucketDetailScreen';
import { navigationRef } from './src/navigation/navigationRef';
import { TourProvider } from './src/contexts/TourContext';
import { GuideProvider } from './src/contexts/GuideContext';
import { ConfigProvider } from './src/contexts/ConfigContext';
import { NudgesProvider } from './src/contexts/NudgesContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { AppServices } from './src/components/Common/AppServices';
import RecurringScreen from './src/screens/RecurringScreen';
import DevicesScreen from './src/screens/DevicesScreen';
import BankAlertScreen from './src/screens/BankAlertScreen';
import MonoConnectScreen from './src/screens/MonoConnectScreen';
import ShareBudgetScreen from './src/screens/ShareBudgetScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SetupPlanScreen from './src/screens/SetupPlanScreen';
import IncomeBillsScreen from './src/screens/IncomeBillsScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import { CategoriesProvider } from './src/contexts/CategoriesContext';
import InvoicesScreen from './src/screens/InvoicesScreen';
import CustomersScreen from './src/screens/CustomersScreen';
import InvoiceDetailScreen from './src/screens/InvoiceDetailScreen';
import InvoiceEditScreen from './src/screens/InvoiceEditScreen';
import BillsScreen from './src/screens/BillsScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import BusinessTaxScreen from './src/screens/BusinessTaxScreen';
import PayYourselfScreen from './src/screens/PayYourselfScreen';
import BusinessReportsScreen from './src/screens/BusinessReportsScreen';
import StatementImportScreen from './src/screens/StatementImportScreen';
import WrappedScreen from './src/screens/WrappedScreen';
import MoneyScreen from './src/screens/MoneyScreen';
import HelpersScreen from './src/screens/HelpersScreen';
import InviteFriendsScreen from './src/screens/InviteFriendsScreen';
import PropertiesScreen from './src/screens/PropertiesScreen';
import PricesScreen from './src/screens/PricesScreen';
import { ActingProvider, useActing } from './src/contexts/ActingContext';
import { TeamProvider, useTeam } from './src/contexts/TeamContext';
import TeamScreen from './src/screens/TeamScreen';
import YourBusinessesScreen from './src/screens/YourBusinessesScreen';
import BusinessSetupScreen from './src/screens/BusinessSetupScreen';
import { PendingInvite } from './src/components/Business/PendingInvite';
import { ActingBanner } from './src/components/Common/ActingBanner';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

const ONBOARDING_KEY = 'bf_onboarding_done_v1';
// Only long enough to avoid a flash; the splash otherwise stays up just while loading.
const SPLASH_MIN_MS = 700;

function AboutScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>BudgetFriendly v1. Smart budgeting for everyone.</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Budget" component={BudgetScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
    </Tab.Navigator>
  );
}

function AuthedStack() {
  const { theme } = useTheme();
  const { user } = useAuth();
  // New accounts start with the first-run plan (skippable). Decided once, when signing in.
  const [initialRoute] = React.useState(() =>
    user?.onboarding && !user.onboarding.completedAt && !user.onboarding.skippedAt ? 'SetupPlan' : 'Main'
  );

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
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
      <Stack.Screen name="SetupPlan" component={SetupPlanScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="IncomeBills" component={IncomeBillsScreen} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ProfileEdit" component={require('./src/screens/ProfileEditScreen').default} />
      <Stack.Screen name="ChangePassword" component={require('./src/screens/ChangePasswordScreen').default} />
      <Stack.Screen name="TaxSettings" component={TaxSettingsScreen} />
      <Stack.Screen name="Assistant" component={require('./src/screens/AssistantScreen').default} />
      <Stack.Screen name="BankConnections" component={require('./src/screens/BankConnectionsScreen').default} />
      <Stack.Screen name="BankConnectTerms" component={require('./src/screens/BankConnectTermsScreen').default} />
      <Stack.Screen name="BankConnectForm" component={require('./src/screens/BankConnectFormScreen').default} />
      <Stack.Screen name="PendingTransactions" component={require('./src/screens/PendingTransactionsScreen').default} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ExportData" component={ExportDataScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="AnalyticsCategoryDetail" component={AnalyticsCategoryDetailScreen} />
      <Stack.Screen name="AnalyticsWeeklyDetail" component={AnalyticsWeeklyDetailScreen} />
      <Stack.Screen name="AnalyticsBucketDetail" component={AnalyticsBucketDetailScreen} />
      <Stack.Screen name="WeeklyCheckInDetail" component={require('./src/screens/WeeklyCheckInDetailScreen').default} />
      <Stack.Screen name="BudgetStreakDetail" component={require('./src/screens/BudgetStreakDetailScreen').default} />
      <Stack.Screen name="Recurring" component={RecurringScreen} />
      <Stack.Screen name="Devices" component={DevicesScreen} />
      <Stack.Screen name="BankAlertImport" component={BankAlertScreen} />
      <Stack.Screen name="MonoConnect" component={MonoConnectScreen} />
      <Stack.Screen name="ShareBudget" component={ShareBudgetScreen} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="InvoiceEdit" component={InvoiceEditScreen} />
      <Stack.Screen name="Bills" component={BillsScreen} />
      <Stack.Screen name="Payroll" component={PayrollScreen} />
      <Stack.Screen name="BusinessTax" component={BusinessTaxScreen} />
      <Stack.Screen name="BusinessDetails" component={require('./src/screens/BusinessDetailsScreen').default} />
      <Stack.Screen name="PayYourself" component={PayYourselfScreen} />
      <Stack.Screen name="BusinessReports" component={BusinessReportsScreen} />
      <Stack.Screen name="StatementImport" component={StatementImportScreen} />
      <Stack.Screen name="Wrapped" component={WrappedScreen} />
      <Stack.Screen name="Money" component={MoneyScreen} />
      <Stack.Screen name="Helpers" component={HelpersScreen} />
      <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} />
      <Stack.Screen name="Properties" component={PropertiesScreen} />
      <Stack.Screen name="Prices" component={PricesScreen} />
      <Stack.Screen name="Team" component={TeamScreen} />
      <Stack.Screen name="YourBusinesses" component={YourBusinessesScreen} />
      <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}

function Root() {
  const { user, isLoading, isLocked, lastUser } = useAuth();
  const { theme } = useTheme();
  const { acting, stop } = useActing();
  const { active: activeBusiness } = useTeam();

  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);
  const [sessionOnboardingComplete, setSessionOnboardingComplete] = React.useState(false);
  const [splashMinElapsed, setSplashMinElapsed] = React.useState(false);
  const [authStartMode, setAuthStartMode] = React.useState<'landing' | 'login' | 'register'>('landing');
  const forceOnboarding = process.env.EXPO_PUBLIC_FORCE_ONBOARDING === '1';

  // Returning users (or a locked session) go straight to Sign in with their email filled in.
  const authInitialRoute =
    authStartMode === 'register' ? 'Register' : authStartMode === 'login' || isLocked || lastUser ? 'Login' : 'AuthLanding';

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

  React.useEffect(() => {
    const t = setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
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

  if (isLoading || onboardingDone === null || !splashMinElapsed) {
    return (
      <>
        <SplashScreen />
        <StatusBar style="light" />
      </>
    );
  }

  const statusBar = <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;

  if (!user && !isLocked && !sessionOnboardingComplete && (!onboardingDone || forceOnboarding)) {
    return (
      <>
        <OnboardingScreen
          onDone={() => void markOnboardingDone()}
          onContinueToAuth={(mode) => {
            setAuthStartMode(mode);
            void markOnboardingDone();
          }}
        />
        <StatusBar style="light" />
      </>
    );
  }

  if (!user)
    return (
      <>
        <AuthStack.Navigator
          key={authInitialRoute}
          initialRouteName={authInitialRoute}
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
        >
          <AuthStack.Screen name="AuthLanding" component={AuthLandingScreen} />
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </AuthStack.Navigator>
        {statusBar}
      </>
    );

  // A new account proves its email address before anything else. Older accounts come back true and skip this.
  if (user.emailVerified === false)
    return (
      <>
        <VerifyEmailScreen />
        {statusBar}
      </>
    );

  return (
    <View style={{ flex: 1 }}>
      <ActingBanner onLeave={stop} />
      <PendingInvite />
      {/* A fresh stack for each person's money, so nothing from one shows in the other. */}
      <AuthedStack key={acting?.ownerId ?? activeBusiness?.ownerId ?? 'me'} />
      {statusBar}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold
  });

  if (!fontsLoaded) {
    return null; // keep the native splash up until fonts are ready
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <KeyboardProvider>
        <ThemeProvider>
          <SpaceProvider>
            <AmountVisibilityProvider>
              <AssistantBubbleProvider>
                <NotificationBadgeProvider>
                  <HintsProvider>
                    <AuthProvider>
                      <ToastProvider>
                        <ActingProvider>
                        <TeamProvider>
                        <ConfigProvider>
                        <CategoriesProvider>
                        <SyncProvider>
                        <NavigationContainer
                          ref={navigationRef}
                          // budgetfriendly://join/CODE opens the join screen with the code filled in (in installed builds).
                          linking={{ prefixes: ['budgetfriendly://'], config: { screens: { ShareBudget: 'join/:code' } } } as any}
                        >
                          <TourProvider>
                            <GuideProvider>
                              <NudgesProvider>
                                <View style={styles.container}>
                                  <AppBackground />
                                  <Root />
                                  <AppServices />
                                  <PrivacyCover />
                                </View>
                              </NudgesProvider>
                            </GuideProvider>
                          </TourProvider>
                        </NavigationContainer>
                        </SyncProvider>
                        </CategoriesProvider>
                        </ConfigProvider>
                        </TeamProvider>
                        </ActingProvider>
                      </ToastProvider>
                    </AuthProvider>
                  </HintsProvider>
                </NotificationBadgeProvider>
              </AssistantBubbleProvider>
            </AmountVisibilityProvider>
          </SpaceProvider>
        </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
