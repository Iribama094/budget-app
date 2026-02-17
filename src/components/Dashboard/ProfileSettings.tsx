import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, BellIcon, ClockIcon, TagIcon, MoonIcon, FileTextIcon, MailIcon, AlertTriangleIcon, ChevronRightIcon, LogOutIcon, HelpCircleIcon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getTokens } from '../../utils/api/storage';
import { getAnalyticsSummary, logout as apiLogout, listBankLinks, createBankLink, type ApiBankLink } from '../../utils/api/endpoints';
interface ProfileSettingsProps {
  onBack: () => void;
}
export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  onBack
}) => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const auth = useAuth();

  // Settings state
  const [notifications, setNotifications] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [autoCategories, setAutoCategories] = useState(true);
  const [weeklySummaries, setWeeklySummaries] = useState(true);
  const [overspendAlerts, setOverspendAlerts] = useState(true);
  const [netWorth, setNetWorth] = useState(0);
  const [bankLinks, setBankLinks] = useState<ApiBankLink[]>([]);
  const [isConnectingBank, setIsConnectingBank] = useState(false);

  const displayName = useMemo(() => {
    if (auth.user?.name?.trim()) return auth.user.name.trim();
    if (auth.user?.email?.trim()) return auth.user.email.trim();
    return 'User';
  }, [auth.user?.email, auth.user?.name]);

  const initials = useMemo(() => {
    const parts = displayName.split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 1).toUpperCase();
  }, [displayName]);

  const currency = auth.user?.currency || '₦';

  useEffect(() => {
    (async () => {
      const start = '1970-01-01';
      const end = new Date().toISOString().split('T')[0];
      const summary = await getAnalyticsSummary(start, end);
      setNetWorth(summary.totalBalance);
    })().catch((err) => {
      console.error('Failed to load net worth:', err);
      setNetWorth(0);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await listBankLinks();
        setBankLinks(res.items || []);
      } catch (err) {
        console.warn('Failed to load bank links', err);
      }
    })();
  }, []);
  // Toggle function
  const handleToggle = (setting: string, value: boolean) => {
    switch (setting) {
      case 'notifications':
        setNotifications(value);
        break;
      case 'reminders':
        setReminders(value);
        break;
      case 'autoCategories':
        setAutoCategories(value);
        break;
      case 'darkMode':
        toggleDarkMode();
        break;
      case 'weeklySummaries':
        setWeeklySummaries(value);
        break;
      case 'overspendAlerts':
        setOverspendAlerts(value);
        break;
    }
  };
  return <div className="w-full min-h-screen py-6 pb-24 relative">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="flex items-center mb-8">
          <motion.button
            className="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm shadow-soft flex items-center justify-center mr-4 border border-white/20"
            onClick={onBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </motion.button>
          <h1 className="text-2xl font-bold font-display bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
            Profile & Settings
          </h1>
        </div>
        {/* Profile Card */}
        <motion.div
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-large mb-6 border border-white/20 dark:border-gray-700/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mr-4 shadow-glow">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{displayName}</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{auth.user?.email || ''}</p>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <p className="text-gray-600 dark:text-gray-400">Net Worth</p>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-200 break-words max-w-full">
                {currency}
                {netWorth.toLocaleString()}
              </p>
            </div>
          </div>
        </motion.div>
        {/* General Settings */}
        <motion.div
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-soft mb-6 overflow-hidden border border-white/20 dark:border-gray-700/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 p-5 border-b border-gray-100/50 dark:border-gray-700/50">
            General Settings
          </h3>
          <div className="divide-y divide-gray-100/50 dark:divide-gray-700/50">
            {/* Notifications */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center mr-3 border border-primary-200">
                  <BellIcon className="w-5 h-5 text-primary-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200 font-medium">Notifications</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={notifications} onChange={e => handleToggle('notifications', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            {/* Reminders */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center mr-3 border border-secondary-200">
                  <ClockIcon className="w-5 h-5 text-secondary-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200 font-medium">Reminders</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={reminders} onChange={e => handleToggle('reminders', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary-500"></div>
              </label>
            </div>
            {/* Auto-Categorize */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center mr-3 border border-accent-200">
                  <TagIcon className="w-5 h-5 text-accent-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200 font-medium">Auto-Categorize</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={autoCategories} onChange={e => handleToggle('autoCategories', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-500"></div>
              </label>
            </div>
            {/* Dark Mode */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mr-3 border border-gray-200">
                  <MoonIcon className="w-5 h-5 text-gray-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200 font-medium">Dark Mode</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isDarkMode} onChange={e => handleToggle('darkMode', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-600"></div>
              </label>
            </div>
          </div>
        </motion.div>
        {/* Smart Options */}
        <motion.div
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-soft mb-6 overflow-hidden border border-white/20 dark:border-gray-700/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 p-5 border-b border-gray-100/50 dark:border-gray-700/50">
            Smart Options
          </h3>
          <div className="divide-y divide-gray-100/50 dark:divide-gray-700/50">
            {/* Weekly Summaries */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center mr-3 border border-primary-200">
                  <MailIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <span className="text-gray-800 dark:text-gray-200 font-medium block">
                    Send me weekly summaries
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    Receive a report every Sunday
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={weeklySummaries} onChange={e => handleToggle('weeklySummaries', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            {/* Overspend Alerts */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-error-100 flex items-center justify-center mr-3 border border-error-200">
                  <AlertTriangleIcon className="w-5 h-5 text-error-600" />
                </div>
                <div>
                  <span className="text-gray-800 dark:text-gray-200 font-medium block">
                    Alert me when I overspend
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    Get notified when exceeding category budget
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={overspendAlerts} onChange={e => handleToggle('overspendAlerts', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-error-500"></div>
              </label>
            </div>
          </div>
        </motion.div>
        {/* Data Options */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm mb-6 overflow-hidden border border-white/20 dark:border-gray-700/20">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 p-5 border-b border-gray-100 dark:border-gray-700">
            Data Options
          </h3>
          {bankLinks.length > 0 && (
            <div className="px-5 pt-3 pb-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>
                {bankLinks.length} connected bank{bankLinks.length === 1 ? '' : 's'}  b7{' '}
                {bankLinks.reduce((sum, l) => sum + (l.accounts?.length || 0), 0)} account
                {bankLinks.reduce((sum, l) => sum + (l.accounts?.length || 0), 0) === 1 ? '' : 's'}
              </p>
              <p className="truncate">
                {bankLinks.map((l) => l.bankName).join(', ')}
              </p>
            </div>
          )}
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {/* Connect Bank */}
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onClick={async () => {
                if (isConnectingBank) return;
                try {
                  setIsConnectingBank(true);
                  const link = await createBankLink({ provider: 'demo-provider', bankName: 'Demo Bank' });
                  setBankLinks((prev) => [...prev, link]);
                } catch (err) {
                  console.error('Failed to create demo bank link', err);
                } finally {
                  setIsConnectingBank(false);
                }
              }}
            >
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                  <div className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200">
                  {isConnectingBank ? 'Connecting bank a0 b7 a0Demo' : 'Connect Bank Account'}
                </span>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
            {/* Export Data */}
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                  <FileTextIcon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-gray-800 dark:text-gray-200">Export Data (CSV/PDF)</span>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        </div>
        {/* Support & Logout */}
        <div className="space-y-3 mb-6">
          <button className="w-full flex items-center p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-white/20 dark:border-gray-700/20">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
              <HelpCircleIcon className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-gray-800 dark:text-gray-200">Help & Support</span>
          </button>
          <button
            className="w-full flex items-center p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-white/20 dark:border-gray-700/20"
            onClick={() => {
              const tokens = getTokens();
              if (tokens?.refreshToken) {
                apiLogout(tokens.refreshToken).catch(() => {
                  // ignore; fall back to local logout
                });
              }
              auth.logout();
            }}
          >
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
              <LogOutIcon className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-gray-800 dark:text-gray-200">Log Out</span>
          </button>
        </div>
        <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
          BudgetFriendly v1.0.0
        </p>
      </div>
    </div>;
};