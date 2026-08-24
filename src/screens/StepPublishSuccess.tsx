import { authenticatedApiFetch } from '../lib/apiFetch';
import React, { useState, useEffect, useRef } from 'react';
import { SalonData } from '../types';
import { 
  CheckCircle2, 
  Globe, 
  Copy, 
  Share2, 
  LayoutDashboard, 
  ExternalLink, 
  Sparkles, 
  Rocket, 
  MessageSquare, 
  Facebook, 
  QrCode, 
  X,
  Check,
  Wand2,
  Sliders,
  RefreshCw,
  Undo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBrandConfig } from '../config/brandConfig';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void; // go to dashboard
  onPrev?: () => void;
  onSave?: () => void;
}

export default function StepPublishSuccess({ data, setData, onNext, onSave }: Props) {
  const { platform } = useBrandConfig();
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const confettiContainerRef = useRef<HTMLDivElement>(null);

  // New interactive AI states on final screen!
  const [tuningField, setTuningField] = useState<'headline' | 'tagline' | 'about'>('headline');
  const [tuningTone, setTuningTone] = useState<string>('luxurious');
  const [tuningInstruct, setTuningInstruct] = useState<string>('');
  const [isTuning, setIsTuning] = useState(false);
  const [tuneFlash, setTuneFlash] = useState(false);

  // The parent only mounts this screen after the publish RPC returns a real
  // is_published=true row. Never synthesize a success URL from draft data.
  const url = data.publishedUrl || '';
  const displayUrl = url.replace(/^https?:\/\//, '');

  // Initialize interactive confetti
  useEffect(() => {
    const container = confettiContainerRef.current;
    if (!container) return;

    const colors = ['#d9006b', '#ffb1c4', '#ffffff', '#ba005b', '#ffb1c4'];
    const confettiElements: HTMLDivElement[] = [];

    for (let i = 0; i < 60; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.animationDelay = Math.random() * 2 + 's';
      confetti.style.animationDuration = Math.random() * 3 + 2 + 's';
      
      if (Math.random() > 0.5) {
        confetti.style.borderRadius = '0';
      } else {
        confetti.style.borderRadius = '50%';
      }
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      
      container.appendChild(confetti);
      confettiElements.push(confetti);
    }

    // Fade out container after 5 seconds
    const fadeTimeout = setTimeout(() => {
      if (container) {
        container.style.opacity = '0';
        container.style.transition = 'opacity 2s ease';
      }
    }, 5000);

    return () => {
      clearTimeout(fadeTimeout);
      confettiElements.forEach(el => el.remove());
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    const text = `🎉 My salon website is live! Check it out: ${url} — built with ${platform.name} ✨`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleFacebookShare = () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer');
  };

  const handleViewWebsite = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Real-time AI tuner endpoint trigger
  const handleTuneContent = async (simplify: boolean = false) => {
    setIsTuning(true);
    
    // map state fields to exact values
    let originalText = '';
    let apiFieldKey = 'heroHeadline';
    
    if (tuningField === 'headline') {
      originalText = data.salonName || '';
      apiFieldKey = 'heroHeadline';
    } else if (tuningField === 'tagline') {
      originalText = data.tagline || '';
      apiFieldKey = 'tagline';
    } else {
      originalText = data.about || '';
      apiFieldKey = 'about';
    }

    try {
      const res = await authenticatedApiFetch('/api/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalText,
          field: apiFieldKey,
          tone: tuningTone,
          keywords: '',
          instructions: simplify ? 'make it simpler and shorter' : tuningInstruct
        })
      });
      const resData = await res.json();
      if (resData.rewritten) {
        // Update parent state in real-time
        setData(prev => {
          const updated = { ...prev };
          if (tuningField === 'headline') {
            updated.salonName = resData.rewritten;
          } else if (tuningField === 'tagline') {
            updated.tagline = resData.rewritten;
          } else {
            updated.about = resData.rewritten;
          }
          return updated;
        });

        // Trigger flash highlight in mobile preview
        setTuneFlash(true);
        setTimeout(() => setTuneFlash(false), 1500);

        if (onSave) onSave();
      }
    } catch (err) {
      console.error('Tuner failed:', err);
    } finally {
      setIsTuning(false);
    }
  };

  const handleManualEdit = (val: string) => {
    setData(prev => {
      const updated = { ...prev };
      if (tuningField === 'headline') {
        updated.salonName = val;
      } else if (tuningField === 'tagline') {
        updated.tagline = val;
      } else {
        updated.about = val;
      }
      return updated;
    });
  };

  // Safe fallback cover image
  const defaultCover = "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=1000&auto=format&fit=crop";
  const coverImage = data.heroImageUrl || defaultCover;

  // Active value shown in textarea
  const activeTextValue = tuningField === 'headline' 
    ? (data.salonName || '') 
    : tuningField === 'tagline' 
    ? (data.tagline || '') 
    : (data.about || '');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f9f9f9] relative font-sans text-[#1a1c1c]">
      {/* CSS injection for animations */}
      <style>{`
        .confetti {
          position: absolute;
          width: 10px;
          height: 10px;
          opacity: 0;
          animation: fall 3.5s infinite linear;
          pointer-events: none;
        }
        @keyframes fall {
          0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .pulse-ring {
          animation: pulse-ring 2.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 0, 107, 0.5); }
          70% { transform: scale(1); box-shadow: 0 0 0 12px rgba(217, 0, 107, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 0, 107, 0); }
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .rotate-y-neg-5 {
          transform: rotateY(-6deg) rotateX(4deg);
        }
        .custom-glass-shine {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.1) 100%);
        }
      `}</style>

      {/* Confetti Container */}
      <div ref={confettiContainerRef} className="absolute inset-0 pointer-events-none z-0 overflow-hidden" id="confetti-container" />

      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 h-16 w-full flex justify-between items-center px-6 md:px-10 z-10 sticky top-0 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#ac0053] animate-pulse" />
          <span className="text-xl font-bold text-[#ac0053] tracking-tight">{platform.name}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Step 14 of 14</span>
          <div className="flex items-center gap-1.5 text-[#ac0053]">
            <span className="text-xs font-bold">Website Published</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-6 md:p-8 lg:p-12 z-10">
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          
          {/* Success Message / Action Panel */}
          <div className="flex flex-col text-center md:text-left space-y-6 bg-white p-6 md:p-8 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-gray-200 w-full justify-between">
            
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row items-center gap-4">
                {/* Celebration Icon */}
                <div className="w-14 h-14 bg-[#ffd9e1] rounded-full flex items-center justify-center pulse-ring shrink-0">
                  <Rocket className="w-7 h-7 text-[#ac0053]" />
                </div>
                <div className="space-y-0.5">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-[#1a1c1c] tracking-tight">
                    Your website is live!
                  </h1>
                  <div className="flex justify-center md:justify-start items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ac0053] animate-ping" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nexora Cloud Server Active</span>
                  </div>
                </div>
              </div>

              {/* Live Web Address Box */}
              <div className="w-full space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider text-left">
                  Your Web Address
                </label>
                <div className="flex items-center bg-[#f3f3f4] border border-gray-200 rounded-xl p-1 overflow-hidden focus-within:border-[#ac0053] transition-all">
                  <Globe className="w-4 h-4 text-gray-400 ml-3 mr-1 shrink-0" />
                  <input 
                    className="bg-transparent border-none focus:ring-0 w-full text-xs font-semibold text-gray-800 py-2 outline-none cursor-default px-2 select-all" 
                    readOnly 
                    type="text" 
                    value={displayUrl}
                  />
                  <button 
                    onClick={handleCopy}
                    className={`border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold text-[10px] px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap active:scale-95 m-1 ${copied ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white'}`}
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* NEW ADDITION ON THIS SCREEN: Fully Interactive Real-time AI Content Tuner */}
              <div className="bg-[#fcf8f9] border border-[#ac0053]/15 rounded-xl p-4 space-y-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#ac0053] uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Real-time AI Content Tuner
                  </span>
                  <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
                    {[
                      { key: 'headline', label: 'Title' },
                      { key: 'tagline', label: 'Tagline' },
                      { key: 'about', label: 'About' }
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setTuningField(f.key as any)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${tuningField === f.key ? 'bg-[#ac0053] text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone Select Chips */}
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { key: 'luxurious', label: '👑 Luxury' },
                    { key: 'modern', label: '⚡ Modern' },
                    { key: 'warm', label: '🌸 Warm' },
                    { key: 'minimalist', label: '🌱 Pure' }
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTuningTone(t.key)}
                      className={`py-1 rounded text-[9px] font-bold border transition-colors ${tuningTone === t.key ? 'bg-white border-[#ac0053] text-[#ac0053] shadow-xs' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-500'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Custom Instruction Prompt */}
                <input
                  type="text"
                  value={tuningInstruct}
                  onChange={e => setTuningInstruct(e.target.value)}
                  placeholder="e.g. Add 'organic skin expert'..."
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:border-[#ac0053] placeholder-gray-400"
                />

                {/* Textarea for immediate adjustment */}
                <textarea
                  rows={2}
                  value={activeTextValue}
                  onChange={e => handleManualEdit(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 focus:border-[#ac0053] outline-none resize-none leading-normal font-medium"
                  placeholder="Draft copy here..."
                />

                {/* Tune and Simplify controls */}
                <div className="flex gap-2">
                  <button
                    disabled={isTuning}
                    onClick={() => handleTuneContent(false)}
                    className="flex-1 py-1.5 bg-[#ac0053]/10 hover:bg-[#ac0053]/20 disabled:bg-gray-100 disabled:text-gray-400 text-[#ac0053] font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  >
                    {isTuning ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Tuning...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3" />
                        AI Magic Rewrite
                      </>
                    )}
                  </button>
                  <button
                    disabled={isTuning}
                    onClick={() => handleTuneContent(true)}
                    className="py-1.5 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs rounded-lg transition-colors"
                  >
                    Simpler
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button 
                  onClick={onNext}
                  className="flex-1 bg-[#1a1c1c] text-white font-bold text-sm px-5 py-3.5 rounded-xl hover:bg-black transition-colors shadow-sm active:scale-95 flex justify-center items-center gap-2 group cursor-pointer"
                >
                  Go to Dashboard
                  <LayoutDashboard className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button 
                  onClick={handleViewWebsite}
                  className="flex-1 bg-white border-2 border-gray-200 text-gray-800 font-bold text-sm px-5 py-3.5 rounded-xl hover:border-[#ac0053] hover:text-[#ac0053] transition-colors active:scale-95 flex justify-center items-center gap-2 cursor-pointer"
                >
                  View Website
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              {/* Sharing Section */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center md:text-left">
                  Share Live Website Link
                </p>
                <div className="flex justify-center md:justify-start gap-3">
                  <button 
                    onClick={handleWhatsAppShare}
                    aria-label="Share on WhatsApp" 
                    className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-[#ffd9e1]/40 hover:border-[#ac0053] hover:text-[#ac0053] transition-all text-gray-500 active:scale-95 shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4 text-[#25D366]" />
                  </button>
                  <button 
                    onClick={handleFacebookShare}
                    aria-label="Share on Facebook" 
                    className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-[#ffd9e1]/40 hover:border-[#ac0053] hover:text-[#ac0053] transition-all text-gray-500 active:scale-95 shadow-sm"
                  >
                    <Facebook className="w-4 h-4 text-[#1877F2]" />
                  </button>
                  <button 
                    onClick={() => setShowQrModal(true)}
                    aria-label="Generate QR Code" 
                    className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-[#ffd9e1]/40 hover:border-[#ac0053] hover:text-[#ac0053] transition-all text-gray-500 active:scale-95 shadow-sm"
                  >
                    <QrCode className="w-4 h-4 text-indigo-600" />
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Perspective Interactive Live Mobile Preview Mockup */}
          <div className="hidden md:flex justify-center items-center h-full perspective-1000 z-10">
            <div className={`w-[290px] h-[520px] bg-white rounded-[2.5rem] border-[8px] border-gray-200 shadow-2xl overflow-hidden relative rotate-y-neg-5 hover:rotate-0 transition-all duration-500 ease-out select-none ${tuneFlash ? 'ring-4 ring-[#ac0053] scale-102 shadow-[#ac0053]/20' : ''}`}>
              
              {/* Fake Browser Top Chrome */}
              <div className="bg-[#f3f3f4] h-10 w-full flex items-center px-4 border-b border-gray-100 shrink-0">
                <div className="flex gap-1.5 mr-2">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </div>
                <div className="mx-auto bg-white px-3 py-1 rounded-full text-[8px] text-gray-500 border border-gray-100 truncate max-w-[140px] font-mono text-center">
                  {displayUrl}
                </div>
              </div>

              {/* Live Preview Container */}
              <div className={`h-[calc(100%-40px)] overflow-y-auto custom-scrollbar relative ${data.websiteAppearance === 'dark' ? 'bg-[#121212] text-white' : 'bg-white text-gray-900'}`}>
                
                {/* Banner Header Image with overlay */}
                <div 
                  className="bg-cover bg-center w-full h-32 relative transition-all" 
                  style={{ backgroundImage: `url('${coverImage}')` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>
                  <div className="absolute bottom-2.5 left-3.5 right-3.5">
                    <h2 className="text-sm font-bold text-white drop-shadow-sm truncate">
                      {data.salonName || 'Your salon'}
                    </h2>
                    <p className="text-[9px] text-white/90 drop-shadow-sm truncate mt-0.5">
                      {data.tagline || 'Premium Hair & Spa Care'}
                    </p>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-3.5 space-y-3.5">
                  {/* Book Button */}
                  <button className="w-full py-2 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-[10px] rounded-lg shadow-xs transition-colors cursor-default">
                    Book Appointment
                  </button>

                  {/* Dynamic Stats in Mobile Preview */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className={`p-1.5 rounded-lg border text-[10px] ${data.websiteAppearance === 'dark' ? 'bg-[#1e1e1e] border-gray-800' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="font-bold text-[#ac0053]">{data.services?.length || 5}</div>
                      <div className="text-[8px] text-gray-400">Services</div>
                    </div>
                    <div className={`p-1.5 rounded-lg border text-[10px] ${data.websiteAppearance === 'dark' ? 'bg-[#1e1e1e] border-gray-800' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="font-bold text-emerald-600">{data.team?.length || 4}</div>
                      <div className="text-[8px] text-gray-400">Stylists</div>
                    </div>
                  </div>

                  {/* Description Paragraph */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">About Us</p>
                    <p className="text-[10px] leading-relaxed opacity-80 line-clamp-3">
                      {data.about || 'Experience the highest standard of personal styling, luxurious hair care, and premium cosmetics treatment in our beauty haven.'}
                    </p>
                  </div>

                  {/* Services Header */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Our Services</p>
                    <div className="space-y-1">
                      {(data.services && data.services.length > 0 ? data.services.slice(0, 3) : [
                        { name: 'Haircut & Blow-Dry', price: 350 },
                        { name: 'Nourishing Hair Spa', price: 900 },
                        { name: 'Ammonia-Free Color', price: 1500 }
                      ]).map((svc: any, idx: number) => (
                        <div 
                          key={idx} 
                          className={`flex justify-between items-center p-1.5 rounded-lg text-[9px] ${data.websiteAppearance === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-50'}`}
                        >
                          <span className="font-medium truncate max-w-[130px]">{svc.name}</span>
                          <span className="font-bold text-[#ac0053]">₹{svc.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Phone screen reflection effect */}
              <div className="absolute inset-0 pointer-events-none custom-glass-shine" />
            </div>
          </div>

        </div>
      </main>

      {/* Fully Functional QR Code Modal Overlay */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative border border-gray-200"
            >
              <button 
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-4">
                <div className="space-y-1 pt-2">
                  <h3 className="text-lg font-bold text-[#1a1c1c]">Scan Website QR Code</h3>
                  <p className="text-xs text-gray-500">Scan with your mobile camera to view your live website instantly</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl inline-block border border-gray-100">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
                    alt={`QR Code for ${url}`}
                    className="w-48 h-48 mx-auto"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="text-xs text-gray-400 font-mono select-all break-all border border-dashed border-gray-200 p-2.5 rounded-lg bg-gray-50">
                  {displayUrl}
                </div>

                <button 
                  onClick={() => {
                    handleCopy();
                  }}
                  className="w-full bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl transition-colors active:scale-95 cursor-pointer"
                >
                  {copied ? 'Copied Link Address!' : 'Copy Link Address'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
