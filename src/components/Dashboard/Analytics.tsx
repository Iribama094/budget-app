import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, TrendingUpIcon, TrendingDownIcon, AlertTriangleIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { getAnalyticsSummary, listTransactions } from '../../utils/api/endpoints';
interface AnalyticsProps {
  onBack: () => void;
}
interface CategoryData {
  name: string;
  value: number;
  color: string;
}
interface TimelineData {
  name: string;
  food: number;
  transport: number;
  shopping: number;
  bills: number;
  misc: number;
}

function timeframeRange(timeframe: 'daily' | 'weekly' | 'monthly') {
  const now = new Date();
  if (timeframe === 'daily') {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { start, end: now };
  }
  if (timeframe === 'weekly') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start, end: now };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now };
}

function bucketCategory(category: string): keyof Omit<TimelineData, 'name'> {
  const c = category.trim().toLowerCase();
  if (c.includes('food') || c.includes('grocer') || c.includes('dining')) return 'food';
  if (c.includes('transport') || c.includes('car') || c.includes('gas') || c.includes('taxi') || c.includes('uber')) return 'transport';
  if (c.includes('shop')) return 'shopping';
  if (c.includes('bill') || c.includes('util') || c.includes('rent') || c.includes('electric') || c.includes('internet')) return 'bills';
  return 'misc';
}

async function fetchAllTransactions(startIso: string, endIso: string, maxPages = 5) {
  const items: Array<{ type: 'income' | 'expense'; amount: number; category: string; occurredAt: string }> = [];
  let cursor: string | undefined;

  for (let i = 0; i < maxPages; i++) {
    const page = await listTransactions({ start: startIso, end: endIso, limit: 200, cursor });
    for (const t of page.items) {
      items.push({ type: t.type, amount: t.amount, category: t.category, occurredAt: t.occurredAt });
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return items;
}
export const Analytics: React.FC<AnalyticsProps> = ({
  onBack
}) => {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [currentData, setCurrentData] = useState<TimelineData[]>([]);
  const [totalSpending, setTotalSpending] = useState(0);
  const [insights, setInsights] = useState<
    Array<{ title: string; description: string; icon: React.ReactNode; color: string }>
  >([]);

  useEffect(() => {
    setSelectedCategory(null);

    (async () => {
      const { start, end } = timeframeRange(timeframe);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const summary = await getAnalyticsSummary(startIso, endIso);
      setTotalSpending(summary.expenses);

      const totals: Record<keyof Omit<TimelineData, 'name'>, number> = {
        food: 0,
        transport: 0,
        shopping: 0,
        bills: 0,
        misc: 0
      };
      for (const [cat, value] of Object.entries(summary.spendingByCategory || {})) {
        totals[bucketCategory(cat)] += value;
      }

      setCategoryData([
        { name: 'Food', value: totals.food, color: '#10b981' },
        { name: 'Transport', value: totals.transport, color: '#f97316' },
        { name: 'Shopping', value: totals.shopping, color: '#f59e0b' },
        { name: 'Bills', value: totals.bills, color: '#059669' },
        { name: 'Misc', value: totals.misc, color: '#dc2626' }
      ]);

      const tx = await fetchAllTransactions(startIso, endIso);
      const expenses = tx.filter((t) => t.type === 'expense');

      if (timeframe === 'daily') {
        const bins: TimelineData[] = [
          { name: '6h ago', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: '12h ago', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: '18h ago', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: 'Yesterday', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 }
        ];

        const now = end.getTime();
        for (const t of expenses) {
          const when = new Date(t.occurredAt).getTime();
          const diffHours = Math.max(0, Math.floor((now - when) / (60 * 60 * 1000)));
          const idx = Math.min(3, Math.floor(diffHours / 6));
          const key = bucketCategory(t.category);
          bins[idx][key] += t.amount;
        }
        setCurrentData(bins);
      } else if (timeframe === 'weekly') {
        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayMap = new Map<string, TimelineData>();

        for (let i = 6; i >= 0; i--) {
          const d = new Date(end);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          dayMap.set(key, { name: labels[d.getDay()], food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 });
        }

        for (const t of expenses) {
          const d = new Date(t.occurredAt);
          const k = d.toISOString().split('T')[0];
          const row = dayMap.get(k);
          if (!row) continue;
          row[bucketCategory(t.category)] += t.amount;
        }

        setCurrentData(Array.from(dayMap.values()));
      } else {
        const bins: TimelineData[] = [
          { name: 'Week 1', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: 'Week 2', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: 'Week 3', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 },
          { name: 'Week 4', food: 0, transport: 0, shopping: 0, bills: 0, misc: 0 }
        ];

        for (const t of expenses) {
          const d = new Date(t.occurredAt);
          const dayOfMonth = d.getDate();
          const week = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
          bins[week][bucketCategory(t.category)] += t.amount;
        }
        setCurrentData(bins);
      }

      const sortedCats = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .filter(([, v]) => v > 0);

      const top = sortedCats[0];
      const topName = top ? top[0] : 'misc';
      const topAmount = top ? top[1] : 0;
      const pretty = topName === 'food' ? 'Food' : topName === 'transport' ? 'Transport' : topName === 'shopping' ? 'Shopping' : topName === 'bills' ? 'Bills' : 'Misc';

      const nextInsights: Array<{ title: string; description: string; icon: React.ReactNode; color: string }> = [];
      nextInsights.push({
        title: `Top Category: ${pretty}`,
        description: `You spent ₦${topAmount.toLocaleString()} on ${pretty.toLowerCase()} in this timeframe.`,
        icon: <TrendingUpIcon className="w-5 h-5 text-secondary-600" />,
        color: 'bg-secondary-50 border-secondary-200 text-secondary-800'
      });

      nextInsights.push({
        title: summary.remainingBudget >= 0 ? 'Budget Remaining' : 'Over Budget',
        description:
          summary.remainingBudget >= 0
            ? `You have ₦${summary.remainingBudget.toLocaleString()} remaining based on your monthly income.`
            : `You are ₦${Math.abs(summary.remainingBudget).toLocaleString()} over based on your monthly income.`,
        icon: <TrendingDownIcon className="w-5 h-5 text-primary-600" />,
        color: 'bg-primary-50 border-primary-200 text-primary-800'
      });

      if (summary.remainingBudget < 0) {
        nextInsights.push({
          title: 'Overspend Alert',
          description: 'Consider reviewing your biggest expense category this period.',
          icon: <AlertTriangleIcon className="w-5 h-5 text-error-600" />,
          color: 'bg-error-50 border-error-200 text-error-800'
        });
      }

      setInsights(nextInsights);
    })().catch((err) => {
      console.error('Failed to load analytics:', err);
      setCategoryData([]);
      setCurrentData([]);
      setTotalSpending(0);
      setInsights([]);
    });
  }, [timeframe]);

  const effectiveSelectedCategory = useMemo(() => {
    if (!selectedCategory) return null;
    return selectedCategory.toLowerCase();
  }, [selectedCategory]);
  // Animation for pie chart slices
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };
  const onPieLeave = () => {
    setActiveIndex(null);
  };
  const handleCategoryClick = (name: string) => {
    setSelectedCategory(selectedCategory === name ? null : name);
  };
  // Custom tooltip for bar chart
  const CustomTooltip = ({
    active,
    payload
  }: any) => {
    if (active && payload && payload.length) {
      return <div className="bg-white dark:bg-gray-800 p-2 rounded shadow-md border border-gray-200 dark:border-gray-700 text-xs">
          <p className="font-medium text-gray-800 dark:text-gray-200">{`₦${payload[0].value.toLocaleString()}`}</p>
          <p className="text-gray-600 dark:text-gray-400">{payload[0].name}</p>
        </div>;
    }
    return null;
  };
    return <div className="w-full min-h-screen py-4 pb-20 relative">
      <div className="max-w-md mx-auto px-3">
        {/* Header */}
        <div className="flex items-center mb-4">
          <motion.button
            className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur-sm shadow-soft flex items-center justify-center mr-3 border border-white/20"
            onClick={onBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </motion.button>
          <h1 className="text-xl font-bold font-display bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
            Spending Insights 📊
          </h1>
        </div>
        {/* Timeframe Toggle */}
        <div className="flex bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-1 mb-4 shadow-soft border border-white/20 dark:border-gray-700/20">
          <button className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${timeframe === 'daily' ? 'bg-primary-100 text-primary-700 shadow-soft' : 'text-gray-600 hover:text-primary-600'}`} onClick={() => setTimeframe('daily')}>
            Daily
          </button>
          <button className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${timeframe === 'weekly' ? 'bg-primary-100 text-primary-700 shadow-soft' : 'text-gray-600 hover:text-primary-600'}`} onClick={() => setTimeframe('weekly')}>
            Weekly
          </button>
          <button className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${timeframe === 'monthly' ? 'bg-primary-100 text-primary-700 shadow-soft' : 'text-gray-600 hover:text-primary-600'}`} onClick={() => setTimeframe('monthly')}>
            Monthly
          </button>
        </div>
        {/* Total Spending */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 mb-4 shadow-sm border border-white/20 dark:border-gray-700/20">
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Spending</h3>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            ₦{totalSpending.toLocaleString()}
          </div>
        </div>
        {/* Category Breakdown */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 mb-4 shadow-sm border border-white/20 dark:border-gray-700/20">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">Category Breakdown</h3>
          <div className="flex">
            {/* Pie Chart */}
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={activeIndex !== null ? 70 : 60} paddingAngle={2} dataKey="value" onMouseEnter={onPieEnter} onMouseLeave={onPieLeave} animationBegin={0} animationDuration={1000}>
                    {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" style={{
                    filter: activeIndex === index ? 'drop-shadow(0px 0px 4px rgba(0,0,0,0.3))' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }} onClick={() => handleCategoryClick(entry.name)} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="w-1/2 pl-2 flex flex-col justify-center">
              {categoryData.map((category) => <motion.div key={category.name} className="flex items-center mb-2 cursor-pointer" whileHover={{
              scale: 1.05
            }} animate={{
              opacity: selectedCategory === null || selectedCategory === category.name ? 1 : 0.5
            }} onClick={() => handleCategoryClick(category.name)}>
                  <div className="w-3 h-3 rounded-full mr-2" style={{
                backgroundColor: category.color
              }} />
                  <div className="text-sm flex-1 text-gray-800 dark:text-gray-200">{category.name}</div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    ₦{category.value.toLocaleString()}
                  </div>
                </motion.div>)}
            </div>
          </div>
        </div>
        {/* Timeline Chart */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 mb-4 shadow-sm border border-white/20 dark:border-gray-700/20">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">
            {timeframe === 'daily' ? 'Daily Trend' : timeframe === 'monthly' ? 'Monthly Trend' : 'Weekly Trend'}
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={currentData} margin={{
            top: 10,
            right: 0,
            left: -20,
            bottom: 0
          }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis hide={true} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey={effectiveSelectedCategory || 'food'} stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1000} hide={selectedCategory !== null && selectedCategory !== 'Food'} />
              <Bar dataKey="transport" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={1000} hide={selectedCategory !== null && selectedCategory !== 'Transport'} />
              <Bar dataKey="shopping" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={1000} hide={selectedCategory !== null && selectedCategory !== 'Shopping'} />
              <Bar dataKey="bills" stackId="a" fill="#059669" radius={[4, 4, 0, 0]} animationDuration={1000} hide={selectedCategory !== null && selectedCategory !== 'Bills'} />
              <Bar dataKey="misc" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} animationDuration={1000} hide={selectedCategory !== null && selectedCategory !== 'Misc'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Spending Insights */}
        <div className="space-y-3 mb-4">
          <h3 className="font-medium text-gray-800 dark:text-gray-200">Spending Insights</h3>
          {insights.map((insight, index) => <motion.div key={index} className={`p-3 rounded-lg border ${insight.color}`} initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: index * 0.1
        }}>
              <div className="flex items-center mb-1">
                {insight.icon}
                <h4 className="font-medium ml-2">{insight.title}</h4>
              </div>
              <p className="text-sm">{insight.description}</p>
            </motion.div>)}
        </div>
      </div>
    </div>;
};