import { Sparkles, CheckCircle2, Users, LayoutDashboard, Loader2, ChevronDown, MapPin, Calendar, CreditCard, Share2, Settings, Scissors, Camera, Clock, LogIn, LogOut, Store } from 'lucide-react';
import { useState } from 'react';
import { useAuthModal } from './AuthModalProvider';
import { useAuth, signOut } from '../lib/useAuth';
import { useBrandConfig } from '../config/brandConfig';

export const SCREENS = [
  { id: 1, label: '01 — Login', group: 'OWNER SETUP (01-14)' },
  { id: 2, label: '02 — Business Details', group: 'OWNER SETUP (01-14)' },
  { id: 3, label: '03 — Services & Packages', group: 'OWNER SETUP (01-14)' },
  { id: 4, label: '04 — Team Setup', group: 'OWNER SETUP (01-14)' },
  { id: 5, label: '05 — Photo Gallery', group: 'OWNER SETUP (01-14)' },
  { id: 6, label: '06 — Socials & Reels', group: 'OWNER SETUP (01-14)' },
  { id: 7, label: '07 — Location & Hours', group: 'OWNER SETUP (01-14)' },
  { id: 8, label: '08 — Contact & Booking Rules', group: 'OWNER SETUP (01-14)' },
  { id: 9, label: '09 — Choose Template', group: 'OWNER SETUP (01-14)' },
  { id: 10, label: '10 — Customize Appearance', group: 'OWNER SETUP (01-14)' },
  { id: 11, label: '11 — AI Content Review', group: 'OWNER SETUP (01-14)' },
  { id: 12, label: '12 — Preview Website', group: 'OWNER SETUP (01-14)' },
  { id: 13, label: '13 — Publish (persisted)', group: 'OWNER SETUP (01-14)' },
  { id: 14, label: '14 — Published Website', group: 'OWNER SETUP (01-14)' },
  { id: 17, label: '17 — Staff Management Module', group: 'STAFF MODULE' },
  { id: 18, label: '18 — Overview Dashboard', group: 'DASHBOARD (18-25)' },
  { id: 19, label: '19 — Website & Design Manager', group: 'DASHBOARD (18-25)' },
  { id: 20, label: '20 — Bookings & Calendar', group: 'DASHBOARD (18-25)' },
  { id: 21, label: '21 — Payments & Revenue Analytics', group: 'DASHBOARD (18-25)' },
  { id: 22, label: '22 — Marketing & Social Share Hub', group: 'DASHBOARD (18-25)' },
  { id: 23, label: '23 — Salon Settings & Policies', group: 'DASHBOARD (18-25)' },
  { id: 24, label: '24 — Share & Referral Premium', group: 'DASHBOARD (18-25)' },
  { id: 25, label: '25 — Branding & White-label Settings Premium', group: 'DASHBOARD (18-25)' },
  // PHASE 17.1 — Salon Owner Dashboard (real, session-owned salon data).
  { id: 26, label: '26 — Salon Owner Dashboard', group: 'OWNER DASHBOARD (26)' },
] as const;

interface Props {
  step: number;
  activeModule: 'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard';
  setActiveModule: (m: 'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard') => void;
  saveStatus?: 'saved' | 'saving';
  currentScreen?: number;
  onNavigate?: (screenId: number) => void;
}

export default function TopBar({ step, activeModule, setActiveModule, saveStatus = 'saved', currentScreen, onNavigate }: Props) {
  const { platform } = useBrandConfig();
  const { openAuth } = useAuthModal();
  const { user, loading: authLoading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const displayStep = step + 1; 
  const totalSteps = 14;
  const progress = Math.max(0, (displayStep / totalSteps) * 100);
  
  // Derive currentScreen if not provided
  const derivedScreen = currentScreen ?? (
    activeModule === 'staff-management' ? 17 :
    activeModule === 'owner-dashboard' ? 26 :
    activeModule === 'dashboard' ? 18 :
    Math.min(14, Math.max(1, step + 1))
  );

  const currentLabel = SCREENS.find(s => s.id === derivedScreen)?.label || `Screen ${derivedScreen}`;

  const handleSelect = (id: number) => {
    setDropdownOpen(false);
    if (onNavigate) onNavigate(id);
  };
  
  return (
    <header className="h-16 px-4 md:px-6 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 z-50 sticky top-0 gap-2 md:gap-4">
      <div className="flex items-center gap-3 md:gap-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[#ac0053] shrink-0">
          <Sparkles className="w-6 h-6" />
          <span className="font-bold text-xl tracking-tight hidden sm:inline">{platform.name || 'Nexora'}</span>
        </div>

        {/* Universal 22-Screen Navigator Dropdown */}
        <div className="relative flex-1 max-w-[380px]">
          <button
            data-testid="universal-navigator"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2 bg-gray-900 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-black transition-colors border border-gray-800 shadow-xs"
          >
            <span className="flex items-center gap-2 truncate">
              <span className="bg-[#ac0053] text-white text-[10px] px-1.5 py-0.5 rounded font-black tracking-wider shrink-0">OWNER SETUP</span>
              <span className="truncate hidden sm:inline">{currentLabel}</span>
              <span className="truncate sm:hidden">Screen {derivedScreen}</span>
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-full sm:w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
              <div className="p-3 border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                <div className="text-[11px] font-black tracking-widest text-gray-400 uppercase">OWNER WORKSPACE NAVIGATOR</div>
                <div className="text-[11px] text-gray-500">Owner setup 01-14 • Staff 17 • Dashboard 18-25</div>
              </div>

              {/* Grouped rendering */}
              {['OWNER SETUP (01-14)', 'STAFF MODULE', 'DASHBOARD (18-25)', 'OWNER DASHBOARD (26)'].map(group => (
                <div key={group} className="p-2">
                  <div className="text-[10px] font-black tracking-widest text-[#ac0053] bg-[#ffd9e1]/40 px-2 py-1 rounded uppercase mb-1">{group}</div>
                  <div className="space-y-0.5">
                    {SCREENS.filter(s => s.group === group).map(screen => (
                      <button
                        key={screen.id}
                        onClick={() => handleSelect(screen.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                          derivedScreen === screen.id
                            ? 'bg-[#ac0053] text-white shadow-sm'
                            : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                            derivedScreen === screen.id ? 'bg-white text-[#ac0053]' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {String(screen.id).padStart(2, '0')}
                          </span>
                          <span className="truncate">{screen.label.replace(/^\d+\s—\s/, '')}</span>
                        </span>
                        {derivedScreen === screen.id && <span className="text-[10px] font-bold opacity-80">● Active</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="p-3 border-t border-gray-100 bg-gray-50/30 text-[10px] text-gray-400 text-center">
                Owner flow: Login → Business Setup → Choose Template → Customize → Preview → Publish • Staff=17 • Dashboard 18-25 • Owner=26
              </div>
            </div>
          )}

          {dropdownOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
          )}
        </div>

        {/* Module switcher - desktop */}
        <div className="hidden lg:flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveModule('wizard')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeModule === 'wizard' ? 'bg-white text-[#ac0053] shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Website Builder
          </button>
          <button
            onClick={() => setActiveModule('staff-management')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeModule === 'staff-management' ? 'bg-white text-[#ac0053] shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Staff
          </button>
          <button
            onClick={() => setActiveModule('dashboard')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeModule === 'dashboard' ? 'bg-white text-[#ac0053] shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Dashboard
          </button>
          <button
            data-testid="topbar-owner-dashboard-btn"
            onClick={() => setActiveModule('owner-dashboard')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeModule === 'owner-dashboard' ? 'bg-white text-[#ac0053] shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <Store className="w-3.5 h-3.5" /> Owner
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <button
          onClick={() => setActiveModule(activeModule === 'wizard' ? 'staff-management' : activeModule === 'staff-management' ? 'dashboard' : activeModule === 'dashboard' ? 'owner-dashboard' : 'wizard')}
          className="lg:hidden text-xs font-semibold text-[#ac0053] bg-[#ffd9e1]/50 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
        >
          {activeModule === 'wizard' ? 'Staff' : activeModule === 'staff-management' ? 'Dashboard' : activeModule === 'dashboard' ? 'Owner' : 'Builder'}
        </button>

        {/* Account — available on every screen */}
        {authLoading ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ac0053]" />
            <span className="hidden sm:inline">Checking...</span>
          </div>
        ) : user ? (
          <div className="flex items-center gap-2">
            <span
              className="hidden lg:inline max-w-[160px] truncate text-xs font-medium text-gray-600"
              title={user.email ?? ''}
            >
              {user.email}
            </span>
            <button
              type="button"
              data-testid="topbar-logout-btn"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Log Out
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="topbar-login-btn"
            onClick={() => openAuth('login')}
            aria-haspopup="dialog"
            className="flex items-center gap-1.5 rounded-lg bg-[#ac0053] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b]"
          >
            <LogIn className="h-3.5 w-3.5" /> Log In
          </button>
        )}

        <div className="hidden md:flex items-center gap-2 text-[#ac0053] text-sm font-medium bg-[#ffd9e1]/30 px-3 py-1.5 rounded-lg border border-[#ffd9e1]/60">
          {saveStatus === 'saving' ? (
            <>
              <Loader2 className="w-4 h-4 text-[#ac0053] animate-spin" />
              <span className="text-xs font-semibold">Saving...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Saved ✓</span>
            </>
          )}
        </div>
        
        {activeModule === 'wizard' && (
          <div className="hidden sm:flex flex-col gap-1.5 items-end">
            <span className="text-xs font-semibold text-gray-500">Step {displayStep} of {totalSteps}</span>
            <div className="w-24 md:w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#ac0053] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
