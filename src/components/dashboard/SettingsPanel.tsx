/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import type { Dispatch, SetStateAction } from 'react';
import type { SalonData } from '../../types';
import HomeServiceSettingsCard from '../HomeServiceSettingsCard';

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

export default function SettingsPanel({ data, setData, onNotify }: SettingsPanelProps) {
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
                        value={data.bookingRules?.minNotice || '1 hour'}
                        onChange={(e) => {
                          setData(prev => ({
                            ...prev,
                            bookingRules: { ...prev.bookingRules!, minNotice: e.target.value }
                          }));
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
                        value={data.bookingRules?.allowStaffSelection ? 'yes' : 'no'}
                        onChange={(e) => {
                          setData(prev => ({
                            ...prev,
                            bookingRules: { ...prev.bookingRules!, allowStaffSelection: e.target.value === 'yes' }
                          }));
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

                  <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                    <button 
                      onClick={() => {
                        onNotify('Saved Salon Rules!');
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
