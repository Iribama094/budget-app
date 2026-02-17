import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PlusIcon } from 'lucide-react';
import { BudgetRing } from './BudgetRing';
import { InfoTile } from './InfoTile';
import { QuoteDisplay } from './QuoteDisplay';
import { AddTransactionModal } from './AddTransactionModal';
import { BudgetSetup } from './BudgetSetup';
import { Analytics } from './Analytics';
import { Goals } from './Goals';
import { ProfileSettings } from './ProfileSettings';
import { BottomNavigation } from '../Navigation/BottomNavigation';
import { TransactionHistory } from './TransactionHistory';
import { getAnalyticsSummary, listBudgets, listGoals, listTransactions } from '../../utils/api/endpoints';
import { useAuth } from '../../contexts/AuthContext';



export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'dashboard' | 'budget' | 'analytics' | 'goals' | 'profile' | 'transactions'>('dashboard');
  const [budgets, setBudgets] = useState<Array<{ id: string; name: string }>>([]);
  const [financialData, setFinancialData] = useState({
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyBudget: 0,
    todaySpending: 0,
    weeklySpending: 0,
    remainingBudget: 0,
    spendingByCategory: {} as Record<string, number>
  });
  const [recentTransactions, setRecentTransactions] = useState<
    Array<{ id: string; type: 'income' | 'expense'; amount: number; category: string; description: string; date: string }>
  >([]);
  const [userGoals, setUserGoals] = useState<
    Array<{ id: string; name: string; targetAmount: number; currentAmount: number; targetDate: string; emoji: string; color: string; category: string }>
  >([]);

  const ONBOARDING_SEEN_KEY = 'bf_onboarding_seen_v1';

  const handleRestartIntro = () => {
    try {
      localStorage.removeItem(ONBOARDING_SEEN_KEY);
    } catch {
      // ignore
    }
    logout();
    window.location.reload();
  };

  // Get time-aware greeting
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Refresh data when component mounts or modal closes
  const refreshData = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const startIso = startOfMonth.toISOString();
    const endIso = now.toISOString();

    const [summary, tx, goals] = await Promise.all([
      getAnalyticsSummary(startIso, endIso),
      listTransactions({ start: startIso, end: endIso, limit: 100 }),
      listGoals()
    ]);

    const todayStr = now.toDateString();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todaySpending = tx.items
      .filter((t) => t.type === 'expense')
      .filter((t) => new Date(t.occurredAt).toDateString() === todayStr)
      .reduce((sum, t) => sum + t.amount, 0);

    const weeklySpending = tx.items
      .filter((t) => t.type === 'expense')
      .filter((t) => new Date(t.occurredAt) >= weekAgo)
      .reduce((sum, t) => sum + t.amount, 0);

    setFinancialData({
      totalBalance: summary.totalBalance,
      monthlyIncome: summary.income,
      monthlyExpenses: summary.expenses,
      monthlyBudget: user?.monthlyIncome ?? 0,
      todaySpending,
      weeklySpending,
      remainingBudget: summary.remainingBudget,
      spendingByCategory: summary.spendingByCategory
    });

    setRecentTransactions(
      tx.items.slice(0, 3).map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        category: t.category,
        description: t.description,
        date: t.occurredAt
      }))
    );

    setUserGoals(
      goals
        .slice(0, 4)
        .map((g) => ({
          id: g.id,
          name: g.name,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          targetDate: g.targetDate,
          emoji: g.emoji ?? '',
          color: g.color ?? 'bg-gradient-to-br from-amber-400 to-orange-500',
          category: g.category ?? 'Other'
        }))
    );
    // load budgets separately
    const b = await listBudgets();
    setBudgets((b.items || []).map((bb: any) => ({ id: bb.id, name: bb.name })));
  };

  useEffect(() => {
    refreshData().catch((err) => {
      console.error('Failed to load dashboard data:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Handle modal close and refresh data
  const handleModalClose = () => {
    setShowModal(false);
    refreshData();
  };

  // Calculate Financial Health Score
  const calculateHealthScore = () => {
    let score = 50; // Base score

    // Budget adherence (30 points)
    if (financialData.monthlyBudget > 0) {
      const budgetUsage = financialData.monthlyExpenses / financialData.monthlyBudget;
      if (budgetUsage <= 0.7) score += 30;
      else if (budgetUsage <= 0.85) score += 20;
      else if (budgetUsage <= 1.0) score += 10;
    }

    // Savings rate (25 points)
    if (financialData.monthlyIncome > 0) {
      const savingsRate = (financialData.monthlyIncome - financialData.monthlyExpenses) / financialData.monthlyIncome;
      if (savingsRate >= 0.2) score += 25;
      else if (savingsRate >= 0.1) score += 15;
      else if (savingsRate >= 0.05) score += 10;
    }

    // Transaction consistency (15 points)
    if (recentTransactions.length >= 3) score += 15;
    else if (recentTransactions.length >= 1) score += 10;

    // Balance health (10 points)
    if (financialData.totalBalance > 0) score += 10;

    return Math.min(Math.max(score, 0), 100);
  };

  // Get goal icon based on category
  const getGoalIcon = (category: string) => {
    switch (category) {
      case 'Safety':
        return (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      case 'Travel':
        return (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        );
      case 'Technology':
        return (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'Investment':
        return (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      default:
        return (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        );
    }
  };

  // Navigate back to dashboard
  const navigateToDashboard = () => {
    setCurrentScreen('dashboard');
  };

  // Render different screens
  if (currentScreen === 'budget') {
    return <BudgetSetup onBack={navigateToDashboard} />;
  }
  if (currentScreen === 'analytics') {
    return <Analytics onBack={navigateToDashboard} />;
  }
  if (currentScreen === 'goals') {
    return <Goals onBack={navigateToDashboard} />;
  }
  if (currentScreen === 'profile') {
    return <ProfileSettings onBack={navigateToDashboard} />;
  }
  if (currentScreen === 'transactions') {
    return <TransactionHistory onBack={navigateToDashboard} />;
  }

  return (
    <div className="w-full h-[100dvh] overflow-y-auto overscroll-y-contain relative pb-[calc(env(safe-area-inset-bottom)+128px)]">
      <div className="w-full max-w-md mx-auto">
        <div className="px-6 pt-16 pb-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <motion.h1
                className="text-3xl font-bold font-display text-gray-800 dark:text-white"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                {getTimeBasedGreeting()}, {user?.name || user?.email || 'there'}!
              </motion.h1>
              <motion.p
                className="text-gray-600 dark:text-gray-300 mt-1"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                Ready to manage your budget?
              </motion.p>
            </div>
            {/* Profile icon and (optional) test-only restart intro */}
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-secondary-500 to-secondary-600 rounded-2xl flex items-center justify-center cursor-pointer shadow-soft border border-white/20"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              onClick={() => setCurrentScreen('profile')}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="text-white font-bold text-lg">
                {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
              </span>
            </motion.div>
            <button
              type="button"
              onClick={handleRestartIntro}
              className="ml-3 px-3 py-1 text-xs font-semibold rounded-full bg-white/80 text-gray-700 shadow-sm border border-white/60 hover:bg-white"
            >
              Restart intro
            </button>
          </div>

          {/* Weekly Challenge & Streak */}
          <motion.div
            className="grid grid-cols-2 gap-4 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {/* Weekly Challenge */}
            <motion.div
              className="relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-4 shadow-large overflow-hidden cursor-pointer"
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/80 text-sm font-medium">Weekly Challenge</span>
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-white text-lg font-bold">Save ₦5K</div>
                <div className="text-white/70 text-xs">3 days left • 60% done</div>
              </div>
            </motion.div>

            {/* Spending Streak */}
            <motion.div
              className="relative bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl p-4 shadow-large overflow-hidden cursor-pointer"
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/80 text-sm font-medium">Budget Streak</span>
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                  </div>
                </div>
                <div className="text-white text-lg font-bold">7 Days</div>
                <div className="text-white/70 text-xs">Under budget streak!</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Quote Display */}
          <QuoteDisplay />

          {/* Budget Ring */}
          <div className="mt-6 flex justify-center" onClick={() => setCurrentScreen('analytics')}>
            <BudgetRing
              percentage={
                financialData.monthlyBudget > 0
                  ? Math.round((financialData.monthlyExpenses / financialData.monthlyBudget) * 100)
                  : 0
              }
              spent={financialData.monthlyExpenses}
              total={financialData.monthlyBudget}
              currency="₦"
            />
          </div>

          {/* Your Budgets Section */}
          <div className="mt-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/20 dark:border-gray-700/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Your Budgets</h3>
              <button
                className="flex items-center gap-2 text-primary-600 hover:text-primary-700"
                onClick={() => setCurrentScreen('budget')}
              >
                <PlusIcon className="w-4 h-4" />
                New
              </button>
            </div>

            {budgets.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No budgets yet</p>
                <p className="text-xs mt-1">Tap the + button to create your first budget.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {budgets.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-800">{b.name}</div>
                    <button className="text-primary-600" onClick={() => setCurrentScreen('budget')}>Edit</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Financial Health Score */}
          <motion.div
            className="mt-8 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-large text-white overflow-hidden relative"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg">Financial Health</h3>
                  <p className="text-white/80 text-sm">Your money wellness score</p>
                </div>
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-2xl font-bold">{calculateHealthScore()}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-white/20 rounded-full h-2">
                  <motion.div
                    className="bg-white rounded-full h-2"
                    initial={{ width: 0 }}
                    animate={{ width: `${calculateHealthScore()}%` }}
                    transition={{ duration: 1.5, delay: 0.8 }}
                  />
                </div>
                <span className="text-white/90 text-sm font-medium">Excellent!</span>
              </div>
            </div>
          </motion.div>

          {/* Info Tiles */}
          <motion.div
            className="grid grid-cols-2 gap-4 mt-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <InfoTile
              title="Today's Spend"
              value={`₦${financialData.todaySpending.toLocaleString()}`}
              icon="dollar"
              color="orange"
            />
            <InfoTile
              title="This Week"
              value={`₦${financialData.weeklySpending.toLocaleString()}`}
              icon="calendar"
              color="blue"
            />
          </motion.div>

          {/* Quick Goals Section */}
          <motion.div
            className="mt-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-soft border border-white/20 dark:border-gray-700/20"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-display text-gray-800 dark:text-gray-200">Quick Goals</h3>
              <button
                className="text-primary-600 text-sm font-medium hover:text-primary-700 transition-colors"
                onClick={() => setCurrentScreen('goals')}
              >
                View All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {userGoals.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  <p className="text-sm">No goals yet</p>
                  <p className="text-xs mt-1">Create your first goal to get started!</p>
                </div>
              ) : (
                userGoals.map((goal, index) => {
                  const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
                return (
                  <motion.div
                    key={goal.id}
                    className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm rounded-xl p-3 hover:bg-white/80 dark:hover:bg-gray-900/60 transition-all duration-300 cursor-pointer border border-white/20 dark:border-gray-700/30 shadow-sm hover:shadow-md"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 + index * 0.1 }}
                    onClick={() => setCurrentScreen('goals')}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full ${goal.color} flex items-center justify-center shadow-sm`}>
                          {getGoalIcon(goal.category)}
                        </div>
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{goal.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className={`${goal.color} rounded-full h-2 shadow-sm`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: 1.0 + index * 0.1 }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      ₦{goal.currentAmount.toLocaleString()} / ₦{goal.targetAmount.toLocaleString()}
                    </div>
                  </motion.div>
                );
                })
              )}
            </div>
          </motion.div>

          {/* Add Transaction Button */}
          <motion.div
            className="flex justify-center mt-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            <motion.button
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-2xl font-medium shadow-large hover:shadow-xl transition-all duration-300"
              onClick={() => setShowModal(true)}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <PlusIcon className="w-5 h-5" />
              <span>Add Transaction</span>
            </motion.button>
          </motion.div>

          {/* Recent Activity Section */}
          <motion.div
            className="mt-8 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-soft border border-white/20 dark:border-gray-700/20"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-display text-gray-800 dark:text-gray-200">Recent Activity</h3>
              <button
                className="text-primary-600 text-sm font-medium hover:text-primary-700 transition-colors"
                onClick={() => setCurrentScreen('transactions')}
              >
                View All
              </button>
            </div>

            <div className="space-y-3">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No transactions yet</p>
                  <p className="text-xs mt-1">Add your first transaction to get started!</p>
                </div>
              ) : (
                recentTransactions.map((transaction, index) => {
                  const getCategoryIcon = (category: string) => {
                    const icons: { [key: string]: string } = {
                      'Food': '🍕',
                      'Transport': '⛽',
                      'Shopping': '🛒',
                      'Bills': '💡',
                      'Entertainment': '🎬',
                      'Health': '🏥',
                      'Education': '📚',
                      'Income': '💰',
                      'Other': '📝'
                    };
                    return icons[category] || '📝';
                  };

                  const getTimeAgo = (dateString: string) => {
                    const now = new Date();
                    const transactionDate = new Date(dateString);
                    const diffInHours = Math.floor((now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60));

                    if (diffInHours < 1) return 'Just now';
                    if (diffInHours < 24) return `${diffInHours} hours ago`;
                    const diffInDays = Math.floor(diffInHours / 24);
                    if (diffInDays === 1) return 'Yesterday';
                    return `${diffInDays} days ago`;
                  };

                  return (
                    <motion.div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/40 hover:bg-gray-100/50 dark:hover:bg-gray-900/60 transition-colors cursor-pointer"
                      whileHover={{ x: 4 }}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.2 + index * 0.1 }}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-lg">
                          {getCategoryIcon(transaction.category)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{transaction.description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.category} • {getTimeAgo(transaction.date)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                          {transaction.type === 'income' ? '+' : '-'}₦{transaction.amount.toLocaleString()}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* Quick Insights */}
          <motion.div
            className="mt-6 grid grid-cols-1 gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.4 }}
          >
            <div className="bg-gradient-to-r from-accent-500 to-accent-600 rounded-2xl p-4 text-white shadow-large">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm font-medium">Smart Tip</p>
                  <p className="text-white text-sm mt-1">
                    You're spending 15% less this month! Keep it up to reach your savings goal faster.
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation
        currentScreen={currentScreen === 'dashboard' ? 'dashboard' : currentScreen === 'budget' ? 'budget' : currentScreen === 'analytics' ? 'analytics' : 'goals'}
        onScreenChange={(screen) => setCurrentScreen(screen)}
      />

      {/* Add Transaction Modal */}
      {showModal && <AddTransactionModal onClose={handleModalClose} />}
    </div>
  );
};