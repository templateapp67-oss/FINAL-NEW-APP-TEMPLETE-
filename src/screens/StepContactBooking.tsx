import React, { useState } from 'react';
import { SalonData, EnabledContactOptions, BookingRules, SalonOpeningHours, DaySchedule } from '../types';
import PreviewPane from '../components/PreviewPane';
import { 
  Phone, 
  MessageCircle, 
  CalendarCheck, 
  Clock, 
  ArrowRight, 
  ArrowLeft, 
  Eye, 
  Edit3, 
  Check, 
  CreditCard, 
  CheckCircle2, 
  Copy, 
  Calendar, 
  Sliders, 
  UserCheck 
} from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (msg?: string) => void;
}

const DEFAULT_CONTACT_OPTIONS: EnabledContactOptions = {
  callNow: true,
  whatsapp: true,
  bookNow: true,
};

const DEFAULT_BOOKING_RULES: BookingRules = {
  minNotice: '1 hour',
  maxAdvance: '30 days',
  bufferTime: 'No buffer',
  allowStaffSelection: true,
  advanceDepositPercentage: 25,
};

const DEFAULT_HOURS: SalonOpeningHours = {
  monday: { open: true, startTime: '10:00', endTime: '20:00' },
  tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
  wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
  thursday: { open: true, startTime: '10:00', endTime: '20:00' },
  friday: { open: true, startTime: '10:00', endTime: '20:00' },
  saturday: { open: true, startTime: '10:00', endTime: '20:00' },
  sunday: { open: false, startTime: '10:00', endTime: '20:00' }
};

export default function StepContactBooking({ data, setData, onNext, onPrev, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingWhatsapp, setEditingWhatsapp] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const phone = data.phone || '+91 98765 43210';
  const whatsappPhone = data.whatsappPhone || data.phone || '+91 98765 43210';
  const contactOptions = data.contactOptions || DEFAULT_CONTACT_OPTIONS;
  const bookingRules = { ...DEFAULT_BOOKING_RULES, ...(data.bookingRules || {}), advanceDepositPercentage: 25 };
  const hours = data.openingHours || DEFAULT_HOURS;

  const updatePhone = (val: string) => {
    setData(prev => ({ ...prev, phone: val }));
    if (onSave) onSave('Phone updated');
  };

  const updateWhatsapp = (val: string) => {
    setData(prev => ({ ...prev, whatsappPhone: val }));
    if (onSave) onSave('WhatsApp updated');
  };

  const toggleOption = (key: keyof EnabledContactOptions) => {
    const updated = {
      ...contactOptions,
      [key]: !contactOptions[key]
    };
    setData(prev => ({ ...prev, contactOptions: updated }));
    if (onSave) onSave('Contact options updated');
  };

  const updateBookingRule = <K extends keyof BookingRules>(key: K, value: BookingRules[K]) => {
    const updated = {
      ...bookingRules,
      [key]: value
    };
    setData(prev => ({ ...prev, bookingRules: updated }));
    if (onSave) onSave('Booking rules updated');
  };

  const updateDayHours = (day: keyof SalonOpeningHours, fields: Partial<DaySchedule>) => {
    const updated = {
      ...hours,
      [day]: { ...hours[day], ...fields }
    };
    setData(prev => ({ ...prev, openingHours: updated }));
    if (onSave) onSave('Schedule updated');
  };

  const copyMondayToAll = () => {
    const mon = hours.monday;
    const updated: SalonOpeningHours = {
      monday: { ...mon },
      tuesday: { ...mon },
      wednesday: { ...mon },
      thursday: { ...mon },
      friday: { ...mon },
      saturday: { ...mon },
      sunday: { ...hours.sunday }
    };
    setData(prev => ({ ...prev, openingHours: updated }));
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
    if (onSave) onSave('Copied Monday schedule to all days');
  };

  const daysList: { key: keyof SalonOpeningHours; label: string }[] = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#f9f9f9]">
      {/* Mobile view tab switcher */}
      <div className="md:hidden flex border-b border-gray-200 bg-white sticky top-0 z-20">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${
            activeTab === 'edit'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          Edit Contact & Booking
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'preview'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Live Preview
        </button>
      </div>

      {/* LEFT COLUMN: Form Area (55%) */}
      <div className={`w-full md:w-[55%] h-full overflow-y-auto px-4 md:px-10 py-8 flex flex-col space-y-8 ${
        activeTab === 'preview' ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Header Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053]">
            <CalendarCheck className="w-4 h-4" /> STEP 08 • CONTACT & BOOKING BASICS
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c]">How can customers contact and book you?</h1>
          <p className="text-sm text-[#5f5e5e]">Confirm your contact details and set when customers can book.</p>
        </div>

        {/* Contact Details Card */}
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
            <Phone className="w-5 h-5 text-[#ac0053]" /> Contact Details
          </h2>

          {/* Phone Field */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-gray-50/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#ac0053]/10 text-[#ac0053] flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-900">Phone</p>
                {editingPhone ? (
                  <input
                    type="text"
                    value={phone}
                    onChange={e => updatePhone(e.target.value)}
                    className="mt-1 px-2.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#ac0053]"
                  />
                ) : (
                  <p className="text-xs text-gray-600 font-medium">{phone}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditingPhone(!editingPhone)}
              className="text-xs font-semibold text-[#ac0053] hover:underline flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[#ffd9e1]/30 transition-colors"
            >
              {editingPhone ? <Check className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{editingPhone ? 'Done' : 'Edit'}</span>
            </button>
          </div>

          {/* WhatsApp Field */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-gray-50/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#25D366]/10 text-[#25D366] flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-900">WhatsApp</p>
                {editingWhatsapp ? (
                  <input
                    type="text"
                    value={whatsappPhone}
                    onChange={e => updateWhatsapp(e.target.value)}
                    className="mt-1 px-2.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#25D366]"
                  />
                ) : (
                  <p className="text-xs text-gray-600 font-medium">{whatsappPhone}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditingWhatsapp(!editingWhatsapp)}
              className="text-xs font-semibold text-[#ac0053] hover:underline flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[#ffd9e1]/30 transition-colors"
            >
              {editingWhatsapp ? <Check className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{editingWhatsapp ? 'Done' : 'Edit'}</span>
            </button>
          </div>
        </div>

        {/* Enabled Contact Options */}
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#ac0053]" /> Enabled Contact Options
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-[#ac0053] cursor-pointer transition-all bg-gray-50/50 hover:bg-white">
              <input
                type="checkbox"
                checked={contactOptions.callNow}
                onChange={() => toggleOption('callNow')}
                className="w-4 h-4 accent-[#ac0053] rounded"
              />
              <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#ac0053]" /> Call Now
              </span>
            </label>

            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-[#25D366] cursor-pointer transition-all bg-gray-50/50 hover:bg-white">
              <input
                type="checkbox"
                checked={contactOptions.whatsapp}
                onChange={() => toggleOption('whatsapp')}
                className="w-4 h-4 accent-[#25D366] rounded"
              />
              <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> WhatsApp
              </span>
            </label>

            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-[#ac0053] cursor-pointer transition-all bg-gray-50/50 hover:bg-white">
              <input
                type="checkbox"
                checked={contactOptions.bookNow}
                onChange={() => toggleOption('bookNow')}
                className="w-4 h-4 accent-[#ac0053] rounded"
              />
              <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5 text-[#ac0053]" /> Book Now
              </span>
            </label>
          </div>
        </div>

        {/* Weekly Availability */}
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#ac0053]" /> Weekly Availability
            </h2>
            <button
              onClick={copyMondayToAll}
              className="text-xs font-semibold text-[#ac0053] hover:underline flex items-center gap-1"
            >
              {copiedSuccess ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSuccess ? 'Copied!' : 'Copy Monday to all'}</span>
            </button>
          </div>

          <div className="space-y-2">
            {daysList.map(({ key, label }) => {
              const dayObj = hours[key] || { open: true, startTime: '10:00', endTime: '20:00' };

              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                    dayObj.open ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'bg-gray-100/40 opacity-70'
                  }`}
                >
                  <span className="text-xs font-bold text-[#1a1c1c] w-24">{label}</span>
                  
                  <div className="flex-1 flex items-center justify-center">
                    {dayObj.open ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={dayObj.startTime}
                          onChange={e => updateDayHours(key, { startTime: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-[#1a1c1c] outline-none focus:border-[#ac0053]"
                        />
                        <span className="text-gray-400 text-xs">-</span>
                        <input
                          type="time"
                          value={dayObj.endTime}
                          onChange={e => updateDayHours(key, { endTime: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-[#1a1c1c] outline-none focus:border-[#ac0053]"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-[#ac0053]">Closed</span>
                    )}
                  </div>

                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => updateDayHours(key, { open: !dayObj.open })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      dayObj.open ? 'bg-[#ac0053]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        dayObj.open ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Booking Rules */}
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#ac0053]" /> Booking Rules
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Minimum notice</label>
              <select
                value={bookingRules.minNotice}
                onChange={e => updateBookingRule('minNotice', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-gray-800 outline-none focus:border-[#ac0053]"
              >
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
                <option value="4 hours">4 hours</option>
                <option value="24 hours">24 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Maximum advance</label>
              <select
                value={bookingRules.maxAdvance}
                onChange={e => updateBookingRule('maxAdvance', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-gray-800 outline-none focus:border-[#ac0053]"
              >
                <option value="30 days">30 days</option>
                <option value="60 days">60 days</option>
                <option value="90 days">90 days</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Buffer between bookings</label>
              <select
                value={bookingRules.bufferTime}
                onChange={e => updateBookingRule('bufferTime', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-gray-800 outline-none focus:border-[#ac0053]"
              >
                <option value="No buffer">No buffer</option>
                <option value="15 mins">15 mins</option>
                <option value="30 mins">30 mins</option>
              </select>
            </div>

            <div className="md:col-span-2 rounded-xl border border-[#ac0053]/15 bg-[#ffd9e1]/20 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Online Advance Deposit</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">Company policy: fixed 25% advance on every online booking.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#ac0053] px-2.5 py-1 text-[11px] font-bold text-white">25% fixed</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#ac0053]" /> Customers can choose a staff member
            </span>
            <button
              type="button"
              onClick={() => updateBookingRule('allowStaffSelection', !bookingRules.allowStaffSelection)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                bookingRules.allowStaffSelection ? 'bg-[#ac0053]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  bookingRules.allowStaffSelection ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Advance Info Card */}
        <div className="bg-[#ffd9e1]/20 border border-[#ac0053]/20 rounded-2xl p-6 flex flex-col gap-3 mb-24">
          <div className="flex items-center gap-2 text-[#ac0053]">
            <CreditCard className="w-5 h-5" />
            <h3 className="text-lg font-bold">{(bookingRules.advanceDepositPercentage ?? 25)}% Advance Booking Deposit</h3>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">
            Customers will pay a {(bookingRules.advanceDepositPercentage ?? 25)}% deposit online to confirm their booking slot.
          </p>
          <div className="bg-white p-4 rounded-xl border border-[#ac0053]/15 shadow-2xs font-sans text-xs space-y-2">
            <div className="flex justify-between text-gray-500">
              <span>Service Total:</span>
              <span className="font-semibold text-gray-800">₹1,200</span>
            </div>
            <div className="flex justify-between text-[#ac0053] font-bold">
              <span>Advance ({(bookingRules.advanceDepositPercentage ?? 25)}%):</span>
              <span>-₹{Math.round((1200 * (bookingRules.advanceDepositPercentage ?? 25)) / 100).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2">
              <span>Pay at Salon:</span>
              <span className="text-[#ac0053]">₹{(1200 - Math.round((1200 * (bookingRules.advanceDepositPercentage ?? 25)) / 100)).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Live Preview Pane (45%) */}
      <div className={`w-full md:w-[45%] h-full bg-gray-100 border-l border-gray-200 ${
        activeTab === 'edit' ? 'hidden md:block' : 'block'
      }`}>
        <PreviewPane data={data} step={8} />
      </div>

      {/* Sticky Bottom Navigation Footer */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-between items-center px-6 py-4 bg-white z-50 border-t border-gray-200 shadow-md">
        <button
          onClick={onPrev}
          className="border border-gray-300 text-gray-700 rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="hidden sm:block text-xs font-medium text-gray-400">
          Step 8 of 14 • Contact & Booking Details
        </div>

        <button
          onClick={onNext}
          className="bg-[#ac0053] text-white rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-[#ba005b] transition-colors flex items-center gap-2 shadow-xs"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
