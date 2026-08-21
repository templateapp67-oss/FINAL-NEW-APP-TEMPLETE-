import React, { useEffect, useState } from 'react';
import { serviceDisplayPrice } from '../lib/pricing';
import { SalonData, Service, TeamMember, getPublicStaffData } from '../types';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { normalizeThemeId } from '../lib/themeServices';
import SiteSalonStatus from './SiteSalonStatus';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Clock, 
  CreditCard, 
  ChevronRight, 
  ArrowLeft, 
  ArrowRight, 
  Info, 
  Calendar, 
  User, 
  Check, 
  X,
  MapPin,
  CalendarCheck,
  ShieldCheck,
  Lock,
  Smartphone,
  HelpCircle,
  QrCode,
  Phone,
  MessageSquare
} from 'lucide-react';

interface Props {
  data: SalonData;
  onBackToWebsite: () => void;
  onShowToast?: (msg: string) => void;
  onAdvancePaymentSuccess?: () => void;
}

const DEFAULT_SERVICE: Service = {
  id: 'default-hair-spa',
  name: 'Hair Spa',
  category: 'Treatment',
  description: 'Deep conditioning treatment for healthy, shiny hair. Includes massage and steam.',
  price: 1200,
  duration: 60
};

const DEFAULT_STAFF: TeamMember = {
  id: 'default-priya',
  name: 'Priya Sharma',
  role: 'Senior Stylist',
  specialties: ['Hair Spa', 'Balayage', 'Hair Styling'],
  imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBp90Wu8qjifU1WhX13-Rx6YjdrWbUaEWKfibiaI_crD4l211gbIFDQIXpA-YqiEoRAc5Xduj2tL60Jed-BPbzsRgzTorAqFAqKXZAjpWL86pm0fVwdjmpD8YF-K6M-HSEz9q11C89e9ulZ3NkcqB-wqS6L9QNY2TcxdPwGW4qUAkn1jkaHm5Suqecr1mMPR9w7aXomyije5Ki7jUD5XS_JEgfSgB2ZMngALXI2xReJGqPET6r7AgRa'
};

const TIME_SLOTS = [
  { time: '10:00 AM', disabled: false },
  { time: '11:00 AM', disabled: false },
  { time: '12:00 PM', disabled: false },
  { time: '01:00 PM', disabled: true },
  { time: '02:30 PM', disabled: false },
  { time: '03:30 PM', disabled: false },
  { time: '04:30 PM', disabled: true },
  { time: '05:30 PM', disabled: false },
];

// High quality category images to make the checkout look stunning
const CATEGORY_IMAGES: Record<string, string> = {
  hair: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkPnlD4aT96CIGMui_X8EfGWavw_YOcegVxj6Kgbq14SPVUmjmJqk0me15J8XqmrXEPiX1tWcGARQze4napjK6GzVJB025yEI-RE1G7WuuGo94UxwUE354GYIIfMqpkr0czcUwaB89xTDTu7PzCcptvlEVrdhROhQYxOoIvLlhyAfrTnz8o0-lKN005CRHcYdaglked13w7RpmLUE357ePbMVcXvsy_h-ItQ7YpYVikmRMOJ85c_VY',
  spa: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkPnlD4aT96CIGMui_X8EfGWavw_YOcegVxj6Kgbq14SPVUmjmJqk0me15J8XqmrXEPiX1tWcGARQze4napjK6GzVJB025yEI-RE1G7WuuGo94UxwUE354GYIIfMqpkr0czcUwaB89xTDTu7PzCcptvlEVrdhROhQYxOoIvLlhyAfrTnz8o0-lKN005CRHcYdaglked13w7RpmLUE357ePbMVcXvsy_h-ItQ7YpYVikmRMOJ85c_VY',
  facial: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  makeup: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
};

export default function CustomerBookingPreview({ data, onBackToWebsite, onShowToast, onAdvancePaymentSuccess }: Props) {
  // Available services list (from data or default)
  const services = data.services && data.services.length > 0 ? data.services : [DEFAULT_SERVICE];
  const team = data.team && data.team.length > 0 ? data.team : [DEFAULT_STAFF];

  // Active view: 'book', 'payment' or 'confirmed'
  const [activeView, setActiveView] = useState<'book' | 'payment' | 'confirmed'>('book');

  // Booking form states
  const [selectedService, setSelectedService] = useState<Service>(services[0]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  
  // Customer details states
  const [customerName, setCustomerName] = useState('Neha Verma');
  const [customerPhone, setCustomerPhone] = useState('+91 98765 43210');
  const [customerEmail, setCustomerEmail] = useState('neha.verma@gmail.com');
  
  // Dates state
  const generatedDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  
  const [selectedDate, setSelectedDate] = useState<Date>(generatedDates[0]);
  const [selectedTime, setSelectedTime] = useState<string>('11:00 AM');
  
  // Stylist state (null means "Anyone Available")
  const [selectedStylist, setSelectedStylist] = useState<TeamMember | null>(team[0]);

  // Payment method states
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi'>('card');
  const [cardNo, setCardNo] = useState('**** **** **** 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('123');
  const [upiId, setUpiId] = useState('nexora@paytm');
  const [paymentState, setPaymentState] = useState<'idle' | 'verifying' | 'success'>('idle');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const depositPercentage = 25;
  const selectedPricing = serviceDisplayPrice(selectedService, data.offers, selectedVariantId);
  const selectedPrice = selectedPricing.finalPrice;
  const selectedDuration = selectedService.pricingVariants?.find((variant) => variant.id === selectedVariantId)?.duration
    ?? selectedService.duration;
  const depositAmount = Math.round((selectedPrice * depositPercentage) / 100);
  const remainingAmount = selectedPrice - depositAmount;

  useEffect(() => {
    setSelectedVariantId(null);
  }, [selectedService.id]);

  const formatDateLabel = (d: Date) => {
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handlePayNow = () => {
    if (paymentState !== 'idle') return;
    setPaymentState('verifying');
    
    setTimeout(() => {
      setPaymentState('success');
      onAdvancePaymentSuccess?.();
      setTimeout(() => {
        setActiveView('confirmed');
        if (onShowToast) {
          onShowToast(`Booking confirmed for ${selectedService.name}!`);
        }
      }, 800);
    }, 2500);
  };

  const resetAll = () => {
    setActiveView('book');
    setPaymentState('idle');
    setShowSuccessModal(false);
  };

  // Get matching category image
  const getServiceImage = () => {
    const cat = (selectedService.category || '').toLowerCase();
    if (cat.includes('hair')) return CATEGORY_IMAGES.hair;
    if (cat.includes('facial') || cat.includes('skin')) return CATEGORY_IMAGES.facial;
    if (cat.includes('makeup')) return CATEGORY_IMAGES.makeup;
    return CATEGORY_IMAGES.spa;
  };

  if (activeView === 'confirmed') {
    return (
      <div className="flex-grow bg-[#F9F8F6] min-h-full w-full flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto select-none text-slate-800">
        <motion.main 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-[600px] bg-white rounded-2xl shadow-xl border border-gray-150 overflow-hidden my-auto"
        >
          {/* Header Section */}
          <div className="px-6 py-8 md:px-10 md:py-12 flex flex-col items-center text-center border-b border-gray-150 bg-slate-50/50">
            {/* Brand Logo Placeholder */}
            <div className="mb-6">
              <span className="font-extrabold text-2xl text-[#ac0053] tracking-tight" style={getSalonNameStyle(data)}>
                {data.salonName || 'Nexora Lumina'}
              </span>
            </div>
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 border border-emerald-100 shadow-xs">
              <CalendarCheck className="w-9 h-9" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight mb-2">Booking Confirmed!</h1>
            <p className="text-xs text-gray-500 font-semibold mb-4">Your appointment is fully confirmed.</p>
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-gray-100 border border-gray-200 font-bold text-[10px] text-gray-500 uppercase tracking-wider">
              Booking ID: NX-10482
            </div>
          </div>

          {/* Details Section */}
          <div className="p-6 md:p-8 space-y-6">
            {/* Summary Card */}
            <div>
              <h2 className="font-extrabold text-[10px] text-gray-400 uppercase tracking-widest mb-3">Appointment Details</h2>
              <div className="bg-white border border-gray-150 rounded-xl p-4 shadow-sm">
                <ul className="space-y-3.5 text-xs font-semibold text-gray-700">
                  <li className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                    <span className="text-gray-400 flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-[#ac0053]" /> Service
                    </span>
                    <span className="font-bold text-gray-900">{selectedService.name}</span>
                  </li>
                  <li className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                    <span className="text-gray-400 flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider">
                      <Calendar className="w-3.5 h-3.5 text-[#ac0053]" /> Date
                    </span>
                    <span className="font-bold text-gray-900">{formatDateLabel(selectedDate)}</span>
                  </li>
                  <li className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                    <span className="text-gray-400 flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider">
                      <Clock className="w-3.5 h-3.5 text-[#ac0053]" /> Time
                    </span>
                    <span className="font-bold text-gray-900">{selectedTime}</span>
                  </li>
                  <li className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                    <span className="text-gray-400 flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider">
                      <User className="w-3.5 h-3.5 text-[#ac0053]" /> Staff
                    </span>
                    <span className="font-bold text-gray-900">
                      {selectedStylist ? selectedStylist.name : 'Anyone Available'}
                    </span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider">
                      <User className="w-3.5 h-3.5 text-[#ac0053]" /> Customer
                    </span>
                    <span className="font-bold text-gray-900">{customerName}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Payment Summary */}
            <div>
              <h2 className="font-extrabold text-[10px] text-gray-400 uppercase tracking-widest mb-3">Payment Summary</h2>
              <div className="bg-white border border-gray-150 rounded-xl p-4 shadow-sm">
                <ul className="space-y-3 text-xs font-semibold text-gray-700 mb-4">
                  <li className="flex justify-between items-center">
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Service Price</span>
                    <span className="font-bold text-gray-900">₹{selectedPrice.toLocaleString('en-IN')}</span>
                  </li>
                  <li className="flex justify-between items-center text-emerald-700 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                      <Check className="w-3.5 h-3.5" /> Advance Paid ({depositPercentage}%)
                    </span>
                    <span className="font-bold">₹{depositAmount.toLocaleString('en-IN')}</span>
                  </li>
                  <li className="flex justify-between items-center pt-3 border-t border-gray-100 font-bold">
                    <span className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Pay at Salon</span>
                    <span className="text-[#ac0053] text-sm">₹{remainingAmount.toLocaleString('en-IN')}</span>
                  </li>
                </ul>
                <div className="bg-gray-50 p-3 rounded-lg flex items-start gap-2 border border-gray-100">
                  <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                    ₹{depositAmount.toLocaleString('en-IN')} advance paid successfully via {paymentMethod === 'card' ? 'Card' : 'UPI'}. ₹{remainingAmount.toLocaleString('en-IN')} to be paid at the salon post treatment.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3.5 pt-2">
              <button 
                type="button"
                onClick={resetAll}
                className="w-full bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3.5 px-4 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer"
              >
                Done
              </button>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  onClick={() => {
                    if (onShowToast) onShowToast('Appointment added to your calendar successfully!');
                  }}
                  className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-[11px] py-2.5 px-4 rounded-xl transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Add to Calendar
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    if (onShowToast) onShowToast('Opening Salon Location in Google Maps...');
                  }}
                  className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-[11px] py-2.5 px-4 rounded-xl transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <MapPin className="w-4 h-4 text-gray-400" />
                  Get Directions
                </button>
              </div>
              <div className="flex justify-center gap-6 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => {
                    if (onShowToast) onShowToast(`Calling Salon Hotline: ${data.phone || '+91 98765 43210'}`);
                  }}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-[#ac0053] transition-colors group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-50 group-hover:bg-[#ffd9e1]/30 flex items-center justify-center border border-gray-200 group-hover:border-[#ac0053]/30 transition-all">
                    <Phone className="w-4 h-4 text-gray-400 group-hover:text-[#ac0053]" />
                  </div>
                  <span className="font-bold text-[9px] uppercase tracking-wider">Call</span>
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    if (onShowToast) onShowToast(`Opening WhatsApp chat with Salon Support...`);
                  }}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-[#ac0053] transition-colors group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-50 group-hover:bg-[#ffd9e1]/30 flex items-center justify-center border border-gray-200 group-hover:border-[#ac0053]/30 transition-all">
                    <MessageSquare className="w-4 h-4 text-gray-400 group-hover:text-[#ac0053]" />
                  </div>
                  <span className="font-bold text-[9px] uppercase tracking-wider">WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </motion.main>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-[#f9f9f9] min-h-full flex flex-col font-sans relative select-none text-slate-800 pb-20 overflow-y-auto">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 left-0 w-full z-30 flex justify-between items-center px-4 md:px-6 h-16 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0">
        <div className="flex items-center gap-2">
          {activeView === 'payment' && (
            <button 
              onClick={() => setActiveView('book')}
              className="p-1.5 rounded-full hover:bg-gray-50 text-gray-500 transition-colors mr-1 cursor-pointer"
              title="Back to Booking Options"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="font-bold text-[#ac0053] text-lg tracking-tight" style={getSalonNameStyle(data)}>
            {data.salonName || 'Nexora Salon'}
          </span>
          <SiteSalonStatus
            themeId={normalizeThemeId(data.templateId)}
            data={data}
            placement="booking"
            compact
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100 uppercase tracking-wider">
            Step 9 of 15
          </span>
          <button 
            onClick={onBackToWebsite}
            className="text-[#ac0053] hover:text-[#ba005b] font-bold text-xs flex items-center gap-1 bg-[#ffd9e1]/20 hover:bg-[#ffd9e1]/40 px-3 py-1.5 rounded-xl border border-[#ffd9e1]/40 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Website
          </button>
        </div>
      </header>

      {/* Main Body Switcher */}
      <AnimatePresence mode="wait">
        {activeView === 'book' ? (
          /* ==============================================
             STAGE 1: SERVICE SCHEDULING SCREEN 
             ============================================== */
          <motion.div 
            key="book-view"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex-grow max-w-5xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Booking Form Left Side (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Progress Indicator */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <span className="text-[#ac0053] flex items-center gap-1 font-extrabold">Service</span>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <span className="text-[#ac0053] flex items-center gap-1 font-extrabold">Date &amp; Time</span>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <span>Details</span>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <span>Review</span>
              </div>

              {/* Step 1: Selected Service Card */}
              <section className="bg-white rounded-2xl p-5 border border-gray-150 shadow-xs relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="font-extrabold text-sm text-gray-900 tracking-tight">Selected Treatment</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-semibold">Change or search for another service from catalog</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                    className="text-xs font-bold text-[#ac0053] hover:text-[#ba005b] hover:underline"
                  >
                    {showServiceDropdown ? 'Cancel Change' : 'Change Service'}
                  </button>
                </div>

                {/* Dropdown / Selection List of services */}
                <AnimatePresence>
                  {showServiceDropdown && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-4 p-3 border border-gray-200 rounded-xl bg-gray-50/50 space-y-2 max-h-48 overflow-y-auto"
                    >
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Select from Salon Catalog</p>
                      {services.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedService(s);
                            setShowServiceDropdown(false);
                          }}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all flex justify-between items-center ${
                            selectedService.id === s.id 
                              ? 'border-[#ac0053] bg-[#ffd9e1]/10' 
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-gray-900">{s.name}</p>
                            <p className="text-[10px] text-gray-500 font-semibold">{s.duration} mins • {s.category}</p>
                          </div>
                          <span className="text-xs font-extrabold text-gray-900">₹{serviceDisplayPrice(s, data.offers).finalPrice.toLocaleString('en-IN')}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#ffd9e1]/30 text-[#ac0053] flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-sm text-gray-900 leading-snug">{selectedService.name}</h3>
                      {(selectedPricing.offer?.promotionalBadge || selectedService.promotionalBadge) && (
                        <span className="rounded-full bg-[#fff1f4] text-[#8e0045] border border-[#f8c8dc] px-2 py-0.5 text-[9px] font-extrabold">
                          {selectedPricing.offer?.promotionalBadge || selectedService.promotionalBadge}
                        </span>
                      )}
                    </div>
                    {selectedPricing.offer && <p className="text-[10px] font-bold text-[#ac0053] mt-1">{selectedPricing.offer.title}</p>}
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed font-medium">{selectedService.description}</p>
                    <div className="flex items-center gap-4 mt-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <Clock className="w-3 h-3 text-[#ac0053]" /> {selectedDuration} min
                      </span>
                      <span className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <CreditCard className="w-3 h-3 text-[#ac0053]" /> ₹{selectedPrice}
                      </span>
                    </div>
                  </div>
                </div>

                {(selectedService.pricingVariants ?? []).filter((variant) => variant.status === 'active').length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Choose pricing option</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedVariantId(null)}
                        className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${selectedVariantId === null ? 'border-[#ac0053] bg-[#fff1f4] text-[#ac0053]' : 'border-gray-200 text-gray-600'}`}
                      >
                        Standard · ₹{serviceDisplayPrice(selectedService, data.offers).finalPrice.toLocaleString('en-IN')}
                      </button>
                      {(selectedService.pricingVariants ?? []).filter((variant) => variant.status === 'active').map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariantId(variant.id)}
                          className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${selectedVariantId === variant.id ? 'border-[#ac0053] bg-[#fff1f4] text-[#ac0053]' : 'border-gray-200 text-gray-600'}`}
                        >
                          {variant.name} · ₹{serviceDisplayPrice(selectedService, data.offers, variant.id).finalPrice.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Step 2: Date Selection */}
              <section className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm">
                <h2 className="font-extrabold text-sm text-gray-900 tracking-tight mb-3">Select Date</h2>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {generatedDates.map((date, idx) => {
                    const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
                    const dayNum = date.getDate();
                    const monthName = date.toLocaleDateString('en-IN', { month: 'short' });
                    const isSelected = selectedDate.toDateString() === date.toDateString();

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`flex flex-col items-center justify-center min-w-[72px] h-[84px] rounded-xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#ac0053] bg-[#ffd9e1] text-[#ac0053] shadow-xs'
                            : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wide">{dayName}</span>
                        <span className="text-xl font-extrabold my-0.5 leading-none">{dayNum}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide">{monthName}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 3: Time Selection */}
              <section className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm">
                <h2 className="font-extrabold text-sm text-gray-900 tracking-tight mb-3">Select Time Slot</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {TIME_SLOTS.map((slot, idx) => {
                    const isSelected = selectedTime === slot.time;
                    
                    if (slot.disabled) {
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled
                          className="py-2.5 px-3 rounded-xl border border-gray-100 bg-gray-50/50 text-gray-300 font-bold text-xs text-center cursor-not-allowed line-through flex items-center justify-center"
                        >
                          {slot.time}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2.5 px-3 rounded-xl border-2 font-bold text-xs text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#ac0053] bg-[#ffd9e1] text-[#ac0053] font-extrabold'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 4: Stylist Selection */}
              {(!data.bookingRules || data.bookingRules.allowStaffSelection) && (
                <section className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm">
                  <h2 className="font-extrabold text-sm text-gray-900 tracking-tight mb-3">
                    Select Specialist <span className="text-xs text-gray-400 font-semibold ml-1">(Optional)</span>
                  </h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Team Members */}
                    {team.map(member => {
                      const pub = getPublicStaffData(member);
                      const isSelected = selectedStylist !== null && selectedStylist.id === pub.id;

                      return (
                        <button
                          key={pub.id}
                          type="button"
                          onClick={() => setSelectedStylist(member)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#ac0053] bg-[#ffd9e1]/10'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <img 
                            className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0" 
                            src={pub.imageUrl} 
                            alt={pub.name} 
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-gray-900 truncate">{pub.name}</div>
                            <div className="text-[10px] font-semibold text-gray-400 mt-0.5 truncate">{pub.role}</div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Anyone Available Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedStylist(null)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        selectedStylist === null
                          ? 'border-[#ac0053] bg-[#ffd9e1]/10'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-gray-900 truncate">Anyone Available</div>
                        <div className="text-[10px] font-semibold text-gray-400 mt-0.5 truncate">Auto-assigned based on slot</div>
                      </div>
                    </button>
                  </div>
                </section>
              )}

            </div>

            {/* Sticky Summary & Invoice Right Side (5 Cols) */}
            <div className="lg:col-span-5 relative">
              <div className="sticky top-[100px] bg-white rounded-2xl p-5 border border-gray-150 shadow-md flex flex-col gap-5">
                <h3 className="font-extrabold text-sm text-gray-900 tracking-tight border-b border-gray-100 pb-3">
                  Booking Summary
                </h3>

                {/* Summary Details */}
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#ffd9e1]/45 text-[#ac0053] flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 leading-tight">{selectedService.name}</div>
                      <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">{selectedDuration} min</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#ffd9e1]/45 text-[#ac0053] flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 leading-tight">{formatDateLabel(selectedDate)}</div>
                      <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">{selectedTime}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#ffd9e1]/45 text-[#ac0053] flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 leading-tight">
                        {selectedStylist ? selectedStylist.name : 'Anyone Available'}
                      </div>
                      <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                        {selectedStylist ? selectedStylist.role : 'No Preference'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100"></div>

                {/* Price Breakdown */}
                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex justify-between text-gray-500 font-semibold">
                    <span>Treatment Subtotal</span>
                    <span className="text-gray-900 font-bold">₹{selectedPrice.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[#ac0053] font-extrabold p-2 bg-[#ffd9e1]/15 rounded-lg border border-[#ffd9e1]/30">
                    <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                      <Info className="w-3.5 h-3.5" /> Book Online Deposit ({depositPercentage}%)
                    </span>
                    <span>₹{depositAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 font-semibold">
                    <span>Due at Salon (Post Treatment)</span>
                    <span className="text-gray-900 font-bold">₹{remainingAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Total Section */}
                <div className="pt-4 border-t border-gray-100 mt-auto">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Total Payable Now</span>
                      <p className="text-[10px] text-gray-400 font-semibold leading-none mt-0.5">Online booking deposit</p>
                    </div>
                    <span className="text-xl font-extrabold text-[#ac0053]">
                      ₹{depositAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveView('payment')}
                    className="w-full bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3.5 px-4 rounded-xl shadow-md shadow-[#ac0053]/15 hover:shadow-lg transition-all active:scale-98 flex justify-center items-center gap-1.5 cursor-pointer"
                  >
                    Continue to Confirm
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            </div>

          </motion.div>
        ) : (
          /* ==============================================
             STAGE 2: RAZORPAY CONFIRM & SECURE PAYMENT SCREEN 
             ============================================== */
          <motion.div 
            key="payment-view"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex-grow max-w-5xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Payment Area Left Column (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Confirm your booking</h1>
                <p className="text-xs text-gray-500 font-medium mt-1">Complete your secure advance deposit payment to hold the slot.</p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-150 shadow-md flex flex-col gap-5">
                
                {/* Secure Payment Alert */}
                <div className="flex items-start gap-3.5 p-4 bg-[#f3f3f4] rounded-xl border border-gray-200">
                  <ShieldCheck className="w-5 h-5 text-[#ac0053] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-extrabold text-xs text-gray-900 leading-snug">Secure Online Payment</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed font-semibold">
                      Powered by Razorpay. Your payment details are fully encrypted and securely authorized.
                    </p>
                  </div>
                </div>

                {/* Your Contact Details */}
                <div className="flex flex-col gap-3">
                  <h2 className="font-extrabold text-xs text-gray-400 uppercase tracking-widest">Your Contact Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-150">
                    <div className="relative col-span-1 md:col-span-2">
                      <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                        Full Name
                      </label>
                      <input 
                        type="text" 
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full p-3 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800 transition-shadow"
                        placeholder="Neha Verma"
                      />
                    </div>
                    <div className="relative">
                      <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                        Phone Number
                      </label>
                      <input 
                        type="tel" 
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full p-3 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800 transition-shadow"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="relative">
                      <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                        Email Address
                      </label>
                      <input 
                        type="email" 
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full p-3 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800 transition-shadow"
                        placeholder="neha.verma@gmail.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Option Selector */}
                <div className="flex flex-col gap-3">
                  <h2 className="font-extrabold text-xs text-gray-400 uppercase tracking-widest">Select Payment Method</h2>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Card Button */}
                    <button 
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        paymentMethod === 'card'
                          ? 'border-[#ac0053] bg-[#ffd9e1]/10'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CreditCard className={`w-4 h-4 ${paymentMethod === 'card' ? 'text-[#ac0053]' : 'text-gray-400'}`} />
                        <span className="font-bold text-xs text-gray-800">Card</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === 'card' ? 'border-[#ac0053]' : 'border-gray-300'
                      }`}>
                        {paymentMethod === 'card' && <div className="w-2 h-2 rounded-full bg-[#ac0053]"></div>}
                      </div>
                    </button>

                    {/* UPI Button */}
                    <button 
                      type="button"
                      onClick={() => setPaymentMethod('upi')}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        paymentMethod === 'upi'
                          ? 'border-[#ac0053] bg-[#ffd9e1]/10'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Smartphone className={`w-4 h-4 ${paymentMethod === 'upi' ? 'text-[#ac0053]' : 'text-gray-400'}`} />
                        <span className="font-bold text-xs text-gray-800">UPI / GPay</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === 'upi' ? 'border-[#ac0053]' : 'border-gray-300'
                      }`}>
                        {paymentMethod === 'upi' && <div className="w-2 h-2 rounded-full bg-[#ac0053]"></div>}
                      </div>
                    </button>
                  </div>

                  {/* Payment Forms Content */}
                  <div className="mt-2">
                    {paymentMethod === 'card' ? (
                      /* Mock Card Form */
                      <div className="space-y-4">
                        <div className="relative">
                          <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                            Card Number
                          </label>
                          <input 
                            type="text" 
                            value={cardNo}
                            onChange={(e) => setCardNo(e.target.value)}
                            className="w-full p-3.5 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800 transition-shadow"
                            placeholder="0000 0000 0000 0000"
                          />
                          <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="relative">
                            <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                              Expiry
                            </label>
                            <input 
                              type="text" 
                              value={cardExpiry}
                              onChange={(e) => setCardExpiry(e.target.value)}
                              className="w-full p-3.5 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800"
                              placeholder="MM/YY"
                            />
                          </div>
                          <div className="relative">
                            <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                              CVV
                            </label>
                            <input 
                              type="password" 
                              value={cardCvv}
                              onChange={(e) => setCardCvv(e.target.value)}
                              className="w-full p-3.5 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800"
                              placeholder="•••"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Mock UPI Form */
                      <div className="space-y-4">
                        <div className="relative">
                          <label className="absolute -top-2 left-3 px-1.5 bg-white font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                            UPI ID / Virtual Address
                          </label>
                          <input 
                            type="text" 
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full p-3.5 border border-gray-250 rounded-xl bg-white focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/30 outline-none text-xs font-bold text-gray-800 transition-shadow"
                            placeholder="username@upi"
                          />
                          <QrCode className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 px-1">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-500" /> Enter UPI ID and open BHIM, GPay, or Paytm app to pay
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Razorpay Call To Action Button with transitions */}
                <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handlePayNow}
                    disabled={paymentState !== 'idle'}
                    className={`w-full font-bold text-xs py-4 px-4 rounded-xl shadow-md transition-all flex justify-center items-center gap-2 select-none cursor-pointer ${
                      paymentState === 'idle'
                        ? 'bg-[#ac0053] hover:bg-[#ba005b] text-white shadow-[#ac0053]/15'
                        : paymentState === 'verifying'
                        ? 'bg-gray-800 text-white cursor-not-allowed opacity-90 shadow-none'
                        : 'bg-[#146c2e] text-white shadow-none cursor-default'
                    }`}
                  >
                    {paymentState === 'idle' && (
                      <>
                        <span>Pay Deposit ₹{depositAmount}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}

                    {paymentState === 'verifying' && (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white mr-1" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"></path>
                        </svg>
                        <span>Verifying payment with Razorpay...</span>
                      </>
                    )}

                    {paymentState === 'success' && (
                      <>
                        <CalendarCheck className="w-4 h-4 text-white" />
                        <span>Payment Successful</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-gray-400 font-bold text-[10px] uppercase tracking-wider">
                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                    <span>Secure 128-bit Payment Processing</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Sticky Booking Summary Column (5 Cols) */}
            <div className="lg:col-span-5">
              <div className="sticky top-[100px] bg-white rounded-2xl p-5 border border-gray-150 shadow-md flex flex-col gap-5">
                <h2 className="font-extrabold text-sm text-gray-900 tracking-tight border-b border-gray-100 pb-3">
                  Booking Summary
                </h2>

                {/* Treatment details with high-quality category image */}
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-gray-150 shadow-2xs">
                    <img 
                      className="w-full h-full object-cover" 
                      src={getServiceImage()} 
                      alt={selectedService.name} 
                    />
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h3 className="font-extrabold text-xs text-gray-900 truncate leading-snug">{selectedService.name}</h3>
                    <p className="text-[11px] text-gray-400 font-bold mt-1 uppercase tracking-wide truncate">
                      {selectedStylist ? `with ${selectedStylist.name}` : 'Anyone Available'}
                    </p>
                  </div>
                </div>

                {/* Date & Time display */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-150 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#ffd9e1] flex items-center justify-center text-[#ac0053] shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 truncate">{formatDateLabel(selectedDate)}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{selectedTime}</p>
                  </div>
                </div>

                {/* Invoice Pricing details */}
                <div className="flex flex-col gap-3 font-medium text-xs">
                  <div className="flex justify-between text-gray-400 font-bold text-[10px] uppercase tracking-wider">
                    <span>Total Service Value</span>
                    <span className="text-gray-900 font-extrabold">₹{selectedPrice.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="p-3 bg-[#ffd9e1]/15 rounded-xl border border-[#ffd9e1]/40 flex justify-between items-center text-[#ac0053]">
                    <div>
                      <span className="font-extrabold text-xs block leading-tight">Pay Now (Deposit)</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 mt-0.5">{depositPercentage}% Online Advance</span>
                    </div>
                    <span className="font-black text-base">₹{depositAmount.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between items-center pt-2.5 border-t border-gray-100 text-gray-500">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Pay at Salon</span>
                    <span className="text-gray-900 font-extrabold">₹{remainingAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setActiveView('book')}
                  disabled={paymentState !== 'idle'}
                  className="mt-2 text-xs font-bold text-[#ac0053] hover:text-[#ba005b] text-center border border-dashed border-[#ac0053]/30 p-2.5 rounded-xl hover:bg-[#ffd9e1]/10 transition-colors cursor-pointer"
                >
                  Modify Selections
                </button>

              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Razorpay Interactive Success Modal Dialog Overlay */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-4 border border-gray-100 shadow-2xl relative"
            >
              <button 
                type="button"
                onClick={resetAll}
                className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="inline-flex p-3.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CalendarCheck className="w-8 h-8" />
              </div>

              <div>
                <h3 className="font-extrabold text-gray-900 text-sm">Booking Preview Success!</h3>
                <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                  Your clients will experience this seamless advance payment flow powered by <strong className="text-gray-800">Razorpay</strong> when booking online!
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-left space-y-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Receipt Summary:</div>
                <div className="text-xs font-bold text-gray-800">• {selectedService.name} (₹{selectedPrice})</div>
                <div className="text-xs font-semibold text-gray-600">• Date: {selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {selectedTime}</div>
                <div className="text-xs font-semibold text-gray-600">• Stylist: {selectedStylist ? selectedStylist.name : 'Anyone Available'}</div>
                <div className="text-xs font-extrabold text-[#ac0053]">• Online Deposit Paid: ₹{depositAmount} (Via {paymentMethod === 'card' ? 'Card' : 'UPI'})</div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Book Another
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(false);
                    onBackToWebsite();
                  }}
                  className="flex-1 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Looks Fantastic!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sticky Footer (Responsive Action Bar) */}
      {activeView === 'book' ? (
        <footer className="bg-white border-t border-gray-150 fixed bottom-0 left-0 w-full z-40 flex justify-between items-center px-4 py-3 md:hidden shadow-[0_-4px_8px_rgba(0,0,0,0.02)]">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Payable Deposit</span>
            <span className="text-base font-extrabold text-[#ac0053]">₹{depositAmount.toLocaleString('en-IN')}</span>
          </div>
          <button 
            onClick={() => setActiveView('payment')}
            className="bg-[#ac0053] text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-[#ba005b] active:scale-95 shadow-xs flex items-center gap-1 cursor-pointer"
          >
            Book Now
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </footer>
      ) : (
        <footer className="bg-white border-t border-gray-150 fixed bottom-0 left-0 w-full z-40 flex justify-between items-center px-4 py-3 md:hidden shadow-[0_-4px_8px_rgba(0,0,0,0.02)]">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Confirm Deposit</span>
            <span className="text-base font-extrabold text-[#ac0053]">₹{depositAmount.toLocaleString('en-IN')}</span>
          </div>
          <button 
            onClick={handlePayNow}
            disabled={paymentState !== 'idle'}
            className={`font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer ${
              paymentState === 'idle'
                ? 'bg-[#ac0053] text-white hover:bg-[#ba005b]'
                : paymentState === 'verifying'
                ? 'bg-gray-800 text-white cursor-not-allowed opacity-90'
                : 'bg-[#146c2e] text-white'
            }`}
          >
            {paymentState === 'idle' && (
              <>
                <span>Pay Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
            {paymentState === 'verifying' && <span>Verifying...</span>}
            {paymentState === 'success' && <span>Successful</span>}
          </button>
        </footer>
      )}
    </div>
  );
}
