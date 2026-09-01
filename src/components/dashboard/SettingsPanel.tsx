/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { motion } from 'motion/react';
import type { Dispatch, SetStateAction } from 'react';
import type { BookingRules, SalonData } from '../../types';
import { initialData } from '../../types';
import HomeServiceSettingsCard from '../HomeServiceSettingsCard';
import { useAutoSaveStore } from '../../hooks/useAutoSaveStore';

export interface SettingsPanelProps {
  data: SalonData;
  setData: Dispatch<SetStateAction<SalonData>>;
  /** Pushes a message into the owner notification tray. */
  onNotify: (message: string) => void;
}

/**
 * Screen 23 — Salon Settings (booking rules, address).
 *
 * Extracted verbatim from the `activeTab === 'settings'` branch of
 * `src/screens/Landing.tsx`.
 */

/** The slice of `bookingRules` this panel owns in the settings store. */
type SalonRulesStore = {
  minNotice: string;
  allowStaffSelection: boolean;
};

/** Product defaults, used only when this salon has no booking rules yet. */
const BASE_RULES: BookingRules = initialData.bookingRules;

export default function SettingsPanel({ data, setData, onNotify }: SettingsPanelProps) {
  /**
   * CENTRAL STATE + DEBOUNCED AUTO-SAVE (600 ms) — see
   * `src/hooks/useAutoSaveStore.ts`. Booking rules are tenant settings, so
   * they live in the canonical `salon_public_websites.config` jsonb under the
   * `bookingRules` key and are merged (never replaced) with the rest of the
   * website draft.
   */
  const rules = useAutoSaveStore<SalonRulesStore>(
    {
      minNotice: data.bookingRules?.minNotice || BASE_RULES.minNotice,
      allowStaffSelection: data.bookingRules?.allowStaffSelection ?? BASE_RULES.allowStaffSelection,
    },
    { configKey: 'bookingRules' },
  );

  // Keep the CENTRAL edit state (and therefore the live preview, which is bound
  // to it by props) in sync the instant a field changes — the database write is
  // debounced, the UI is not.
  const applyToCentralState = (patch: Partial<SalonRulesStore>) => {
    setData((previous) => ({
      ...previous,
      bookingRules: { ...(previous.bookingRules ?? BASE_RULES), ...patch } as BookingRules,
    }));
  };

  // Hydration: when the draft loads (or another screen edits the same rules),
  // adopt the external values WITHOUT triggering a save.
  useEffect(() => {
    rules.hydrate({
      minNotice: data.bookingRules?.minNotice || BASE_RULES.minNotice,
      allowStaffSelection: data.bookingRules?.allowStaffSelection ?? BASE_RULES.allowStaffSelection,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.bookingRules?.minNotice, data.bookingRules?.allowStaffSelection]);

  const autosaveLabel =
    rules.status === 'saving'
      ? 'Saving…'
      : rules.status === 'saved'
        ? 'Saved ✓'
        : rules.status === 'error'
          ? 'Save failed'
          : 'Autosave on';

  return (
    <>
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-4xl mx-auto"
              >
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm mb-1">Salon Booking Rules</h3>
                    <p className="text-xs text-gray-400">These parameters control what clients can request on your website</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Minimum Notice Period</label>
                      <input 
                        type="text" 
                        value={rules.data.minNotice}
                        onChange={(e) => {
                          rules.updateField('minNotice', e.target.value);
                          applyToCentralState({ minNotice: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold"
                      />
                    </div>
                    <div className="rounded-xl border border-[#ac0053]/15 bg-[#ffd9e1]/20 px-4 py-3">
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Advance Deposit</label>
                      <p className="text-xs font-semibold text-[#ac0053]">25% fixed company policy</p>
                      <p className="mt-1 text-[11px] text-gray-500">Customers pay 25% online; the remaining 75% is paid at the salon.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Allow Staff Selection</label>
                      <select
                        value={rules.data.allowStaffSelection ? 'yes' : 'no'}
                        onChange={(e) => {
                          const next = e.target.value === 'yes';
                          rules.updateField('allowStaffSelection', next);
                          applyToCentralState({ allowStaffSelection: next });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold"
                      >
                        <option value="yes">Yes - let clients choose provider</option>
                        <option value="no">No - assign randomly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Landmark Address Info</label>
                      <input 
                        type="text" 
                        value={data.address?.landmark || ''}
                        onChange={(e) => {
                          setData(prev => ({
                            ...prev,
                            address: { ...prev.address!, landmark: e.target.value }
                          }));
                        }}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    {/* AUTO-SAVE STATUS — the settings are written automatically
                        (debounced 600 ms); this only reports it. */}
                    <span
                      className={`mr-auto text-[11px] font-semibold ${
                        rules.status === 'saved'
                          ? 'text-emerald-600'
                          : rules.status === 'saving'
                            ? 'text-[#ac0053]'
                            : rules.status === 'error'
                              ? 'text-red-600'
                              : 'text-gray-400'
                      }`}
                      aria-live="polite"
                    >
                      {autosaveLabel}
                    </span>
                    <button 
                      onClick={async () => {
                        const saved = await rules.saveNow();
                        onNotify(saved ? 'Saved Salon Rules!' : 'Could not save salon rules. Please retry.');
                      }}
                      className="px-6 py-2 rounded-xl bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>

                {/* HOME SERVICE — enable/charge/radius (same shared card as onboarding) */}
                <HomeServiceSettingsCard
                  data={data}
                  setData={setData}
                  onSaved={(message) => onNotify(message)}
                />
              </motion.div>

    </>
  );
}
