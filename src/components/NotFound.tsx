import { ArrowLeft, MapPinOff, Sparkles } from 'lucide-react';

export default function NotFound() {
  const handleGoHome = () => {
    // Navigate back to the main wizard/dashboard root
    window.location.href = '/';
  };

  const handleGoNearby = () => {
    // Navigate to public nearby salon search
    window.location.href = '/nearby';
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center" id="not-found-container">
        {/* Decorative Graphic */}
        <div className="mb-8 relative inline-flex items-center justify-center">
          <div className="absolute inset-0 bg-[#ffd9e1]/50 rounded-full blur-2xl w-24 h-24 -translate-y-4"></div>
          <div className="w-20 h-20 rounded-2xl bg-white border border-[#ac0053]/10 shadow-lg flex items-center justify-center text-[#ac0053] relative z-10">
            <MapPinOff size={36} strokeWidth={1.5} />
          </div>
          <div className="absolute -top-1 -right-1 text-amber-500 animate-pulse">
            <Sparkles size={18} />
          </div>
        </div>

        {/* Content */}
        <h1 className="text-3xl font-black text-gray-950 tracking-tight mb-3">
          Salon Not Found
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          We couldn't find a beauty parlor or hair studio registered at this web address. It may have moved or the address was entered incorrectly.
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            id="not-found-back-home"
            onClick={handleGoHome}
            className="w-full bg-[#ac0053] hover:bg-[#8e0044] text-white py-3.5 px-6 rounded-xl font-bold text-sm transition-all shadow-md shadow-[#ac0053]/10 flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            <span>Go to Nexora Creator</span>
          </button>

          <button
            type="button"
            id="not-found-view-nearby"
            onClick={handleGoNearby}
            className="w-full bg-white hover:bg-gray-50 text-gray-700 py-3.5 px-6 rounded-xl font-bold text-sm transition-all border border-gray-200 flex items-center justify-center gap-2"
          >
            <span>Explore Nearby Salons</span>
          </button>
        </div>

        {/* Brand Footer */}
        <div className="mt-12 text-gray-400 text-[11px] font-medium tracking-wide uppercase">
          Powered by Nexora
        </div>
      </div>
    </div>
  );
}
