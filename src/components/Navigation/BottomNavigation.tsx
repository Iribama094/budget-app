import React from 'react';
import { motion } from 'framer-motion';
import { Home, Wallet, BarChart3, Target } from 'lucide-react';

interface BottomNavigationProps {
  currentScreen: 'dashboard' | 'budget' | 'analytics' | 'goals';
  onScreenChange: (screen: 'dashboard' | 'budget' | 'analytics' | 'goals') => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentScreen,
  onScreenChange
}) => {
  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Home',
      icon: Home,
      color: 'primary'
    },
    {
      id: 'budget' as const,
      label: 'Your Budgets',
      icon: Wallet,
      color: 'secondary'
    },
    {
      id: 'analytics' as const,
      label: 'Analytics',
      icon: BarChart3,
      color: 'accent'
    },
    {
      id: 'goals' as const,
      label: 'Goals',
      icon: Target,
      color: 'primary'
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Modern floating navigation */}
      <div className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-large border border-white/30 dark:border-gray-700/30 px-2 py-2">
          <div className="flex items-center space-x-2">
            {navItems.map((item) => {
              const isActive = currentScreen === item.id;
              const Icon = item.icon;

              return (
                <motion.button
                  key={item.id}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-2xl min-w-[64px] transition-all duration-300 hover:bg-gray-50`}
                  onClick={() => onScreenChange(item.id)}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
                  <motion.div
                    animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Icon
                      className={`w-6 h-6 transition-colors duration-300 ${
                        isActive ? 'text-primary-600' : 'text-gray-500'
                      }`}
                    />
                  </motion.div>

                  <motion.span
                    className={`text-xs font-semibold mt-1 transition-colors duration-300 ${
                      isActive ? 'text-primary-600' : 'text-gray-500'
                    }`}
                    animate={isActive ? { opacity: 1 } : { opacity: 0.8 }}
                  >
                    {item.label}
                  </motion.span>

                  {/* no circular background — only icon + label change color when active */}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
