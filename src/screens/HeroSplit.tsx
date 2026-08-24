import { Sparkles, ArrowRight, CheckCircle2, Smartphone, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthModal } from '../components/AuthModalProvider';
import { useAuth, signOut } from '../lib/useAuth';
import { useBrandConfig } from '../config/brandConfig';

export default function HeroSplit({ onNext }: { onNext: () => void }) {
  const { openAuth } = useAuthModal();
  const { user } = useAuth();
  const { platform } = useBrandConfig();
  const baseDomain = platform.websiteUrl.replace(/^https?:\/\//, '');
  const continueOwnerSetup = () => {
    if (!user) {
      openAuth('login');
      return;
    }
    window.location.assign('/dashboard');
  };
  return (
    <div className="min-h-screen bg-[#f9f8f6] flex flex-col font-sans overflow-hidden">
      <header className="h-16 px-8 border-b border-gray-200/50 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 text-[#ac0053]">
          <Sparkles className="w-6 h-6" />
          <span className="font-semibold text-xl tracking-tight">{platform.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {user ? user.email : 'Already have a website?'}
          </span>
          <button
            type="button"
            data-testid="hero-login-btn"
            onClick={() => (user ? void signOut() : openAuth('login'))}
            aria-haspopup="dialog"
            className="border border-[#ac0053] text-[#ac0053] px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-pink-50 transition-colors"
          >
            {user ? 'Log Out' : 'Log In'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column */}
        <div className="lg:col-span-5 flex flex-col items-start gap-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm text-xs font-semibold tracking-widest uppercase text-gray-600"
          >
            <Sparkles className="w-4 h-4 text-[#ac0053]" />
            AI-Powered Salon Website Builder
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl lg:text-[56px] font-bold text-gray-900 leading-[1.15] tracking-tight"
          >
            Create Your<br/>Salon Website<br/>
            in <span className="text-[#d9006b] relative inline-block mt-2">
              30 Minutes
              <svg className="absolute -bottom-2 left-0 w-full opacity-60" fill="none" height="8" viewBox="0 0 200 8" xmlns="http://www.w3.org/2000/svg"><path d="M2 5C50 2 150 2 198 5" stroke="#d9006b" strokeLinecap="round" strokeWidth="3"></path></svg>
            </span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-600 leading-relaxed mt-2"
          >
            No coding. No technical knowledge required. Just tell us about your business and {platform.name} will create your professional salon website for you.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-6 mt-4"
          >
            <button 
              type="button"
              data-testid="owner-flow-continue"
              onClick={continueOwnerSetup}
              className="bg-[#ac0053] text-white px-8 py-4 rounded-lg font-semibold flex items-center gap-2 hover:-translate-y-1 hover:shadow-xl transition-all shadow-lg shadow-pink-900/20"
            >
              {user ? 'Complete Business Setup' : 'Log In to Continue'}
              <ArrowRight className="w-5 h-5" />
            </button>
            <button className="text-gray-600 font-medium hover:text-[#ac0053] transition-colors">See how it works</button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-8 mt-10 pt-6 border-t border-gray-200 w-full text-sm font-medium text-gray-600"
          >
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#ac0053]" /> Simple guided setup</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#ac0053]" /> Mobile-ready</div>
          </motion.div>
        </div>

        {/* Right Column - Mockup */}
        <div className="lg:col-span-7 relative h-[600px] w-full flex items-center justify-center lg:justify-end">
          <div className="absolute inset-0 bg-[#ffd9e1]/40 rounded-full blur-[80px] -z-10 animate-pulse"></div>
          
          {/* Floating tags */}
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="absolute top-20 left-0 z-20 bg-white px-4 py-2.5 rounded-lg shadow-xl border border-gray-100 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#ac0053]" /> <span className="text-sm font-semibold text-gray-800">Services added</span>
          </motion.div>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 5, delay: 1 }} className="absolute top-1/2 -right-4 z-20 bg-white px-4 py-2.5 rounded-lg shadow-xl border border-gray-100 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[#ac0053]" /> <span className="text-sm font-semibold text-gray-800">Mobile ready</span>
          </motion.div>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4.5, delay: 0.5 }} className="absolute bottom-32 left-10 z-20 bg-white px-4 py-2.5 rounded-lg shadow-xl border border-gray-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#ac0053]" /> <span className="text-sm font-semibold text-gray-800">Booking enabled</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute -bottom-6 right-10 z-30 bg-white rounded-xl shadow-2xl border border-pink-100 p-4 w-72"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-[#ac0053] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-800">{platform.name} AI is building your website...</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear" }}
                className="h-full bg-[#ac0053]"
              />
            </div>
          </motion.div>

          {/* Browser Container */}
          <motion.div 
            initial={{ opacity: 0, rotate: 0, x: 20 }}
            animate={{ opacity: 1, rotate: -2, x: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="w-[700px] h-[500px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden hover:rotate-0 transition-transform duration-500 origin-center"
          >
            <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center px-4 gap-2 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <div className="mx-auto bg-white px-4 py-1 rounded text-[10px] font-mono text-gray-500 shadow-sm border border-gray-200">luxesalon.{baseDomain}</div>
            </div>
            <div className="flex-1 bg-cover bg-center relative" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1600948836101-f9ffda59d250?q=80&w=1000&auto=format&fit=crop)'}}>
              <div className="absolute inset-0 bg-black/40"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="relative z-10 p-10 flex flex-col justify-end h-full text-white">
                <span className="text-xs font-bold uppercase tracking-widest mb-3 opacity-80 border border-white/30 w-max px-3 py-1 rounded backdrop-blur-sm">Premium Haircare</span>
                <h2 className="text-[40px] font-serif font-bold leading-tight mb-3">Elevate Your<br/>Everyday Style</h2>
                <p className="text-white/80 max-w-sm text-sm mb-6">Experience personalized styling and coloring services in the heart of the city.</p>
                <button className="bg-white text-gray-900 px-6 py-2.5 rounded-lg font-semibold text-sm w-max hover:bg-gray-100 transition-colors">Explore Services</button>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

    </div>
  );
}
