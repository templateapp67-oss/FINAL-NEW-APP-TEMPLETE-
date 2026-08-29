/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  MessageSquare,
  Phone,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { appointmentTotals } from './appointmentTotals';

/** A salon appointment row, shared with the overview and bookings tabs. */
export interface Appointment {
  id: string;
  time: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  price: number;
  depositPaid: number;
  status: 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';
}

export interface PaymentsPanelProps {
  appointments: Appointment[];
  setAppointments: Dispatch<SetStateAction<Appointment[]>>;
  /** Pushes a message into the owner notification tray. */
  onNotify: (message: string) => void;
}

/**
 * Screen 21 — Payments & Revenue.
 *
 * Extracted verbatim from the `activeTab === 'payments'` branch of
 * `src/screens/Landing.tsx` so the owner workspace no longer carries every
 * tab's markup in one module. The filter / search / selection state is local
 * to this tab and moved here with it; only `appointments` (shared with the
 * overview and bookings tabs) and the notification callback cross the
 * boundary.
 */
export default function PaymentsPanel({ appointments, setAppointments, onNotify }: PaymentsPanelProps) {
  const [paymentsFilter, setPaymentsFilter] = useState<'All' | 'Verified' | 'Pending' | 'Failed' | 'Refunded'>('All');
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('a1');

  const { totalBookingsValue, totalAdvanceCollected, totalRemainingAtSalon } =
    appointmentTotals(appointments);

  return (
    <>
              <motion.div 
                key="payments"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-[1440px] mx-auto w-full"
              >
                {/* 1. TOP HEADER */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="space-y-1">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Payments & Revenue</h1>
                    <p className="text-xs md:text-sm text-gray-500">Track booking payments and salon revenue.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-[#ac0053]/30 transition-colors">
                      <Calendar className="w-4 h-4" />
                      <span>01 Aug 2026 - 31 Aug 2026</span>
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                      <span className="material-symbols-outlined text-[18px] hidden">download</span>
                      <Download className="w-4 h-4" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* 3. BUSINESS RULE BANNER */}
                <div className="flex items-center gap-3 px-4 py-3 bg-[#ac0053]/[0.06] border border-[#ac0053]/20 rounded-xl">
                  <span className="w-8 h-8 rounded-full bg-[#ac0053]/10 flex items-center justify-center text-[#ac0053] shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </span>
                  <p className="text-xs font-semibold text-[#ac0053]">Online bookings collect {25}% advance. Remaining balance is due at the salon.</p>
                </div>

                {/* 2. SUMMARY CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between text-gray-500">
                      <span className="text-xs font-semibold uppercase tracking-wider">Total Booking Value</span>
                      <span className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
                        <DollarSign className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{totalBookingsValue.toLocaleString()}</div>
                    <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>+12% from last month</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between text-gray-500">
                      <span className="text-xs font-semibold uppercase tracking-wider">Advance Collected</span>
                      <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{totalAdvanceCollected.toLocaleString()}</div>
                    <div className="text-[11px] font-semibold text-gray-500 mt-1">Verified online payments</div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between text-gray-500">
                      <span className="text-xs font-semibold uppercase tracking-wider">Remaining at Salon</span>
                      <span className="w-8 h-8 rounded-xl bg-[#ffd9e1]/40 border border-[#ffd9e1] flex items-center justify-center text-[#ac0053]">
                        <Users className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{totalRemainingAtSalon.toLocaleString()}</div>
                    <div className="text-[11px] font-semibold text-gray-500 mt-1">Due from customers</div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between text-gray-500">
                      <span className="text-xs font-semibold uppercase tracking-wider">Verified Payments</span>
                      <span className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
                        <ClipboardList className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{appointments.filter(a=>a.depositPaid>0 && a.status!=='Cancelled').length}</div>
                    <div className="text-[11px] font-semibold text-gray-500 mt-1">Successful deposits this month</div>
                  </div>
                </div>

                {/* BENTO GRID MAIN AREA */}
                <div className="flex flex-col xl:flex-row gap-4">
                  {/* Left Column */}
                  <div className="flex-1 flex flex-col gap-4 min-w-0">
                    {/* 7. REVENUE BREAKDOWN */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                      <h2 className="text-sm font-bold text-gray-900 mb-6">Revenue Overview</h2>
                      <div className="space-y-4">
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Advance Collected ({25}%)</span>
                            <span className="text-xl font-black text-[#ac0053]">₹{totalAdvanceCollected.toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Due at Salon ({100 - (25)}%)</span>
                            <span className="text-xl font-black text-gray-900">₹{totalRemainingAtSalon.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="w-full h-4 rounded-full bg-gray-100 overflow-hidden flex">
                          <div className="h-full bg-[#ac0053] transition-all duration-700" style={{ width: `${totalBookingsValue ? Math.round((totalAdvanceCollected/totalBookingsValue)*100) : 25}%` }} />
                          <div className="h-full bg-gray-200 border-l border-white/20 transition-all duration-700" style={{ width: `${totalBookingsValue ? 100 - Math.round((totalAdvanceCollected/totalBookingsValue)*100) : 75}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* 5. PAYMENTS TABLE SECTION */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                      {/* 4. FILTERS & SEARCH */}
                      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                          {(['All','Verified','Pending','Failed','Refunded'] as const).map(f => (
                            <button
                              key={f}
                              onClick={()=>setPaymentsFilter(f)}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${paymentsFilter===f ? 'bg-[#ac0053] text-white border-[#ac0053] shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-[#ac0053]/30 hover:text-[#ac0053]' }`}
                            >{f}</button>
                          ))}
                        </div>
                        <div className="relative w-full md:w-auto">
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input value={paymentsSearch} onChange={e=>setPaymentsSearch(e.target.value)} className="w-full md:w-64 pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20 outline-none" placeholder="Search ID or Mobile..." type="text"/>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                          <thead className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-6 py-3">Date & ID</th>
                              <th className="px-6 py-3">Customer / Service</th>
                              <th className="px-6 py-3 text-right">Total</th>
                              <th className="px-6 py-3 text-right">Advance</th>
                              <th className="px-6 py-3 text-right">Remaining</th>
                              <th className="px-6 py-3 text-center">Payment</th>
                              <th className="px-6 py-3 text-center">Booking</th>
                              <th className="px-6 py-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-xs">
                            {appointments
                              .filter(a=>{
                                if(paymentsFilter==='Verified') return a.depositPaid>0 && a.status!=='Cancelled';
                                if(paymentsFilter==='Pending') return a.depositPaid===0 || a.status==='Pending';
                                if(paymentsFilter==='Failed') return false;
                                if(paymentsFilter==='Refunded') return a.status==='Cancelled';
                                return true;
                              })
                              .filter(a=>{
                                if(!paymentsSearch) return true;
                                const q=paymentsSearch.toLowerCase();
                                return a.id.toLowerCase().includes(q) || a.customerName.toLowerCase().includes(q) || a.phone.includes(q) || a.serviceName.toLowerCase().includes(q);
                              })
                              .map(appt=>{
                                const isSelected = selectedPaymentId===appt.id;
                                const isVerified = appt.depositPaid>0 && appt.status!=='Cancelled';
                                const isPending = appt.depositPaid===0 || appt.status==='Pending';
                                return (
                                  <tr key={appt.id} onClick={()=>setSelectedPaymentId(appt.id)} className={`hover:bg-[#ac0053]/[0.04] transition-colors cursor-pointer border-l-4 ${isSelected ? 'bg-[#ac0053]/[0.06] border-l-[#ac0053]' : 'border-l-transparent'}`}>
                                    <td className="px-6 py-4">
                                      <div className="text-xs font-bold text-gray-900">10 Aug 2026</div>
                                      <div className="text-[11px] text-gray-400 font-mono">#{appt.id.toUpperCase()}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="text-xs font-bold text-gray-900">{appt.customerName}</div>
                                      <div className="text-[11px] text-gray-500">{appt.serviceName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-900">₹{appt.price.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-[#ac0053]">₹{appt.depositPaid}</td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-500">₹{appt.price - appt.depositPaid}</td>
                                    <td className="px-6 py-4 text-center">
                                      {isVerified ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                                          <CheckCircle2 className="w-3 h-3" /> Verified
                                        </span>
                                      ) : isPending ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 text-[11px] font-bold border border-gray-200">
                                          <Clock className="w-3 h-3" /> Pending
                                        </span>
                                      ) : (
                                        <span className="inline-flex px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">Failed</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${appt.status==='Confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : appt.status==='Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{appt.status}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#ac0053] transition-colors">
                                        <Search className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>Showing {appointments.length} of {appointments.length} entries</span>
                        <div className="flex gap-1">
                          <button className="px-3 py-1 border border-gray-200 rounded-lg bg-white hover:border-[#ac0053] transition-colors">Prev</button>
                          <button className="px-3 py-1 border border-[#ac0053] bg-[#ac0053] text-white rounded-lg">1</button>
                          <button className="px-3 py-1 border border-gray-200 rounded-lg bg-white hover:border-[#ac0053] transition-colors">Next</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column SIDE DRAWER */}
                  <aside className="w-full xl:w-96 shrink-0">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden sticky top-4">
                      {(() => {
                        const appt = appointments.find(a=>a.id===selectedPaymentId) || appointments[0];
                        if(!appt) return null;
                        const remaining = appt.price - appt.depositPaid;
                        return (
                          <>
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                              <div>
                                <h3 className="text-sm font-black text-gray-900">Booking #{appt.id.toUpperCase()}</h3>
                                <p className="text-xs text-gray-500 mt-1">10 Aug 2026, {appt.time} - {appt.time}</p>
                              </div>
                              <button onClick={()=>setSelectedPaymentId(appointments[0]?.id || 'a1')} className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#ac0053] hover:border-[#ac0053] transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="p-6 space-y-6">
                              <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Customer Profile</span>
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-full bg-[#ffd9e1] border border-[#ac0053]/20 flex items-center justify-center text-[#ac0053] font-black text-sm">
                                    {appt.customerName.charAt(0)}
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="text-xs font-bold text-gray-900">{appt.customerName}</h4>
                                    <p className="text-xs text-gray-500">{appt.phone}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <a href={`https://wa.me/${appt.phone.replace(/\D/g,'')}`} target="_blank" className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors">
                                      <MessageSquare className="w-4 h-4" />
                                    </a>
                                    <a href={`tel:${appt.phone}`} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#ac0053] hover:bg-[#ffd9e1]/30 hover:border-[#ac0053]/20 transition-colors">
                                      <Phone className="w-4 h-4" />
                                    </a>
                                  </div>
                                </div>
                              </div>
                              <hr className="border-gray-100"/>
                              <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Service Booked</span>
                                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                                  <div>
                                    <span className="text-xs font-bold text-gray-900 block">{appt.serviceName}</span>
                                    <span className="text-[11px] text-gray-500">with {appt.staffName}</span>
                                  </div>
                                  <span className="text-xs font-black text-gray-900">₹{appt.price.toLocaleString()}</span>
                                </div>
                              </div>
                              <hr className="border-gray-100"/>
                              <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Payment Summary</span>
                                <div className="space-y-3 text-xs">
                                  <div className="flex justify-between text-gray-500">
                                    <span>Total Service Value</span>
                                    <span className="font-bold text-gray-900">₹{appt.price}</span>
                                  </div>
                                  <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-100 -mx-2">
                                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Advance Collected (Online)</span>
                                    <span>- ₹{appt.depositPaid}</span>
                                  </div>
                                  <div className="flex justify-between font-black text-gray-900 pt-2 border-t border-gray-100">
                                    <span>Balance Due</span>
                                    <span className="text-[#ac0053]">₹{remaining}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <span className="px-3 py-1 bg-gray-50 rounded-full text-[11px] font-bold text-gray-700 border border-gray-200">Booking: {appt.status}</span>
                                <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${appt.depositPaid>0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>Payment: {appt.depositPaid>0 ? 'Partial' : 'Pending'}</span>
                              </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                              <button onClick={()=>{
                                setAppointments(prev=>prev.map(p=>p.id===appt.id ? {...p, depositPaid: p.price, status:'Completed' as any} : p));
                                onNotify(`Balance collected for ${appt.customerName} ₹${remaining}`);
                              }} className="w-full bg-[#ac0053] hover:bg-[#ba005b] text-white py-3 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Mark Balance Collected (₹{remaining})
                              </button>
                              <p className="text-center text-[11px] font-semibold text-gray-400 mt-3">Confirming records an offline salon payment.</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </aside>
                </div>
              </motion.div>
    </>
  );
}
