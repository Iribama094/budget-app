import { useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { OnboardingScreen } from './OnboardingScreen';
import { PageIndicator } from './PageIndicator';
import { ChevronRightIcon } from 'lucide-react';
interface OnboardingContainerProps {
  onComplete: () => void;
}
export const OnboardingContainer: React.FC<OnboardingContainerProps> = ({
  onComplete
}) => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [direction, setDirection] = useState(0);
  const screens = [{
    title: 'Welcome to BudgetFriendly',
    subtitle: 'Your personal finance companion that makes money management simple, smart, and stress-free 💚',
    illustration: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80',
    illustrationAlt: 'Mobile banking and financial management'
  }, {
    title: 'Smart Savings Made Easy',
    subtitle: 'Watch your money grow with intelligent budgeting tools and personalized insights that help you save more 🌱',
    illustration: 'https://images.unsplash.com/photo-1579621970795-87facc2f976d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80',
    illustrationAlt: 'Growing savings and financial success'
  }, {
    title: 'Achieve Your Dreams',
    subtitle: 'Set meaningful goals, track your progress, and celebrate every milestone on your journey to financial freedom ✨',
    illustration: 'https://images.unsplash.com/photo-1607863680198-23d4b2565df0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80',
    illustrationAlt: 'Financial goals and target achievement'
  }];
  const nextScreen = () => {
    if (currentScreen < screens.length - 1) {
      setDirection(1);
      setCurrentScreen(currentScreen + 1);
    }
  };
  const prevScreen = () => {
    if (currentScreen > 0) {
      setDirection(-1);
      setCurrentScreen(currentScreen - 1);
    }
  };
  // Handle swipe gestures
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, { offset, velocity }: PanInfo) => {
    const swipe = offset.x < -50 || offset.x < 0 && velocity.x < -0.3;
    if (swipe) {
      nextScreen();
    } else if (offset.x > 50 || offset.x > 0 && velocity.x > 0.3) {
      prevScreen();
    }
  };
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };
  return <div className="flex flex-col items-center justify-center w-full min-h-screen px-4 py-8 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200/30 rounded-full blur-3xl animate-pulse-soft"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-200/30 rounded-full blur-3xl animate-pulse-soft"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent-200/20 rounded-full blur-2xl"></div>
      </div>

      <div className="relative w-full max-w-md overflow-hidden bg-white/80 backdrop-blur-xl rounded-3xl shadow-large border border-white/20 h-[700px] flex flex-col">
        <AnimatePresence custom={direction} initial={false}>
          <motion.div key={currentScreen} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30
        }} drag="x" dragConstraints={{
          left: 0,
          right: 0
        }} dragElastic={0.1} onDragEnd={handleDragEnd} className="absolute w-full h-full">
            <OnboardingScreen title={screens[currentScreen].title} subtitle={screens[currentScreen].subtitle} illustration={screens[currentScreen].illustration} illustrationAlt={screens[currentScreen].illustrationAlt} />
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center space-y-4 bg-white/50 backdrop-blur-sm p-4 rounded-t-3xl border-t border-white/20">
          <PageIndicator total={screens.length} current={currentScreen} />
          <div className="flex w-full px-8 space-x-4">
            {currentScreen === screens.length - 1 ? <>
                <motion.button
                  className="flex-1 px-6 py-3 text-sm font-medium text-gray-600 bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-soft"
                  onClick={onComplete}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Skip for now
                </motion.button>
                <motion.button
                  className="flex-1 px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-accent-500 to-secondary-500 rounded-2xl shadow-large flex items-center justify-center"
                  onClick={onComplete}
                  whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(245, 158, 11, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                  animate={{
                    boxShadow: ['0 0 20px rgba(245, 158, 11, 0.3)', '0 0 30px rgba(245, 158, 11, 0.5)', '0 0 20px rgba(245, 158, 11, 0.3)']
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Let's Begin
                </motion.button>
              </> : <>
                <motion.button
                  className="flex-1 px-6 py-3 text-sm font-medium text-gray-600 bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-soft"
                  onClick={onComplete}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Skip
                </motion.button>
                <motion.button
                  className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-2xl shadow-large flex items-center justify-center"
                  onClick={nextScreen}
                  whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  Continue
                  <ChevronRightIcon className="w-4 h-4 ml-1" />
                </motion.button>
              </>}
          </div>
        </div>
      </div>
      <div className="mt-6 text-xs text-gray-500">Swipe left to continue</div>
    </div>;
};