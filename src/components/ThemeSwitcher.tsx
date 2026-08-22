import React from 'react';
import { ThemeId, THEME_IDS, THEME_LABELS } from '../lib/themeServices';
import { ChevronDown, Palette, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  currentTheme: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  variant?: 'minimal' | 'full';
}

export default function ThemeSwitcher({ currentTheme, onThemeChange, variant = 'full' }: Props) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (id: ThemeId) => {
    onThemeChange(id);
    setIsOpen(false);
  };

  const activeLabel = THEME_LABELS[currentTheme] || 'Select Theme';

  if (variant === 'minimal') {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-700 hover:border-[#ac0053] transition-colors"
        >
          <Palette className="w-3.5 h-3.5 text-[#ac0053]" />
          <span className="truncate max-w-[100px]">{activeLabel}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] overflow-hidden"
              >
                <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Change Website Theme</span>
                </div>
                <div className="p-1 max-h-[300px] overflow-y-auto">
                  {THEME_IDS.map((id) => (
                    <button
                      key={id}
                      onClick={() => handleSelect(id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                        currentTheme === id
                          ? 'bg-[#ffd9e1]/30 text-[#ac0053]'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <span>{THEME_LABELS[id]}</span>
                      {currentTheme === id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </motion.div>
              <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-xl transition-all group"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-lg bg-white shadow-xs group-hover:shadow-sm transition-all">
            <Palette className="w-4 h-4 text-[#ac0053]" />
          </div>
          <div className="text-left">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">Switch Theme</div>
            <div className="text-xs font-bold text-gray-900 leading-none">{activeLabel}</div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="absolute top-full left-0 md:right-0 md:left-auto mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl z-[100] overflow-hidden"
            >
              <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-2">Select Theme Style</span>
              </div>
              <div className="p-2 space-y-1 max-h-[350px] overflow-y-auto">
                {THEME_IDS.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleSelect(id)}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${
                      currentTheme === id
                        ? 'bg-[#ac0053] text-white shadow-md shadow-[#ac0053]/20'
                        : 'text-gray-700 hover:bg-[#ffd9e1]/20 hover:text-[#ac0053]'
                    }`}
                  >
                    <span className="text-xs font-bold">{THEME_LABELS[id]}</span>
                    {currentTheme === id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-gray-100 bg-gray-50/30 text-center">
                <p className="text-[10px] text-gray-400 font-medium">Changes apply instantly to preview</p>
              </div>
            </motion.div>
            <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
