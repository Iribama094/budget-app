import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const QUOTES = [
  'Small savings grow big.',
  'Track today, thrive tomorrow.',
  'Budget like a boss.',
  'Save a little, gain a lot.',
  'Your money deserves a plan.'
];

export const QuoteDisplay = () => {
  const [currentQuote, setCurrentQuote] = useState(QUOTES[0]);
  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * QUOTES.length);
      setCurrentQuote(QUOTES[randomIndex]);
    }, 8000);
    return () => clearInterval(interval);
  }, []);
  return <motion.div className="bg-white p-4 rounded-xl shadow-sm mb-6" initial={{
    opacity: 0
  }} animate={{
    opacity: 1
  }} transition={{
    duration: 0.5
  }}>
      <motion.p className="text-center text-gray-700 italic" key={currentQuote} initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: 0.5
    }}>
        "{currentQuote}"
      </motion.p>
    </motion.div>;
};