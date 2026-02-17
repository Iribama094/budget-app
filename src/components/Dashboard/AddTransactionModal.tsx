import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as XIcon, Calendar as CalendarIcon, FileText as FileTextIcon, Camera as CameraIcon, CheckCircle as CheckCircleIcon, Coffee as CoffeeIcon, ShoppingBag as ShoppingBagIcon, Car as CarIcon, Zap as ZapIcon, Briefcase as BriefcaseIcon, DollarSign as DollarSignIcon, Gift as GiftIcon, TrendingUp as TrendingUpIcon, Clock as ClockIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { validateAmount, validateDescription, validateCategory } from '../../utils/dataManager';
import { createTransaction, listBudgets, listMiniBudgets, createMiniBudget, patchBudget } from '../../utils/api/endpoints';
interface AddTransactionModalProps {
  onClose: () => void;
}
interface CategoryOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
}
export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  onClose
}) => {
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [displayAmount, setDisplayAmount] = useState('0');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [slideProgress, setSlideProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | number | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<string[]>([]);
  const [selectedBudgetCategory, setSelectedBudgetCategory] = useState<string | null>(null);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [selectedMiniBudget, setSelectedMiniBudget] = useState<string | null>(null);
  const [miniBudgetText, setMiniBudgetText] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Define category options with new theme
  const expenseCategories: CategoryOption[] = [{
    id: 'food',
    name: 'Food',
    icon: <CoffeeIcon size={18} />,
    color: 'bg-secondary-100 text-secondary-600 border-secondary-200'
  }, {
    id: 'transport',
    name: 'Transport',
    icon: <CarIcon size={18} />,
    color: 'bg-primary-100 text-primary-600 border-primary-200'
  }, {
    id: 'shopping',
    name: 'Shopping',
    icon: <ShoppingBagIcon size={18} />,
    color: 'bg-accent-100 text-accent-600 border-accent-200'
  }, {
    id: 'bills',
    name: 'Bills',
    icon: <ZapIcon size={18} />,
    color: 'bg-warning-100 text-warning-600 border-warning-200'
  }, {
    id: 'misc',
    name: 'Misc',
    icon: <BriefcaseIcon size={18} />,
    color: 'bg-gray-100 text-gray-600 border-gray-200'
  }];
  const incomeCategories: CategoryOption[] = [{
    id: 'salary',
    name: 'Salary',
    icon: <DollarSignIcon size={18} />,
    color: 'bg-primary-100 text-primary-600 border-primary-200'
  }, {
    id: 'freelance',
    name: 'Freelance',
    icon: <BriefcaseIcon size={18} />,
    color: 'bg-secondary-100 text-secondary-600 border-secondary-200'
  }, {
    id: 'gifts',
    name: 'Gifts',
    icon: <GiftIcon size={18} />,
    color: 'bg-accent-100 text-accent-600 border-accent-200'
  }, {
    id: 'investments',
    name: 'Investments',
    icon: <TrendingUpIcon size={18} />,
    color: 'bg-success-100 text-success-600 border-success-200'
  }];
  const activeCategories = transactionType === 'expense' ? expenseCategories : incomeCategories;
  // Show suggestion based on time of day
  useEffect(() => {
    const currentHour = new Date().getHours();
    // Show lunch suggestion around noon
    if (currentHour >= 11 && currentHour <= 14) {
      setTimeout(() => {
        setShowSuggestion(true);
      }, 1000);
    }
  }, []);

  useEffect(() => {
    // load budgets for selection
    (async () => {
      try {
        const res = await listBudgets();
        const items = res.items ?? [];
        setBudgets(items);
        // populate categories from the first budget as defaults
        if (items.length > 0) {
          const first = items[0];
          setBudgetCategories(Object.keys(first.categories || {}));
        }
      } catch (err) {
        // ignore
      }
    })();
  }, []);
  // Handle number pad input
  const handleNumberInput = (value: string) => {
    // Clear amount error when user starts typing
    if (errors.amount) {
      setErrors(prev => ({ ...prev, amount: '' }));
    }

    if (value === 'backspace') {
      if (amount.length > 0) {
        const newAmount = amount.slice(0, -1);
        setAmount(newAmount);
        setDisplayAmount(newAmount === '' ? '0' : newAmount);
      }
      return;
    }
    if (value === '.') {
      if (amount.includes('.')) return;
      const newAmount = amount === '' ? '0.' : amount + '.';
      setAmount(newAmount);
      setDisplayAmount(newAmount);
      return;
    }
    const newAmount = amount + value;
    setAmount(newAmount);
    setDisplayAmount(newAmount);
  };
  // Handle suggestion acceptance
  const handleAcceptSuggestion = () => {
    setAmount('2000');
    setDisplayAmount('2000');
    setSelectedCategory('food');
    setShowSuggestion(false);
  };
  // Handle slide to save
  const handleSlideChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setSlideProgress(value);
    if (value === 100) {
      handleSave();
    }
  };
  // Save transaction with validation
  const handleSave = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    const newErrors: {[key: string]: string} = {};

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      newErrors.amount = amountValidation.error ?? 'Invalid amount';
    }

    // Validate category
    const categoryValidation = validateCategory(selectedCategory || '');
    if (!categoryValidation.isValid) {
      newErrors.category = categoryValidation.error ?? 'Invalid category';
    }

    // Validate description (notes)
    const descriptionValidation = validateDescription(notes || 'Transaction');
    if (!descriptionValidation.isValid) {
      newErrors.notes = descriptionValidation.error ?? 'Invalid description';
    }

    setErrors(newErrors);

    // If there are errors, stop submission
    if (Object.keys(newErrors).length > 0) {
      setIsSubmitting(false);
      return;
    }

    try {
      if (!selectedCategory) {
        setErrors({ category: 'Please select a category' });
        setIsSubmitting(false);
        return;
      }

      const categoryOption = activeCategories.find((c) => c.id === selectedCategory);
      const categoryName = categoryOption?.name ?? selectedCategory;

      // Budget is required
      if (!selectedBudgetId) {
        setErrors({ ...newErrors, budget: 'Please select a budget' });
        setIsSubmitting(false);
        return;
      }

      // If the user typed a new mini-budget name and selected a parent budget, create it first
      if (!selectedMiniBudget && miniBudgetText && selectedBudgetId) {
        try {
          const created = await createMiniBudget(String(selectedBudgetId), { name: miniBudgetText, amount: 0, category: selectedBudgetCategory ?? undefined });
          setSelectedMiniBudget(created.id);
        } catch (err) {
          // if creation fails, continue and pass the text as a fallback
          console.warn('Failed to create mini-budget:', err);
        }
      }

      await createTransaction({
        type: transactionType,
        amount: parseFloat(amount),
        category: categoryName,
        description: notes || 'Transaction',
        occurredAt: date.toISOString(),
        budgetId: selectedBudgetId ?? undefined,
        budgetCategory: selectedBudgetCategory ?? undefined,
        miniBudget: selectedMiniBudget ?? (miniBudgetText ? miniBudgetText : undefined)
      });

      // If this is an income and it's tied to a budget, add the amount to that budget's totalBudget
      if (transactionType === 'income' && selectedBudgetId) {
        try {
          const chosen = budgets.find(b => String(b.id) === String(selectedBudgetId));
          if (chosen) {
            const newTotal = (typeof chosen.totalBudget === 'number' ? chosen.totalBudget : 0) + parseFloat(amount);
            await patchBudget(String(chosen.id), { totalBudget: newTotal });
          }
        } catch (err) {
          console.warn('Failed to update budget total after income transaction', err);
        }
      }

      setShowSuccess(true);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error saving transaction:', error);
      setErrors({ general: 'Failed to save transaction. Please try again.' });
      setIsSubmitting(false);
    }
  };
  return <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4" initial={{
    opacity: 0
  }} animate={{
    opacity: 1
  }} exit={{
    opacity: 0
  }}>
      <motion.div className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-3xl overflow-hidden shadow-large border border-white/20 max-h-[90vh] overflow-y-auto" initial={{
      y: 50,
      opacity: 0
    }} animate={{
      y: 0,
      opacity: 1
    }} transition={{
      type: 'spring',
      damping: 25,
      stiffness: 300
    }}>
        <AnimatePresence>
          {showSuccess ? <motion.div className="flex flex-col items-center justify-center p-10 h-96" initial={{
          opacity: 0,
          scale: 0.8
        }} animate={{
          opacity: 1,
          scale: 1
        }} exit={{
          opacity: 0
        }}>
              <motion.div initial={{
            scale: 0
          }} animate={{
            scale: 1
          }} transition={{
            delay: 0.2,
            type: 'spring'
          }} className="w-20 h-20 rounded-2xl bg-primary-100 flex items-center justify-center mb-4 border border-primary-200">
                <CheckCircleIcon className="w-10 h-10 text-primary-600" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Transaction Saved!
              </h2>
              <p className="text-gray-600 text-center">
                {transactionType === 'expense' ? 'Expense' : 'Income'} of ₦
                {displayAmount} has been added.
              </p>
            </motion.div> : <div className="flex flex-col h-full">
              <div className="flex justify-between items-center p-4 border-b border-gray-100/50">
                <h2 className="text-lg font-bold font-display bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">Add Transaction</h2>
                <motion.button
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100/80 backdrop-blur-sm border border-gray-200"
                  onClick={onClose}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <XIcon className="w-4 h-4 text-gray-600" />
                </motion.button>
              </div>

              {/* Transaction Type Toggle */}
              <div className="flex rounded-xl bg-gray-100/80 p-1 mx-4 mt-3">
                <motion.button
                  type="button"
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ${transactionType === 'expense' ? 'bg-white shadow-soft text-error-600 border border-white' : 'text-gray-600'}`}
                  onClick={() => {
                    setTransactionType('expense');
                    setSelectedCategory(null);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Expense
                </motion.button>
                <motion.button
                  type="button"
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ${transactionType === 'income' ? 'bg-white shadow-soft text-primary-600 border border-white' : 'text-gray-600'}`}
                  onClick={() => {
                    setTransactionType('income');
                    setSelectedCategory(null);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Income
                </motion.button>
              </div>

              {/* Amount Display */}
              <motion.div className="flex justify-center items-center h-12 mt-3" key={displayAmount} initial={{
            opacity: 0.5,
            y: -10
          }} animate={{
            opacity: 1,
            y: 0
          }} transition={{
            duration: 0.2
          }}>
                <span className="text-lg font-bold mr-1">₦</span>
                <span className="text-2xl font-bold">{displayAmount}</span>
              </motion.div>

              {/* Amount Error */}
              {errors.amount && (
                <motion.div
                  className="text-center mt-1"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="text-xs text-red-500 font-medium">{errors.amount}</span>
                </motion.div>
              )}

              {/* Smart Suggestion */}
              <AnimatePresence>
                {showSuggestion && transactionType === 'expense' && <motion.div className="mx-4 mb-3 p-3 bg-primary-50 rounded-xl border border-primary-200 flex items-center shadow-soft" initial={{
              opacity: 0,
              y: -20,
              height: 0
            }} animate={{
              opacity: 1,
              y: 0,
              height: 'auto'
            }} exit={{
              opacity: 0,
              height: 0
            }}>
                    <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center mr-2 border border-primary-200">
                      <ClockIcon className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-primary-800">
                        Lunch suggestion
                      </p>
                      <p className="text-xs text-primary-600">
                        Add ₦2,000 for Food?
                      </p>
                    </div>
                    <motion.button
                      className="ml-2 px-3 py-1 bg-primary-600 text-white text-xs font-semibold rounded-lg shadow-soft"
                      onClick={handleAcceptSuggestion}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Yes
                    </motion.button>
                  </motion.div>}
              </AnimatePresence>

              {/* Category Selection */}
              <div className="px-4 mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Category</p>
                <div className="flex flex-wrap gap-1">
                  {activeCategories.map(category => <motion.button
                    key={category.id}
                    className={`flex items-center px-2 py-1.5 rounded-lg border transition-all duration-300 ${
                      selectedCategory === category.id
                        ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white shadow-glow border-transparent'
                        : `${category.color} border`
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      // Clear category error when user selects
                      if (errors.category) {
                        setErrors(prev => ({ ...prev, category: '' }));
                      }
                    }}
                  >
                      <span className="mr-1">{category.icon}</span>
                      <span className="text-xs font-medium">{category.name}</span>
                    </motion.button>)}
                </div>

                {/* Category Error */}
                {errors.category && (
                  <motion.div
                    className="mt-1"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="text-xs text-red-500 font-medium">{errors.category}</span>
                  </motion.div>
                )}
              </div>

              {/* Additional Details Toggle */}
              <div className="px-4 mb-2">
                <motion.button
                  className="flex items-center justify-between w-full py-2 text-primary-600 text-xs font-semibold"
                  onClick={() => setShowDetails(!showDetails)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>
                    {showDetails ? 'Hide' : 'Show'} details
                  </span>
                  <ChevronRightIcon className={`w-4 h-4 transition-transform duration-300 ${showDetails ? 'rotate-90' : ''}`} />
                </motion.button>
              </div>

              {/* Additional Details */}
              <AnimatePresence>
                {showDetails && <motion.div className="px-4 space-y-3" initial={{
              height: 0,
              opacity: 0
            }} animate={{
              height: 'auto',
              opacity: 1
            }} exit={{
              height: 0,
              opacity: 0
            }} transition={{
              duration: 0.3
            }}>
                    {/* Date Picker */}
                    <div>
                      {/* Budget selection */}
                      <label className="block text-xs text-gray-600 mb-1">Budget <span className="text-red-500">*</span></label>
                      <div className="flex items-center border border-gray-200 rounded-xl p-2 bg-gray-50/50 mb-3">
                        <select className="flex-1 outline-none text-xs bg-transparent" value={selectedBudgetId ?? ''} onChange={e => {
                          const v = e.target.value;
                          setSelectedBudgetId(v || null);
                          const chosen = budgets.find(b => String(b.id) === v);
                          if (chosen) {
                            setBudgetCategories(Object.keys(chosen.categories || {}));
                            setSelectedBudgetCategory(null);
                            // fetch mini budgets for this budget
                            (async () => {
                              try {
                                const res = await listMiniBudgets(chosen.id);
                                setMiniBudgets(res.items ?? []);
                              } catch (err) {
                                setMiniBudgets([]);
                              }
                            })();
                          } else {
                            setBudgetCategories([]);
                            setMiniBudgets([]);
                          }
                        }}>
                          <option value="">-- Select budget (required) --</option>
                          {budgets.map(b => <option key={b.id} value={b.id}>{b.name} — {new Date(b.startDate).toLocaleDateString()}</option>)}
                        </select>
                      </div>
                      {errors.budget && (
                        <motion.div className="mt-1" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                          <span className="text-xs text-red-500 font-medium">{errors.budget}</span>
                        </motion.div>
                      )}

                      <label className="block text-xs text-gray-600 mb-1">
                        Date & Time
                      </label>
                      <div className="flex items-center border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                        <CalendarIcon className="w-4 h-4 text-gray-500 mr-2" />
                        <input type="datetime-local" className="flex-1 outline-none text-xs bg-transparent" value={date.toISOString().slice(0, 16)} onChange={e => setDate(new Date(e.target.value))} />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Notes
                      </label>
                      <div className="flex items-start border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                        <FileTextIcon className="w-4 h-4 text-gray-500 mr-2 mt-1" />
                        <textarea
                          className="flex-1 outline-none text-xs resize-none h-12 bg-transparent"
                          placeholder="Add notes here..."
                          value={notes}
                          onChange={e => {
                            setNotes(e.target.value);
                            // Clear notes error when user types
                            if (errors.notes) {
                              setErrors(prev => ({ ...prev, notes: '' }));
                            }
                          }}
                        />
                      </div>

                      {/* Notes Error */}
                      {errors.notes && (
                        <motion.div
                          className="mt-1"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <span className="text-xs text-red-500 font-medium">{errors.notes}</span>
                        </motion.div>
                      )}
                    </div>

                    {/* Budget category selection */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Budget Category</label>
                      <div className="flex items-center border border-gray-200 rounded-xl p-2 bg-gray-50/50 mb-3">
                        <select className="flex-1 outline-none text-xs bg-transparent" value={selectedBudgetCategory ?? ''} onChange={e => {
                          const v = e.target.value || null;
                          setSelectedBudgetCategory(v);
                          // if essential category chosen, show mini budget input/dropdown
                        }}>
                          <option value="">-- Select category (optional) --</option>
                          {budgetCategories.length > 0 ? budgetCategories.map(c => <option key={c} value={c}>{c}</option>) : (
                            ['Essential', 'Savings', 'Free Spending', 'Investments', 'Miscellaneous'].map(c => <option key={c} value={c}>{c}</option>)
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Mini budget (conditional) */}
                    {selectedBudgetCategory && String(selectedBudgetCategory).toLowerCase().includes('essential') ? (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Mini Budget (optional)</label>
                        {miniBudgets.length > 0 ? (
                          <div className="flex items-center border border-gray-200 rounded-xl p-2 bg-gray-50/50 mb-3">
                            <select className="flex-1 outline-none text-xs bg-transparent" value={selectedMiniBudget ?? ''} onChange={e => setSelectedMiniBudget(e.target.value || null)}>
                              <option value="">-- Select mini budget --</option>
                              {miniBudgets.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center border border-gray-200 rounded-xl p-2 bg-gray-50/50 mb-3">
                            <input className="flex-1 outline-none text-xs bg-transparent" placeholder="Mini budget name (optional)" value={miniBudgetText} onChange={e => setMiniBudgetText(e.target.value)} />
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Receipt Upload */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Add Receipt
                      </label>
                      <motion.button
                        className="w-full flex items-center justify-center border border-dashed border-gray-300 rounded-xl p-2 hover:bg-gray-50 transition-colors"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <CameraIcon className="w-4 h-4 text-gray-500 mr-2" />
                        <span className="text-xs font-medium text-gray-600">
                          Take Photo
                        </span>
                      </motion.button>
                    </div>
                  </motion.div>}
              </AnimatePresence>

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-1 p-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, 'backspace'].map(num => <motion.button
                  key={num}
                  className={`h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
                    num === 'backspace'
                      ? 'text-gray-600 hover:bg-gray-100/80'
                      : 'text-gray-800 text-lg font-semibold bg-gray-100/80 hover:bg-gray-200/80 border border-gray-200'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleNumberInput(num.toString())}
                >
                    {num === 'backspace' ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 12H8m12 0l-4 4m4-4l-4-4" />
                      </svg> : num}
                  </motion.button>)}
              </div>

              {/* General Error Display */}
              {errors.general && (
                <motion.div
                  className="px-4 mb-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <span className="text-xs text-red-600 font-medium">{errors.general}</span>
                  </div>
                </motion.div>
              )}

              {/* Slide to Save */}
              <div className="px-4 pb-4">
                <div className={`relative h-12 bg-gray-100/80 rounded-2xl flex items-center px-4 border border-gray-200 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <div className="absolute left-0 top-0 bottom-0 rounded-2xl bg-gradient-to-r from-primary-500 to-secondary-500 shadow-glow transition-all duration-300" style={{
                width: `${slideProgress}%`
              }} />
                  <div className="absolute left-4 right-4 flex items-center justify-between z-10">
                    <span className={`text-xs font-semibold transition-colors duration-300 ${slideProgress > 50 ? 'text-white' : 'text-gray-700'}`}>
                      {isSubmitting ? 'Saving...' : 'Slide to save'}
                    </span>
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ChevronRightIcon className={`w-4 h-4 transition-colors duration-300 ${slideProgress > 50 ? 'text-white' : 'text-gray-600'}`} />
                    )}
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={slideProgress}
                    onChange={handleSlideChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>}
        </AnimatePresence>
      </motion.div>
    </motion.div>;
};