/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Copy } from 'lucide-react';

export interface SharePanelProps {
  /** The salon's published public URL, without scheme. */
  liveUrl: string;
  copied: boolean;
  onCopyLink: () => void;
  /** Whether the owner notification tray is open (see note at the call site). */
  notificationsOpen: boolean;
  /** Pushes a message into the owner notification tray. */
  onNotify: (message: string) => void;
}

/**
 * Screen 22 — Share & Referral Marketing.
 *
 * Extracted verbatim from the `activeTab === 'share'` branch of
 * `src/screens/Landing.tsx`. `copied` / `onCopyLink` stay with Landing
 * because the overview tab shares the same copy-link control.
 */

export default function SharePanel({ liveUrl, copied, onCopyLink, notificationsOpen, onNotify }: SharePanelProps) {
  return (
    <>
              <motion.div 
                key="share"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-4xl mx-auto"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  
                  {/* Left QR Kit */}
                  <div className="md:col-span-5 bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs text-center flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">Visual Share Kit</h3>
                      <p className="text-xs text-gray-400 mb-6">Scan QR code to open your premium live website immediately</p>

                      <div className="bg-gray-50 p-4 rounded-2xl inline-block border border-gray-100">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://${liveUrl}`)}`}
                          alt="QR Code"
                          className="w-40 h-40 mx-auto"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      
                      <div className="text-xs font-mono select-all break-all border border-dashed border-gray-200 p-2.5 rounded-xl bg-gray-50 text-gray-400 mt-4">
                        {liveUrl}
                      </div>
                    </div>

                    <button 
                      onClick={onCopyLink}
                      className="w-full mt-6 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl transition-colors"
                    >
                      {copied ? 'Copied Link!' : 'Copy Link Address'}
                    </button>
                  </div>

                  {/* Right Promotion Kit */}
                  <div className="md:col-span-7 bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">Marketing templates</h3>
                      <p className="text-xs text-gray-400">Pre-written outreach campaigns for your digital launch</p>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-gray-400 uppercase">WhatsApp Message</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`Hey! Our salon has a shiny new website where you can view prices and book instantly! Check it out: https://${liveUrl}`);
                              // NOTE: the original gated this notification on the
                              // tray being open (`showNotifications && ...`). Kept
                              // verbatim so extraction changes no behaviour.
                              notificationsOpen && onNotify('Copied WhatsApp Template!');
                            }}
                            className="text-[11px] font-bold text-[#ac0053] hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed italic">
                          "Hey! Our salon has a shiny new website where you can view prices and book instantly! Check it out: https://{liveUrl}"
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-gray-400 uppercase">Email Invitation</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`Subject: We are Live! Book Your Next Session Online\n\nDear Client,\n\nWe are proud to introduce our new online portal! Save time by scheduling with your favorite stylist directly on our website:\nhttps://${liveUrl}`);
                            }}
                            className="text-[11px] font-bold text-[#ac0053] hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed italic font-mono text-[10px] bg-white p-2.5 rounded-lg border border-gray-100">
                          Subject: We are Live! Book Your Next Session Online<br /><br />
                          Dear Client,<br /><br />
                          We are proud to introduce our new online portal! Save time by scheduling with your favorite stylist directly on our website:<br />
                          https://{liveUrl}
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>

    </>
  );
}
