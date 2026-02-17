import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, PlusIcon, CheckCircleIcon, TrendingUpIcon, CalendarIcon, TargetIcon, ShieldIcon, PlaneIcon, LaptopIcon } from 'lucide-react';
import { createGoal as apiCreateGoal, listGoals, patchGoal } from '../../utils/api/endpoints';
import type { Goal as DataGoal } from '../../utils/dataManager';
interface GoalsProps {
  onBack: () => void;
}
export const Goals: React.FC<GoalsProps> = ({
  onBack
}) => {
  const [showCompletedMessage, setShowCompletedMessage] = useState<string | null>(null);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [goals, setGoals] = useState<DataGoal[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
    category: 'Other'
  });

  // Load goals from backend
  useEffect(() => {
    listGoals()
      .then((items) => {
        setGoals(
          items.map((g) => ({
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
      })
      .catch((err) => {
        console.error('Failed to load goals:', err);
        setGoals([]);
      });
  }, []);

  // Create new goal
  const createGoal = async () => {
    if (!newGoal.name || !newGoal.targetAmount || !newGoal.targetDate) return;

    const goalIcons = {
      'Safety': { icon: 'shield', color: 'bg-gradient-to-br from-orange-400 to-red-500' },
      'Travel': { icon: 'plane', color: 'bg-gradient-to-br from-blue-400 to-purple-500' },
      'Technology': { icon: 'laptop', color: 'bg-gradient-to-br from-purple-400 to-pink-500' },
      'Investment': { icon: 'trending', color: 'bg-gradient-to-br from-emerald-400 to-teal-500' },
      'Other': { icon: 'target', color: 'bg-gradient-to-br from-amber-400 to-orange-500' }
    };

    const iconData = goalIcons[newGoal.category as keyof typeof goalIcons] || goalIcons.Other;

    try {
      const created = await apiCreateGoal({
        name: newGoal.name,
        targetAmount: parseFloat(newGoal.targetAmount),
        targetDate: newGoal.targetDate,
        currentAmount: 0,
        color: iconData.color,
        category: newGoal.category
      });

      const goal: DataGoal = {
        id: created.id,
        name: created.name,
        targetAmount: created.targetAmount,
        currentAmount: created.currentAmount,
        targetDate: created.targetDate,
        emoji: created.emoji ?? '',
        color: created.color ?? iconData.color,
        category: created.category ?? newGoal.category
      };

      setGoals((prev) => [goal, ...prev]);

      // Reset form
      setNewGoal({ name: '', targetAmount: '', targetDate: '', category: 'Other' });
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create goal:', err);
    }
  };

  // Get icon for goal category
  const getGoalIcon = (category: string) => {
    switch (category) {
      case 'Safety':
        return <ShieldIcon className="w-4 h-4" />;
      case 'Travel':
        return <PlaneIcon className="w-4 h-4" />;
      case 'Technology':
        return <LaptopIcon className="w-4 h-4" />;
      case 'Investment':
        return <TrendingUpIcon className="w-4 h-4" />;
      default:
        return <TargetIcon className="w-4 h-4" />;
    }
  };
  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  // Calculate days remaining
  const calculateDaysRemaining = (deadline: string) => {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Handle goal click
  const handleGoalClick = (id: string) => {
    setExpandedGoal(expandedGoal === id ? null : id);
  };
  return <div className="w-full min-h-screen py-6 pb-24 relative">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <motion.button
              className="w-10 h-10 rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/20 shadow-soft flex items-center justify-center mr-3"
              onClick={onBack}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5 text-gray-700 dark:text-gray-200" />
            </motion.button>
            <h1 className="text-2xl font-bold font-display bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
              Your Goals
            </h1>
          </div>
          <motion.button
            className="w-12 h-12 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 shadow-large flex items-center justify-center border border-white/20"
            whileHover={{ scale: 1.05, boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreateModal(true)}
          >
            <PlusIcon className="w-5 h-5 text-white" />
          </motion.button>
        </div>
        {/* Completion Message */}
        <AnimatePresence>
          {showCompletedMessage && <motion.div
            className="bg-gradient-to-r from-primary-50 to-success-50 border border-primary-200 rounded-2xl p-4 mb-6 flex items-center shadow-soft backdrop-blur-sm"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
              <CheckCircleIcon className="w-6 h-6 text-primary-600 mr-3" />
              <div>
                <p className="text-primary-800 font-semibold">Goal Completed!</p>
                <p className="text-primary-700 text-sm">
                  Goal completed successfully!
                </p>
              </div>
            </motion.div>}
        </AnimatePresence>
        {/* Goals List */}
        <div className="space-y-6">
          {goals.map(goal => <div key={goal.id}>
              <motion.div
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-soft overflow-hidden cursor-pointer border border-white/20 dark:border-gray-700/20"
                whileHover={{ y: -4, scale: 1.02, boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.15)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleGoalClick(goal.id)}
              >
                {/* Goal Card Header */}
                <div className={`relative h-32 ${goal.color} overflow-hidden`}>
                  {/* Glassmorphism Effects */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-white/5 backdrop-blur-sm"></div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>

                  {/* Content */}
                  <div className="relative h-full flex items-center justify-between p-6">
                    <div className="flex items-center space-x-4">
                      {/* Icon */}
                      <div className="w-16 h-16 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center border border-white/40 shadow-lg">
                        <div className="text-white drop-shadow-sm">
                          {getGoalIcon(goal.category)}
                        </div>
                      </div>

                      {/* Goal Info */}
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {goal.name}
                        </h3>
                        <p className="text-sm text-white/90">
                          {calculateDaysRemaining(goal.targetDate)} days remaining
                        </p>
                        <p className="text-xs text-white/70 mt-1">
                          {goal.category}
                        </p>
                      </div>
                    </div>

                    {/* Progress Circle */}
                    <div className="relative w-12 h-12">
                      <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-white/20"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-white"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray={`${(goal.currentAmount / goal.targetAmount) * 100}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white">
                          {Math.round((goal.currentAmount / goal.targetAmount) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Progress Details */}
                <div className="p-6">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Progress
                    </div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      ₦{goal.currentAmount.toLocaleString()} / ₦{goal.targetAmount.toLocaleString()}
                    </div>
                  </div>

                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 shadow-glow"
                      initial={{ width: 0 }}
                      animate={{ width: `${(goal.currentAmount / goal.targetAmount) * 100}%` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                    />
                  </div>

                  {/* Target Date */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-500 dark:text-gray-400">
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      Target: {formatDate(goal.targetDate)}
                    </div>
                    <div className="text-gray-600 dark:text-gray-300 font-medium">
                      ₦{(goal.targetAmount - goal.currentAmount).toLocaleString()} to go
                    </div>
                  </div>
                </div>
              </motion.div>
              {/* Expanded View */}
              <AnimatePresence>
                {expandedGoal === goal.id && <motion.div
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm mt-2 rounded-2xl p-4 shadow-soft border border-white/20 dark:border-gray-700/20"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                    <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Timeline</h4>
                    {/* Goal Timeline */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-start">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center mr-3 border border-primary-200">
                          <CalendarIcon className="w-4 h-4 text-primary-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Goal Started</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">May 15, 2023</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="w-8 h-8 rounded-full bg-secondary-100 flex items-center justify-center mr-3 border border-secondary-200">
                          <TrendingUpIcon className="w-4 h-4 text-secondary-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Target Date</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(goal.targetDate)}
                          </p>
                        </div>
                      </div>
                      {goal.currentAmount >= goal.targetAmount && <div className="flex items-start">
                          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center mr-3 border border-accent-200">
                            <CheckCircleIcon className="w-4 h-4 text-accent-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              Goal Completed
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Congratulations!</p>
                          </div>
                        </div>}
                    </div>
                    {/* Action Button */}
                    {goal.currentAmount < goal.targetAmount && <motion.button
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-semibold shadow-soft"
                      onClick={async () => {
                        // For demo purposes, add 10% of target amount
                        const addAmount = Math.min(goal.targetAmount * 0.1, goal.targetAmount - goal.currentAmount);
                        const nextAmount = goal.currentAmount + addAmount;
                        try {
                          const updated = await patchGoal(goal.id, { currentAmount: nextAmount });
                          setGoals((prev) =>
                            prev.map((g) => (g.id === goal.id ? { ...g, currentAmount: updated.currentAmount } : g))
                          );

                          if (updated.currentAmount >= goal.targetAmount) {
                            setShowCompletedMessage(goal.id);
                            setTimeout(() => setShowCompletedMessage(null), 2500);
                          }
                        } catch (err) {
                          console.error('Failed to update goal:', err);
                        }
                      }}
                      whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)' }}
                      whileTap={{ scale: 0.98 }}
                    >
                        Add Funds
                      </motion.button>}
                  </motion.div>}
              </AnimatePresence>
            </div>)}
        </div>
      </div>

      {/* Create Goal Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4">Create New Goal</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Goal Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., Emergency Fund"
                    value={newGoal.name}
                    onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Amount</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="100000"
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={newGoal.targetDate}
                    onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={newGoal.category}
                    onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value })}
                  >
                    <option value="Safety">Safety</option>
                    <option value="Travel">Travel</option>
                    <option value="Technology">Technology</option>
                    <option value="Investment">Investment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-medium hover:shadow-lg"
                  onClick={createGoal}
                  disabled={!newGoal.name || !newGoal.targetAmount || !newGoal.targetDate}
                >
                  Create Goal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>;
};