import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { SalonData, Service, Package, TeamMember, StaffStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import TemplateRenderer from '../components/TemplateRenderer';
import TemplateSelectionDashboard from '../components/TemplateSelectionDashboard';
import TemplateConfigPanel from '../components/TemplateConfigPanel';
import ThemeSwitcher from '../components/ThemeSwitcher';
import OwnerAvatar from '../components/OwnerAvatar';
import { ThemeId } from '../lib/themeServices';
import { applyTemplateConfigToSalon, templateSupportsConfig } from '../lib/templateConfig';
import { SALON_NAME_FONTS, SALON_NAME_COLORS } from '../lib/brandIdentity';
import { BRAND_COLORS, TAGLINE_CATEGORIES, TAGLINE_SUBCATEGORIES } from '../lib/websiteCustomization';
import { useBrandConfig } from '../config/brandConfig';
import { publicWebsiteHref, suggestedWebsiteSlug } from '../lib/publicWebsiteUrl';
import {
  OWNER_ROLES,
  OWNER_PHOTO_ACCEPT,
  getCustomOwnerRoleText,
  getOwnerRoleSelectValue,
  readOwnerPhotoAsDataUrl,
  resolveOwnerRoleFromSelect,
  validateOwnerPhoto,
} from '../lib/ownerProfile';
import { 
  Sparkles, 
  ArrowRight, 
  Check, 
  Copy, 
  ExternalLink, 
  Calendar, 
  Users, 
  ClipboardList, 
  Scissors, 
  CreditCard, 
  Share2, 
  Settings, 
  HelpCircle, 
  Bell, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Shield, 
  RefreshCw, 
  Smartphone, 
  Monitor, 
  ChevronRight, 
  Clock, 
  Star, 
  Phone, 
  Mail, 
  MapPin,
  Laptop,
  QrCode,
  DollarSign,
  TrendingUp,
  Sliders,
  Send,
  MessageSquare,
  Mic,
  Gift,
  Menu,
  Grid,
  Pencil,
  Download,
  Palette,
  ImagePlus,
  Trophy,
  Heart,
  Play,
  Video
} from 'lucide-react';
import { weeklyTopVideos, formatLikeCount, videoLikeBusinessId } from '../lib/videoLikes';
import { openOriginalVideoDestination } from '../lib/originalVideoDestination';
import { normalizeThemeId } from '../lib/themeServices';
import { switchSalonTemplatePresentation } from '../lib/templateConfig';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { resolveBookingActor } from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { bookingBusinessId } from '../lib/siteBookingFlow';
import { useAuth } from '../lib/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { resolveOwnerSalonId } from '../lib/ownerSalon';
import { videoGalleryChrome } from '../lib/siteVideoGalleryI18n';
import { useSiteLocale } from '../components/SiteHeader';

// Owner-only premium panels (screens 23–25) are code-split. They render behind
// `{activeTab === '...'}` guards inside the owner dashboard, so public-site
// visitors — the majority of traffic — never download them.
const BookingManagementPanel = lazy(() => import('../components/BookingManagementPanel'));
const ShareReferralPremium = lazy(() => import('../components/ShareReferralPremium'));
const BrandingWhiteLabel = lazy(() => import('../components/BrandingWhiteLabel'));

// Screen 21 — Payments & Revenue. Extracted into its own module so the owner
// workspace chunk no longer carries every tab's markup.
const PaymentsPanel = lazy(() => import('../components/dashboard/PaymentsPanel'));
// Screen 23 — Salon Settings.
const SettingsPanel = lazy(() => import('../components/dashboard/SettingsPanel'));
// Screen 22 — Share & Referral Marketing.
const SharePanel = lazy(() => import('../components/dashboard/SharePanel'));
// Screen 18 — Dashboard Overview.
const OverviewPanel = lazy(() => import('../components/dashboard/OverviewPanel'));
import type { Appointment as DashboardAppointment } from '../components/dashboard/PaymentsPanel';
import { appointmentTotals } from '../components/dashboard/appointmentTotals';

/** Suspense fallback for the code-split owner panels. */
function PanelFallback() {
  return (
    <div className="py-16 flex items-center justify-center text-sm text-slate-400">
      Loading…
    </div>
  );
}

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  goToStep: (target: number) => void;
  onOpenStaffManagement: () => void;
  forcedActiveTab?: 'overview' | 'website' | 'services' | 'bookings' | 'staff' | 'payments' | 'share' | 'settings' | 'referral' | 'branding';
  onTabChange?: (tab: 'overview' | 'website' | 'services' | 'bookings' | 'staff' | 'payments' | 'share' | 'settings' | 'referral' | 'branding') => void;
  onThemeChange?: (id: ThemeId) => Promise<void> | void;
}

// Appointment rows are shared with the extracted payments tab, so the shape
// now lives in one place rather than being redeclared per module.
type Appointment = DashboardAppointment;

export default function Landing({ data, setData, onNext, goToStep, onOpenStaffManagement, forcedActiveTab, onTabChange, onThemeChange }: Props) {
  const { platform } = useBrandConfig();

  // If not published, render the initial welcome page
  if (data.publishState !== 'published') {
    return (
      <div className="min-h-screen bg-[#fcfbf9] flex flex-col font-sans">
        <header className="h-16 px-6 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2 text-[#ac0053]">
            <Sparkles className="w-6 h-6" />
            <span className="font-semibold text-xl tracking-tight">{platform.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden md:block">Ready to build your digital home?</span>
            <button onClick={onNext} className="bg-[#ac0053] text-white px-5 py-2 rounded-xl font-bold text-xs hover:bg-[#8f0044] transition-all">
              Get Started
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center py-16 px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#ffd9e1] text-[#8f0044] rounded-full text-xs font-bold uppercase tracking-wider mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Builder
            </div>
            
            <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight leading-tight">
              Create Your Salon Website <br />in 15 Simple Steps
            </h1>
            
            <p className="text-sm md:text-base text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
              Experience the power of a fully styled, customizable salon website paired with robust backend booking rules, real-time staff scheduling, and local persistence.
            </p>

            <button 
              onClick={onNext}
              className="bg-[#ac0053] text-white px-8 py-4 rounded-xl font-bold text-sm flex items-center gap-2 mx-auto hover:bg-[#8f0044] transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-98"
            >
              Start Onboarding Wizard
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-12 text-xs text-gray-500 font-semibold">
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#ac0053]" /> Dynamic Scheduling</div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#ac0053]" /> Premium Templates</div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#ac0053]" /> Staff Roster Sync</div>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // --- PUBLISHED DASHBOARD STATE ---
  const [internalTab, setInternalTab] = useState<'overview' | 'website' | 'services' | 'bookings' | 'staff' | 'payments' | 'share' | 'settings' | 'referral' | 'branding'>('overview');
  const activeTab = forcedActiveTab ?? internalTab;
  const setActiveTab = (tab: 'overview' | 'website' | 'services' | 'bookings' | 'staff' | 'payments' | 'share' | 'settings' | 'referral' | 'branding') => {
    if (onTabChange) onTabChange(tab);
    if (!forcedActiveTab) setInternalTab(tab);
  };
  useEffect(() => {
    if (forcedActiveTab) setInternalTab(forcedActiveTab);
  }, [forcedActiveTab]);
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  
  // Local state for appointments to make the dashboard fully dynamic
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: 'a1',
      time: '10:30 AM',
      customerName: 'Neha Sharma',
      phone: '+91 99887 76655',
      serviceId: '2',
      serviceName: 'Nourishing Hair Spa',
      staffId: 't2',
      staffName: 'Ananya Verma',
      price: 900,
      depositPaid: 225,
      status: 'Confirmed'
    },
    {
      id: 'a2',
      time: '12:00 PM',
      customerName: 'Amit Patel',
      phone: '+91 91122 33445',
      serviceId: '1',
      serviceName: 'Haircut & Blow-Dry Styling',
      staffId: 't1',
      staffName: 'Rahul Sharma',
      price: 350,
      depositPaid: 0,
      status: 'Pending'
    },
    {
      id: 'a3',
      time: '02:30 PM',
      customerName: 'Deepika Rao',
      phone: '+91 98888 77777',
      serviceId: '5',
      serviceName: 'HD Bridal Makeup & Styling',
      staffId: 't3',
      staffName: 'Priya Patel',
      price: 4500,
      depositPaid: 1125,
      status: 'Confirmed'
    },
    {
      id: 'a4',
      time: '04:00 PM',
      customerName: 'Vikram Malhotra',
      phone: '+91 96655 44332',
      serviceId: '2',
      serviceName: 'Nourishing Hair Spa',
      staffId: 't4',
      staffName: 'Vikram Singh',
      price: 900,
      depositPaid: 225,
      status: 'Confirmed'
    }
  ]);

  // Modals state
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [showLiveSiteModal, setShowLiveSiteModal] = useState(false);

  // New Appointment Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newSelectedService, setNewSelectedService] = useState(data.services[0]?.id || '');
  const [newSelectedStaff, setNewSelectedStaff] = useState(data.team[0]?.id || '');
  const [newSelectedTime, setNewSelectedTime] = useState('11:00 AM');

  // New Service Form State
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('Hair Styling');
  const [newServicePrice, setNewServicePrice] = useState(400);
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServiceFeatured, setNewServiceFeatured] = useState(false);

  // Advanced Services State
  const [servicesSubTab, setServicesSubTab] = useState<'services' | 'packages'>('services');
  const [servicesSearchQuery, setServicesSearchQuery] = useState('');
  const [servicesSelectedCategory, setServicesSelectedCategory] = useState('All Categories');
  const [servicesViewLayout, setServicesViewLayout] = useState<'list' | 'grid'>('list');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [showServiceDrawer, setShowServiceDrawer] = useState(false);
  const [showPackageDrawer, setShowPackageDrawer] = useState(false);
  const [isImprovingWithAI, setIsImprovingWithAI] = useState(false);

  // New Package Form State
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackagePrice, setNewPackagePrice] = useState(1200);
  const [newPackageDuration, setNewPackageDuration] = useState(60);
  const [newPackageDesc, setNewPackageDesc] = useState('');

  // Voice Quick-Add State
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  // AI Suggestions State
  const [showAiSuggestModal, setShowAiSuggestModal] = useState(false);
  const [aiSuggestArchetype, setAiSuggestArchetype] = useState<'luxury' | 'barber' | 'spa' | 'beauty'>('luxury');
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [generatedSuggestions, setGeneratedSuggestions] = useState<Service[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);

  // Notifications list
  const [notifications, setNotifications] = useState([
    { id: 'n1', text: 'New booking request from Amit Patel', time: '10 mins ago', read: false },
    { id: 'n2', text: 'Advance payment received for Deepika Rao', time: '1 hour ago', read: true },
    { id: 'n3', text: 'Ananya Verma changed status to Available', time: '2 hours ago', read: true }
  ]);

  // Payments tab filters & drawer state

  const liveSlug = suggestedWebsiteSlug(data);
  const liveUrl = publicWebsiteHref(liveSlug, platform.websiteUrl);

  const [polishingField, setPolishingField] = useState<'tagline' | 'about' | 'bio' | null>(null);
  const [polishingStatus, setPolishingStatus] = useState<string>('');
  const ownerPhotoInputRef = useRef<HTMLInputElement>(null);
  const [ownerPhotoError, setOwnerPhotoError] = useState<string | null>(null);
  const [ownerPhotoBusy, setOwnerPhotoBusy] = useState(false);
  const [taglineCategory, setTaglineCategory] = useState('Salon');
  const [taglineSubcategory, setTaglineSubcategory] = useState('Hair Salon');
  const taglineOptions = useMemo(
    () => TAGLINE_CATEGORIES[taglineCategory]?.[taglineSubcategory] || TAGLINE_CATEGORIES.Salon['Hair Salon'],
    [taglineCategory, taglineSubcategory],
  );

  // PHASE 15.9 — Weekly Top Videos (reuse Phase 15.8 engine, strict theme isolation)
  const currentThemeId = normalizeThemeId(data.templateId) as SiteHeaderThemeId;
  const dashboardWeeklyTop = useMemo(() => {
    const businessId = videoLikeBusinessId(data);
    return weeklyTopVideos(businessId, currentThemeId, data, { limit: 6 });
  }, [data, currentThemeId]);

  const locale = useSiteLocale();
  const chrome = videoGalleryChrome(currentThemeId, locale);

  // PHASE 16.7 — booking-management actor: the EXISTING session → ownership
  // chain (useAuth + resolveOwnerSalonId). The panel receives the resolved
  // permission; the data layer re-checks it on every read/mutation. The
  // tenant key is the same bookingBusinessId every booking row was stamped
  // with — never typed in, never taken from the URL.
  const { user: authUser, loading: authLoading } = useAuth();
  const [bookingActor, setBookingActor] = useState<BookingActorContext>(() =>
    resolveBookingActor({ supabaseConfigured: isSupabaseConfigured, userPresent: false, resolution: null }),
  );
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBookingActor(resolveBookingActor({ supabaseConfigured: false, userPresent: false, resolution: null }));
      return;
    }
    if (authLoading) return;
    let cancelled = false;
    resolveOwnerSalonId()
      .then((resolution) => {
        if (cancelled) return;
        setBookingActor(resolveBookingActor({ supabaseConfigured: true, userPresent: !!authUser, resolution }));
      })
      .catch(() => {
        if (cancelled) return;
        setBookingActor(resolveBookingActor({ supabaseConfigured: true, userPresent: !!authUser, resolution: { status: 'error' } }));
      });
    return () => { cancelled = true; };
  }, [authUser, authLoading]);
  const bookingTenantId = bookingBusinessId(data);
  const [bookingToast, setBookingToast] = useState<string | null>(null);
  useEffect(() => {
    if (!bookingToast) return;
    const id = window.setTimeout(() => setBookingToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [bookingToast]);

  const handleOwnerPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    const error = validateOwnerPhoto(file);
    if (error) {
      setOwnerPhotoError(error);
      return;
    }
    setOwnerPhotoBusy(true);
    setOwnerPhotoError(null);
    try {
      const url = await readOwnerPhotoAsDataUrl(file);
      setData(prev => ({ ...prev, ownerPhotoUrl: url }));
    } catch {
      setOwnerPhotoError('Could not read that photo. Try another image.');
    } finally {
      setOwnerPhotoBusy(false);
      if (ownerPhotoInputRef.current) ownerPhotoInputRef.current.value = '';
    }
  };

  const handleRemoveOwnerPhoto = () => {
    setData(prev => ({ ...prev, ownerPhotoUrl: '' }));
    setOwnerPhotoError(null);
    if (ownerPhotoInputRef.current) ownerPhotoInputRef.current.value = '';
  };

  const updateTagline = (tagline: string) => {
    setData(prev => ({
      ...prev,
      tagline,
      reviewedContent: prev.reviewedContent
        ? { ...prev.reviewedContent, tagline }
        : prev.reviewedContent,
    }));
  };

  const handlePolishText = (field: 'tagline' | 'about' | 'bio', tone: 'luxury' | 'modern' | 'warm') => {
    setPolishingField(field);
    setPolishingStatus('🤖 Gemini AI analyzing your request...');
    
    setTimeout(() => {
      setPolishingStatus('🤖 Matching brand archetype and tone...');
    }, 400);

    setTimeout(() => {
      setPolishingStatus('🤖 Perfecting copy structure...');
    }, 800);

    setTimeout(() => {
      let resultText = '';
      if (field === 'tagline') {
        if (tone === 'luxury') resultText = `Experience Premium Hair Artistry & Elite Aesthetic Excellence`;
        else if (tone === 'modern') resultText = `Bespoke Styling, Precision Cuts & Trendsetting Hair Design`;
        else resultText = `Your Sanctuary for Beautiful Hair & Warm, Personal Care`;
        
        updateTagline(resultText);
      } else if (field === 'about') {
        if (tone === 'luxury') resultText = `Welcome to an elevated realm of salon luxury. We blend master techniques, premium formulations, and bespoke styling to craft an unforgettable aesthetic experience customized for your lifestyle.`;
        else if (tone === 'modern') resultText = `We are a high-energy creative collective redefining hair fashion. Specializing in precision styling, multi-dimensional hair coloring, and advanced hair rejuvenation therapies for the modern individual.`;
        else resultText = `Step into a friendly, welcoming neighborhood retreat where your comfort comes first. We focus on attentive, personal styling and gentle treatments that leave you feeling perfectly cared for.`;
        
        setData(prev => ({ ...prev, about: resultText }));
      } else if (field === 'bio') {
        if (tone === 'luxury') resultText = `Dedicated to bespoke hair couture and artistic mentorship. Bringing a decade of luxury salon expertise, our goal is to design highly individualized transformations in an atmosphere of elite comfort.`;
        else if (tone === 'modern') resultText = `Passionate about trend-forward styling and pushing creative boundaries. With 8+ years of technical artistry, we love designing bold, signature hair statements and building inspiring beauty spaces.`;
        else resultText = `With a belief that great hair starts with a great connection. Friendly, expert advice and customized styling designed to fit your day-to-day routine beautifully.`;
        
        setData(prev => ({ 
          ...prev, 
          reviewedContent: { 
            ...(prev.reviewedContent || { heroHeadline: '', tagline: '', about: '', serviceDescriptions: {}, bookingCTA: '' }), 
            ownerIntro: resultText 
          } 
        }));
      }

      setPolishingField(null);
      setPolishingStatus('');
      
      setNotifications(prev => [
        { id: `n-ai-${Date.now()}`, text: `AI updated ${field} with ${tone} style!`, time: 'Just now', read: false },
        ...prev
      ]);
    }, 1200);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://${liveUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const serv = data.services.find(s => s.id === newSelectedService) || data.services[0];
    const provider = data.team.find(t => t.id === newSelectedStaff) || data.team[0];
    const depositPct = 25;
    const price = serv ? serv.price : 400;
    const deposit = Math.round((price * depositPct) / 100);

    const newAppt: Appointment = {
      id: `a-${Date.now()}`,
      time: newSelectedTime,
      customerName: newCustName,
      phone: newCustPhone || '+91 99999 88888',
      serviceId: newSelectedService,
      serviceName: serv ? serv.name : 'Custom Treatment',
      staffId: newSelectedStaff,
      staffName: provider ? provider.name : 'Any Stylist',
      price,
      depositPaid: deposit,
      status: 'Confirmed'
    };

    setAppointments(prev => [newAppt, ...prev]);
    
    // Add a notification
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Appointment scheduled for ${newCustName}`, time: 'Just now', read: false },
      ...prev
    ]);

    // Reset Form
    setNewCustName('');
    setNewCustPhone('');
    setShowNewAppointmentModal(false);
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;

    if (editingService) {
      // Edit mode
      setData(prev => ({
        ...prev,
        services: prev.services.map(s => s.id === editingService.id ? {
          ...s,
          name: newServiceName,
          category: newServiceCategory,
          price: Number(newServicePrice),
          duration: Number(newServiceDuration),
          description: newServiceDesc,
          featured: newServiceFeatured
        } : s)
      }));
      setNotifications(prev => [
        { id: `n-${Date.now()}`, text: `Updated service: ${newServiceName}`, time: 'Just now', read: false },
        ...prev
      ]);
    } else {
      // Add mode
      const newServ: Service = {
        id: `s-${Date.now()}`,
        name: newServiceName,
        category: newServiceCategory,
        price: Number(newServicePrice),
        duration: Number(newServiceDuration),
        description: newServiceDesc || 'Professional treatment tailored for you.',
        featured: newServiceFeatured
      };
      setData(prev => ({
        ...prev,
        services: [...prev.services, newServ]
      }));
      setNotifications(prev => [
        { id: `n-${Date.now()}`, text: `Added new service: ${newServiceName}`, time: 'Just now', read: false },
        ...prev
      ]);
    }

    // Reset and Close
    setNewServiceName('');
    setNewServiceDesc('');
    setNewServiceFeatured(false);
    setEditingService(null);
    setShowServiceDrawer(false);
  };

  const handleDuplicateService = (serv: Service) => {
    const duplicated: Service = {
      ...serv,
      id: `s-${Date.now()}`,
      name: `${serv.name} (Copy)`
    };
    setData(prev => ({
      ...prev,
      services: [...prev.services, duplicated]
    }));
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Duplicated service: ${serv.name}`, time: 'Just now', read: false },
      ...prev
    ]);
  };

  const handleDeleteService = (id: string, name: string) => {
    setData(prev => ({
      ...prev,
      services: prev.services.filter(s => s.id !== id)
    }));
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Removed service: ${name}`, time: 'Just now', read: false },
      ...prev
    ]);
  };

  const handleSavePackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;

    if (editingPackage) {
      setData(prev => ({
        ...prev,
        packages: (prev.packages || []).map(p => p.id === editingPackage.id ? {
          ...p,
          name: newPackageName,
          price: Number(newPackagePrice),
          duration: Number(newPackageDuration),
          description: newPackageDesc
        } : p)
      }));
      setNotifications(prev => [
        { id: `n-${Date.now()}`, text: `Updated package: ${newPackageName}`, time: 'Just now', read: false },
        ...prev
      ]);
    } else {
      const newPkg: Package = {
        id: `pkg-${Date.now()}`,
        name: newPackageName,
        price: Number(newPackagePrice),
        duration: Number(newPackageDuration),
        description: newPackageDesc || 'Professional package combo tailored for you.'
      };
      setData(prev => ({
        ...prev,
        packages: [...(prev.packages || []), newPkg]
      }));
      setNotifications(prev => [
        { id: `n-${Date.now()}`, text: `Added new package: ${newPackageName}`, time: 'Just now', read: false },
        ...prev
      ]);
    }

    setNewPackageName('');
    setNewPackageDesc('');
    setEditingPackage(null);
    setShowPackageDrawer(false);
  };

  const handleDuplicatePackage = (pkg: Package) => {
    const duplicated: Package = {
      ...pkg,
      id: `pkg-${Date.now()}`,
      name: `${pkg.name} (Copy)`
    };
    setData(prev => ({
      ...prev,
      packages: [...(prev.packages || []), duplicated]
    }));
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Duplicated package: ${pkg.name}`, time: 'Just now', read: false },
      ...prev
    ]);
  };

  const handleDeletePackage = (id: string, name: string) => {
    setData(prev => ({
      ...prev,
      packages: (prev.packages || []).filter(p => p.id !== id)
    }));
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Removed package: ${name}`, time: 'Just now', read: false },
      ...prev
    ]);
  };

  const handleImproveDescriptionWithAI = () => {
    if (!newServiceName.trim()) {
      alert('Please enter a service name first so AI can generate a description!');
      return;
    }
    setIsImprovingWithAI(true);
    setTimeout(() => {
      let aiDesc = '';
      const nameLower = newServiceName.toLowerCase();
      if (nameLower.includes('haircut') || nameLower.includes('cut')) {
        aiDesc = 'A bespoke premium haircut tailored specifically to your facial features and hair texture. Includes an indulgent clarifying hair wash, signature scalp massage, and professional blow-dry styling.';
      } else if (nameLower.includes('color') || nameLower.includes('balayage') || nameLower.includes('highlight')) {
        aiDesc = 'Transformative multi-dimensional hair coloring designed by our master colorists. Features custom painted highlights, gentle conditioning glaze treatments, and premium nourishment for radiant longevity.';
      } else if (nameLower.includes('massage') || nameLower.includes('spa')) {
        aiDesc = 'A deeply therapeutic and rejuvenating massage session combining sensory essential oils, gentle pressure, and calming aromatherapy techniques to relieve tension and melt away everyday stress.';
      } else if (nameLower.includes('facial') || nameLower.includes('skin') || nameLower.includes('cleanup')) {
        aiDesc = 'An advanced custom facial treatment that deeply cleanses, gently exfoliates, and intensely hydrates your skin. Formulated with premium botanical extracts and custom massage to restore absolute radiance.';
      } else if (nameLower.includes('shave') || nameLower.includes('beard') || nameLower.includes('groom')) {
        aiDesc = 'A premium hot towel shave and detail beard sculpting. Complete with nourishing luxury beard oil massage, precision line razor finish, and a refreshing face massage.';
      } else {
        aiDesc = `An elite, signature ${newServiceName} session crafted by our certified senior specialists. Utilizing state-of-the-art formulations and personalized care to ensure absolute excellence.`;
      }
      setNewServiceDesc(aiDesc);
      setIsImprovingWithAI(false);
    }, 1000);
  };

  const handleImprovePackageDescWithAI = () => {
    if (!newPackageName.trim()) {
      alert('Please enter a package name first!');
      return;
    }
    setIsImprovingWithAI(true);
    setTimeout(() => {
      let aiDesc = `The ultimate premium bundle combining our signature treatments into one seamless, luxurious experience. Enjoy personalized care, dedicated styling, and premium refreshments during your stay.`;
      setNewPackageDesc(aiDesc);
      setIsImprovingWithAI(false);
    }, 1000);
  };

  const handleParseVoiceCommand = () => {
    if (!voiceInputText.trim()) return;
    
    const text = voiceInputText.toLowerCase();
    
    // 1. Extract Price (numeric value)
    const priceMatch = text.match(/(?:for|at|rs\.?|₹|inr)\s*(\d+)/) || text.match(/(\d+)\s*(?:rupees|inr|rs|bucks)/);
    const price = priceMatch ? Number(priceMatch[1]) : 500;
    
    // 2. Extract Duration (minutes or hours)
    let duration = 45;
    const hourMatch = text.match(/(\d+)\s*(?:hour|hr)/);
    if (hourMatch) {
      duration = Number(hourMatch[1]) * 60;
    } else {
      const minMatch = text.match(/(\d+)\s*(?:min|minute)/);
      if (minMatch) {
        duration = Number(minMatch[1]);
      }
    }
    
    // 3. Extract Category
    let category = 'Hair Styling';
    if (text.includes('spa') || text.includes('massage') || text.includes('therapy')) {
      category = 'Wellness';
    } else if (text.includes('barber') || text.includes('shave') || text.includes('beard')) {
      category = 'Barber';
    } else if (text.includes('color') || text.includes('highlight') || text.includes('dye')) {
      category = 'Hair Coloring';
    } else if (text.includes('cut') || text.includes('trim')) {
      category = 'Haircut';
    } else if (text.includes('facial') || text.includes('skin') || text.includes('makeup') || text.includes('manicure') || text.includes('pedicure') || text.includes('nails')) {
      category = 'Beauty';
    }
    
    // 4. Extract Name
    let name = voiceInputText;
    const separators = [' for ', ' taking ', ' of ', ' costing ', ' with '];
    for (const sep of separators) {
      if (text.includes(sep)) {
        const parts = voiceInputText.split(new RegExp(sep, 'i'));
        if (parts[0].trim()) {
          name = parts[0].trim();
          break;
        }
      }
    }
    
    name = name.replace(/^(add a|add|create a|create)\s+/i, '');
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    const voiceService: Service = {
      id: `s-${Date.now()}`,
      name,
      category,
      price,
      duration,
      description: `Quick-added via Voice command: "${voiceInputText}"`
    };
    
    setData(prev => ({
      ...prev,
      services: [...prev.services, voiceService]
    }));
    
    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Voice Added: ${name} (₹${price})`, time: 'Just now', read: false },
      ...prev
    ]);
    
    setShowVoiceModal(false);
    setVoiceInputText('');
  };

  const handleTriggerSuggestions = (archetype: 'luxury' | 'barber' | 'spa' | 'beauty') => {
    setIsGeneratingSuggestions(true);
    setAiSuggestArchetype(archetype);
    
    setTimeout(() => {
      let suggestions: Service[] = [];
      if (archetype === 'luxury') {
        suggestions = [
          {
            id: `s-sug-${Date.now()}-1`,
            name: 'Signature Balayage & Gloss',
            category: 'Hair Coloring',
            price: 3200,
            duration: 150,
            description: 'Custom multi-dimensional hand-painted highlights with premium tone seal glaze and luxury mask treatment.',
            featured: true
          },
          {
            id: `s-sug-${Date.now()}-2`,
            name: 'Keratin Silk Smoothing Therapy',
            category: 'Treatment',
            price: 4500,
            duration: 180,
            description: 'Intense organic protein restructuring treatment that completely eliminates frizz and restores luminous shine.'
          },
          {
            id: `s-sug-${Date.now()}-3`,
            name: 'Olaplex Bond-Repair Spa',
            category: 'Treatment',
            price: 1500,
            duration: 45,
            description: 'Scientific active bond repair spa to reverse extreme heat and chemical color damage, strengthening core fibers.'
          },
          {
            id: `s-sug-${Date.now()}-4`,
            name: 'Master Precision Hair Sculpture',
            category: 'Haircut',
            price: 850,
            duration: 45,
            description: 'Exquisite custom tailored scissor haircut designed for your facial bone structure and texture profile.'
          }
        ];
      } else if (archetype === 'barber') {
        suggestions = [
          {
            id: `s-sug-${Date.now()}-1`,
            name: 'Royal Charcoal Facial & Hot Towel Shave',
            category: 'Barber',
            price: 750,
            duration: 45,
            description: 'Exfoliating activated charcoal scrub followed by an ultra-smooth warm straight razor shave with essential oil mist.',
            featured: true
          },
          {
            id: `s-sug-${Date.now()}-2`,
            name: 'Elite Beard Sculpting & Straight Razor Line',
            category: 'Barber',
            price: 400,
            duration: 25,
            description: 'Detailed beard scissor tapering, clipper blending, and sharp razor definition with premium sandalwood oil.'
          },
          {
            id: `s-sug-${Date.now()}-3`,
            name: 'Slick Skin Fade & Styling',
            category: 'Barber',
            price: 550,
            duration: 40,
            description: 'Precision zero skin fade or razor taper with custom wash, scalp tonic, and premium matte clay styling.'
          },
          {
            id: `s-sug-${Date.now()}-4`,
            name: 'Scalp Massage & Tonic Energizer',
            category: 'Barber',
            price: 300,
            duration: 15,
            description: 'Invigorating menthol shampoo wash accompanied by a high-pressure hand scalp stimulation and follicle energizer.'
          }
        ];
      } else if (archetype === 'spa') {
        suggestions = [
          {
            id: `s-sug-${Date.now()}-1`,
            name: 'Aromatherapy Balinese Full Body Massage',
            category: 'Wellness',
            price: 2200,
            duration: 60,
            description: 'Deep pressure palm strokes and skin rolling utilizing organic pure lavender and lemongrass oils.',
            featured: true
          },
          {
            id: `s-sug-${Date.now()}-2`,
            name: 'Exfoliating Himalayan Salt Scrub',
            category: 'Wellness',
            price: 1600,
            duration: 45,
            description: 'Mineral-rich rose pink salt body scrub to renew dead cells, finish with lightweight sweet almond hydration.'
          },
          {
            id: `s-sug-${Date.now()}-3`,
            name: 'De-Stress Indian Head Massage',
            category: 'Wellness',
            price: 800,
            duration: 30,
            description: 'Focused pressure point massage on shoulders, neck, and scalp with warm coconut oil to cure insomnia.'
          },
          {
            id: `s-sug-${Date.now()}-4`,
            name: 'Hydrating Botanical Facial',
            category: 'Wellness',
            price: 1800,
            duration: 60,
            description: 'Nourishing custom skincare facial utilizing organic aloe, green tea extracts, and active peptide serum infusion.'
          }
        ];
      } else {
        suggestions = [
          {
            id: `s-sug-${Date.now()}-1`,
            name: 'Luxury Gel Manicure & Custom Extensions',
            category: 'Beauty',
            price: 1900,
            duration: 80,
            description: 'Detailed cuticle care, organic hand massage, protective gel coat, and flawless premium custom extensions.',
            featured: true
          },
          {
            id: `s-sug-${Date.now()}-2`,
            name: 'Classic Pedicure & Softening Soak',
            category: 'Beauty',
            price: 1100,
            duration: 50,
            description: 'Detoxifying lavender milk bath foot soak, callus filing, sea salt scrub, and professional lacquer polish finish.'
          },
          {
            id: `s-sug-${Date.now()}-3`,
            name: 'Brow Tinting & Precision Mapping',
            category: 'Beauty',
            price: 600,
            duration: 25,
            description: 'Perfect geometric brow mapping followed by customized organic tint dye application for thick elegant arches.'
          },
          {
            id: `s-sug-${Date.now()}-4`,
            name: 'Radiant Glow Skin Cleanup',
            category: 'Beauty',
            price: 1200,
            duration: 40,
            description: 'Refreshing facial steam, blackhead extraction, vitamin C mask application, and cooling cucumber spray.'
          }
        ];
      }
      setGeneratedSuggestions(suggestions);
      setSelectedSuggestionIds(suggestions.map(s => s.id));
      setIsGeneratingSuggestions(false);
    }, 1200);
  };

  const handleAddSuggestionsToCatalog = () => {
    const toAdd = generatedSuggestions.filter(s => selectedSuggestionIds.includes(s.id));
    if (toAdd.length === 0) return;

    const withFreshIds = toAdd.map(s => ({
      ...s,
      id: `s-ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    }));

    setData(prev => ({
      ...prev,
      services: [...prev.services, ...withFreshIds]
    }));

    setNotifications(prev => [
      { id: `n-${Date.now()}`, text: `Added ${toAdd.length} suggestions via AI generator!`, time: 'Just now', read: false },
      ...prev
    ]);

    setShowAiSuggestModal(false);
    setGeneratedSuggestions([]);
    setSelectedSuggestionIds([]);
  };

  const handleToggleStaffStatus = (id: string) => {
    const statuses: StaffStatus[] = ['Available', 'Busy', 'On Leave'];
    setData(prev => ({
      ...prev,
      team: prev.team.map(m => {
        if (m.id === id) {
          const currIdx = statuses.indexOf(m.status || 'Available');
          const nextStatus = statuses[(currIdx + 1) % statuses.length];
          return { ...m, status: nextStatus };
        }
        return m;
      })
    }));
  };

  const handleUpdateApptStatus = (apptId: string, nextStatus: 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled') => {
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: nextStatus } : a));
  };

  const handleDeleteAppt = (apptId: string) => {
    setAppointments(prev => prev.filter(a => a.id !== apptId));
  };

  // Dynamic statistics calculation. Shared with the extracted payments tab so
  // both surfaces always report identical figures.
  const { totalBookingsValue, totalAdvanceCollected, totalRemainingAtSalon } =
    appointmentTotals(appointments);

  const activeServicesCount = data.services.length;
  const staffTeamCount = data.team.length;
  const todayActiveBookings = appointments.filter(a => a.status !== 'Cancelled').length;

  return (
    <div className="h-full w-full bg-[#f9f8f6] flex flex-col md:flex-row font-sans text-gray-900 overflow-hidden relative min-h-0">
      
      {/* LEFT SIDEBAR: Premium Docked Menu */}
      <nav className="hidden md:flex flex-col h-full w-64 shrink-0 bg-white border-r border-gray-200 py-6 z-30 select-none shadow-xs justify-between overflow-y-auto">
        <div>
          <div className="px-6 mb-6">
            <div className="flex items-center gap-2 text-[#ac0053] mb-1">
              <Sparkles className="w-5 h-5" />
              <span className="font-extrabold text-lg tracking-tight">{platform.name} Salon</span>
            </div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
              Premium Dashboard
            </p>
          </div>

          <div className="px-4 mb-6">
            <button 
              onClick={() => setShowNewAppointmentModal(true)}
              className="w-full bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm shadow-[#ac0053]/20"
            >
              <Plus className="w-4 h-4" />
              New Appointment
            </button>
          </div>

          <ul className="flex flex-col gap-1 px-3">
            <li>
              <button 
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'overview' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <ClipboardList className="w-4.5 h-4.5" />
                <span>Overview</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('website')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'website' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Laptop className="w-4.5 h-4.5" />
                <span>My Live Website</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('services')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'services' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Scissors className="w-4.5 h-4.5" />
                <span>Services & Catalog</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('bookings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'bookings' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Calendar className="w-4.5 h-4.5" />
                <span>Daily Planner</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('staff')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'staff' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Users className="w-4.5 h-4.5" />
                <span>Staff Roster</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('payments')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'payments' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <CreditCard className="w-4.5 h-4.5" />
                <span>Payments Ledgers</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('share')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'share' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Share2 className="w-4.5 h-4.5" />
                <span>Share & Marketing</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'settings' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Settings className="w-4.5 h-4.5" />
                <span>Salon Rules</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('referral')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'referral' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Gift className="w-4.5 h-4.5" />
                <span>Refer & Earn</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('branding')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-semibold text-xs ${
                  activeTab === 'branding' 
                    ? 'text-[#ac0053] bg-[#ffd9e1]/30 font-bold border-l-4 border-[#ac0053] pl-3' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Palette className="w-4.5 h-4.5" />
                <span>Branding</span>
              </button>
            </li>
          </ul>
        </div>

        <div className="px-4">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Onboarding Wizard</p>
            <button 
              onClick={() => goToStep(2)} 
              className="text-[#ac0053] hover:underline text-[11px] font-bold block mx-auto"
            >
              Re-run Onboarding
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN LAYOUT: Top navbar + scrollable dynamic center viewport */}
      <div className="flex-1 flex flex-col overflow-hidden h-full min-w-0 min-h-0">
        
        {/* TOP BAR GREETING & VIEW SITE BUTTON */}
        <header className="h-16 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between px-6 z-10 shadow-2xs">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-gray-700" onClick={() => setActiveTab('overview')}>
              <Sparkles className="w-6 h-6 text-[#ac0053]" />
            </button>
            <div>
              <h2 className="text-sm font-extrabold text-gray-900 md:text-base tracking-tight flex items-center gap-1.5">
                Good morning, {data.ownerName || 'Partner'}
                <span className="animate-bounce inline-block">👋</span>
              </h2>
              <p className="text-[10px] md:text-xs text-gray-400 font-semibold uppercase tracking-wider">{data.salonName || 'Your Salon'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowLiveSiteModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-1.5 border border-[#ac0053]/20 rounded-xl text-xs font-bold text-[#ac0053] hover:bg-[#ffd9e1]/20 transition-all shadow-3xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Live Website
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full"></span>
                )}
              </button>

              {/* Notifications dropdown menu */}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 z-50 text-xs"
                  >
                    <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-2">
                      <h4 className="font-bold text-gray-900 text-sm">Notifications</h4>
                      <button 
                        onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                        className="text-xs text-[#ac0053] hover:underline"
                      >
                        Mark all as read
                      </button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {notifications.map(n => (
                        <div key={n.id} className={`p-2 rounded-xl border ${n.read ? 'bg-white border-gray-100' : 'bg-[#ffd9e1]/10 border-[#ac0053]/20'}`}>
                          <p className={`text-gray-800 ${!n.read ? 'font-semibold' : 'font-medium'}`}>{n.text}</p>
                          <span className="text-[10px] text-gray-400 font-semibold">{n.time}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={() => setShowHelpCenter(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200">
              <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-[10px]" alt="Profile" />
            </div>
          </div>
        </header>

        {/* VIEWPORT CONTENT CONTAINER */}
        <div 
          className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          
          {/* MOBILE NAVIGATION PILLS */}
          <div className="flex md:hidden bg-white p-1 rounded-xl border border-gray-200 overflow-x-auto gap-1 mb-4 shrink-0 no-scrollbar">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'overview' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('website')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'website' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Live Website
            </button>
            <button 
              onClick={() => setActiveTab('services')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'services' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Services
            </button>
            <button 
              onClick={() => setActiveTab('bookings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'bookings' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Planner
            </button>
            <button 
              onClick={() => setActiveTab('staff')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'staff' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Staff
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'payments' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Payments
            </button>
            <button 
              onClick={() => setActiveTab('share')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'share' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Share
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'settings' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Settings
            </button>
            <button 
              onClick={() => setActiveTab('referral')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'referral' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Refer & Earn
            </button>
            <button 
              onClick={() => setActiveTab('branding')}
              className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                activeTab === 'branding' ? 'bg-[#ac0053] text-white' : 'text-gray-500'
              }`}
            >
              Branding
            </button>
          </div>

          <AnimatePresence mode="wait">
            
            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
              <Suspense fallback={<PanelFallback />}>
                <OverviewPanel
                  data={data}
                  appointments={appointments}
                  dashboardWeeklyTop={dashboardWeeklyTop}
                  totalBookingsValue={totalBookingsValue}
                  totalAdvanceCollected={totalAdvanceCollected}
                  totalRemainingAtSalon={totalRemainingAtSalon}
                  activeServicesCount={activeServicesCount}
                  liveUrl={liveUrl}
                  copied={copied}
                  onCopyLink={handleCopyLink}
                  chrome={chrome}
                  onDeleteAppointment={handleDeleteAppt}
                  onToggleStaffStatus={handleToggleStaffStatus}
                  onUpdateAppointmentStatus={handleUpdateApptStatus}
                  goToStep={goToStep}
                  setActiveTab={setActiveTab}
                  onOpenStaffManagement={onOpenStaffManagement}
                  setEditingService={setEditingService}
                  setNewServiceName={setNewServiceName}
                  setNewServiceCategory={setNewServiceCategory}
                  setNewServicePrice={setNewServicePrice}
                  setNewServiceDuration={setNewServiceDuration}
                  setNewServiceDesc={setNewServiceDesc}
                  setNewServiceFeatured={setNewServiceFeatured}
                  setShowNewAppointmentModal={setShowNewAppointmentModal}
                  setShowServiceDrawer={setShowServiceDrawer}
                />
              </Suspense>
            )}

            {/* TAB: WEBSITE CONTENT MANAGER */}
            {activeTab === 'website' && (
              <motion.div 
                key="website"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-7xl mx-auto"
              >
                {/* Header Banner */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#ffd9e1]/50 text-[#ac0053]">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm">Website Content Manager</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Fine-tune your brand's public narrative. Changes auto-save in real-time and update your active live website instantly.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Auto-Saving Active
                    </span>
                  </div>
                </div>

                {/* Template Selection Dashboard Component */}
                <TemplateSelectionDashboard data={data} setData={setData} onSave={(msg) => console.log(msg)} onThemeChange={onThemeChange} />
                <TemplateConfigPanel data={data} setData={setData} />

                {/* Left - Right Grid Split */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: Form Controls (7 cols on xl) */}
                  <div className="xl:col-span-7 space-y-6">
                    
                    {/* CARD 1: Business Profile & About */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-3xs space-y-5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[#ac0053]" />
                          <h4 className="font-bold text-gray-900 text-sm">Business & About Info</h4>
                        </div>
                        <span className="text-[10px] bg-[#ffd9e1]/40 text-[#ac0053] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Public website sections</span>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Salon Name</label>
                          <input 
                            type="text" 
                            value={data.salonName}
                            onChange={(e) => setData(prev => ({ ...prev, salonName: e.target.value }))}
                            placeholder="Enter salon name"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20"
                          />
                        </div>

                        {/* Brand Identity — Salon Name Font & Text Color */}
                        <div className="rounded-xl border border-[#ffd9e1]/60 bg-[#ffd9e1]/10 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4 text-[#ac0053]" />
                            <h5 className="text-[11px] font-extrabold text-gray-800 uppercase tracking-wider">Salon Name Style</h5>
                            <span className="text-[9px] bg-[#ffd9e1]/40 text-[#ac0053] px-2 py-0.5 rounded font-bold uppercase tracking-wider ml-auto">Live preview</span>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Font Style</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {SALON_NAME_FONTS.map(font => {
                                const isSelected = data.salonNameFont === font.id;
                                return (
                                  <button
                                    key={font.id}
                                    type="button"
                                    onClick={() => setData(prev => applyTemplateConfigToSalon(prev, { salonNameFont: font.id }))}
                                    className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                                      isSelected ? 'border-[#ac0053] bg-[#ffd9e1]/20 shadow-xs' : 'border-gray-200 bg-white hover:border-[#ac0053]/40'
                                    }`}
                                  >
                                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">{font.label}</span>
                                    <span className="block text-sm truncate text-gray-800" style={{ fontFamily: font.fontFamily, fontWeight: font.fontWeight, letterSpacing: font.letterSpacing, textTransform: font.textTransform }}>
                                      {(data.salonName || 'My Salon').slice(0, 20)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Text Color</label>
                            <div className="flex flex-wrap gap-2 items-center">
                              {SALON_NAME_COLORS.map(color => {
                                const isSelected = (data.salonNameColor || '') === color.value;
                                return (
                                  <button
                                    key={color.value}
                                    type="button"
                                    title={color.label}
                                    aria-label={`Select ${color.label} salon name color`}
                                    onClick={() => setData(prev => applyTemplateConfigToSalon(prev, { salonNameColor: color.value }))}
                                    className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${isSelected ? 'ring-2 ring-offset-2 ring-[#ffb1c4] border-white' : 'border-transparent'}`}
                                    style={{ backgroundColor: color.value }}
                                  />
                                );
                              })}
                              <span className="text-[10px] font-semibold text-gray-400">
                                {SALON_NAME_COLORS.find(c => c.value === data.salonNameColor)?.label || 'Theme default'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Brand Color</label>
                            <div className="flex flex-wrap gap-2 items-center">
                              {BRAND_COLORS.map(color => {
                                const isSelected = (data.brandColor || '#ac0053') === color.value;
                                return (
                                  <button
                                    key={color.value}
                                    type="button"
                                    title={color.name}
                                    aria-label={`Select ${color.name} brand color`}
                                    onClick={() => setData(prev => applyTemplateConfigToSalon(prev, { accentColor: color.value }))}
                                    className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${isSelected ? 'ring-2 ring-offset-2 ring-[#ffb1c4] border-white' : 'border-transparent'}`}
                                    style={{ backgroundColor: color.value }}
                                  />
                                );
                              })}
                              <span className="text-[10px] font-semibold text-gray-400">
                                {BRAND_COLORS.find(c => c.value === data.brandColor)?.name || `${platform.name} Pink`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Tagline / Hero Headline</label>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={taglineCategory}
                                onChange={e => {
                                  const next = e.target.value;
                                  setTaglineCategory(next);
                                  setTaglineSubcategory(TAGLINE_SUBCATEGORIES[next][0]);
                                }}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                              >
                                {Object.keys(TAGLINE_CATEGORIES).map(category => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                              </select>
                              <select
                                value={taglineSubcategory}
                                onChange={e => setTaglineSubcategory(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                              >
                                {TAGLINE_SUBCATEGORIES[taglineCategory].map(subcategory => (
                                  <option key={subcategory} value={subcategory}>{subcategory}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              {taglineOptions.map(option => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => updateTagline(option)}
                                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                                    data.tagline === option
                                      ? 'border-[#ac0053] bg-[#ffd9e1]/30 text-[#ac0053] font-bold'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-[#ac0053]'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            <input 
                              type="text" 
                              value={data.tagline}
                              onChange={(e) => updateTagline(e.target.value)}
                              placeholder="Or write your own tagline"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                            />
                            
                            {/* Tagline AI Polish bar */}
                            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100">
                              <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 shrink-0"><Sparkles className="w-3.5 h-3.5 text-[#ac0053]" /> AI Tagline Polish:</span>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('tagline', 'luxury')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                👑 Luxury Tone
                              </button>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('tagline', 'modern')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                ⚡ Bold Modern
                              </button>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('tagline', 'warm')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                🌸 Warm & Cozy
                              </button>
                            </div>
                            
                            {/* Progress Feedback */}
                            {polishingField === 'tagline' && (
                              <div className="text-[10px] font-bold text-[#ac0053] flex items-center gap-2 px-1">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                {polishingStatus}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">About Salon Description</label>
                          <div className="space-y-2">
                            <textarea 
                              rows={4}
                              value={data.about}
                              onChange={(e) => setData(prev => ({ ...prev, about: e.target.value }))}
                              placeholder="Write a brief overview of what makes your salon exceptional..."
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] resize-none"
                            />

                            {/* About AI Polish bar */}
                            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100">
                              <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 shrink-0"><Sparkles className="w-3.5 h-3.5 text-[#ac0053]" /> AI About Polish:</span>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('about', 'luxury')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                👑 Luxury Tone
                              </button>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('about', 'modern')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                ⚡ Bold Modern
                              </button>
                              <button 
                                type="button"
                                onClick={() => handlePolishText('about', 'warm')}
                                className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                              >
                                🌸 Warm & Cozy
                              </button>
                            </div>

                            {/* Progress Feedback */}
                            {polishingField === 'about' && (
                              <div className="text-[10px] font-bold text-[#ac0053] flex items-center gap-2 px-1">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                {polishingStatus}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: Owner/Founder Profile */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-3xs space-y-5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#ac0053]" />
                          <h4 className="font-bold text-gray-900 text-sm">Owner & Founder Profile</h4>
                        </div>
                        <span className="text-[10px] bg-[#ffd9e1]/40 text-[#ac0053] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Dynamic signature banner</span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Owner Photo <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span></label>
                        <input
                          ref={ownerPhotoInputRef}
                          type="file"
                          accept={OWNER_PHOTO_ACCEPT}
                          className="hidden"
                          onChange={e => handleOwnerPhotoFile(e.target.files?.[0])}
                        />
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#ffd9e1] shrink-0 bg-gray-50">
                            <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-lg" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => ownerPhotoInputRef.current?.click()}
                                disabled={ownerPhotoBusy}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-700 hover:border-[#ac0053] hover:text-[#ac0053] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                              >
                                <ImagePlus className="w-3.5 h-3.5" />
                                {ownerPhotoBusy ? 'Uploading…' : data.ownerPhotoUrl ? 'Change Photo' : 'Add Photo'}
                              </button>
                              {data.ownerPhotoUrl && (
                                <button
                                  type="button"
                                  onClick={handleRemoveOwnerPhoto}
                                  disabled={ownerPhotoBusy}
                                  className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1.5">JPG, PNG, WEBP or GIF · max 2MB</p>
                            {ownerPhotoError && (
                              <p className="text-[11px] text-red-600 font-semibold mt-1">{ownerPhotoError}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Owner / Founder Name</label>
                          <input 
                            type="text" 
                            value={data.ownerName}
                            onChange={(e) => setData(prev => ({ ...prev, ownerName: e.target.value }))}
                            placeholder="e.g. Rahul Sharma"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Professional Role <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span></label>
                          <select
                            value={getOwnerRoleSelectValue(data.ownerRole)}
                            onChange={(e) => setData(prev => ({ ...prev, ownerRole: resolveOwnerRoleFromSelect(e.target.value, prev.ownerRole) }))}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                          >
                            <option value="">Select role</option>
                            {OWNER_ROLES.map(role => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          {getOwnerRoleSelectValue(data.ownerRole) === 'Other' && (
                            <input
                              type="text"
                              value={getCustomOwnerRoleText(data.ownerRole)}
                              onChange={(e) => setData(prev => ({ ...prev, ownerRole: e.target.value.trim() ? e.target.value : 'Other' }))}
                              placeholder="Enter your role"
                              className="w-full mt-2 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Owner Personal Message / Biography</label>
                        <div className="space-y-2">
                          <textarea 
                            rows={3}
                            value={data.reviewedContent?.ownerIntro || ""}
                            onChange={(e) => setData(prev => ({ 
                              ...prev, 
                              reviewedContent: { 
                                ...(prev.reviewedContent || { heroHeadline: "", tagline: "", about: "", serviceDescriptions: {}, bookingCTA: "" }), 
                                ownerIntro: e.target.value 
                              } 
                            }))}
                            placeholder="e.g. We believe in personalized artistry and exceptional client care..."
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] resize-none"
                          />

                          {/* Owner Bio AI Polish bar */}
                          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 shrink-0"><Sparkles className="w-3.5 h-3.5 text-[#ac0053]" /> AI Bio Enhancer:</span>
                            <button 
                              type="button"
                              onClick={() => handlePolishText('bio', 'luxury')}
                              className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                            >
                              👑 Luxury Tone
                            </button>
                            <button 
                              type="button"
                              onClick={() => handlePolishText('bio', 'modern')}
                              className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                            >
                              ⚡ Bold Modern
                            </button>
                            <button 
                              type="button"
                              onClick={() => handlePolishText('bio', 'warm')}
                              className="text-[9px] font-bold bg-white border border-gray-200 text-gray-700 hover:text-[#ac0053] px-2 py-1 rounded-lg hover:border-[#ffd9e1] transition-all cursor-pointer"
                            >
                              🌸 Warm & Cozy
                            </button>
                          </div>

                          {/* Progress Feedback */}
                          {polishingField === 'bio' && (
                            <div className="text-[10px] font-bold text-[#ac0053] flex items-center gap-2 px-1">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              {polishingStatus}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CARD 3: Photos & Gallery presets */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-3xs space-y-5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-[#ac0053]" />
                          <h4 className="font-bold text-gray-900 text-sm">Photos & Appearance Settings</h4>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {/* Custom Hero Cover URL */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Hero Cover Image URL</label>
                          <input 
                            type="text" 
                            value={data.heroImageUrl}
                            onChange={(e) => setData(prev => ({ ...prev, heroImageUrl: e.target.value }))}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-mono text-gray-600 focus:border-[#ac0053]"
                          />
                        </div>

                        {/* Interactive presets display */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Select Hero Preset Theme Photo</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              {
                                title: 'Elegant Salon',
                                url: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=1000&auto=format&fit=crop',
                              },
                              {
                                title: 'Modern Barber',
                                url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1000&auto=format&fit=crop',
                              },
                              {
                                title: 'Luxury Chic',
                                url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop',
                              },
                              {
                                title: 'Warm Sanctuary',
                                url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=1000&auto=format&fit=crop',
                              }
                            ].map((preset, idx) => {
                              const isSelected = data.heroImageUrl === preset.url;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setData(prev => ({ ...prev, heroImageUrl: preset.url }))}
                                  className={`relative aspect-video rounded-xl overflow-hidden border-2 text-left transition-all group ${
                                    isSelected ? 'border-[#ac0053] shadow-md scale-102' : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <img 
                                    src={preset.url} 
                                    alt={preset.title} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/45 flex items-end p-1.5">
                                    <span className="text-[9px] font-extrabold text-white truncate w-full">{preset.title}</span>
                                  </div>
                                  {isSelected && (
                                    <span className="absolute top-1.5 right-1.5 bg-[#ac0053] text-white p-0.5 rounded-full shadow">
                                      <Check className="w-2.5 h-2.5" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Position and Appearance */}
                        <div className="grid grid-cols-2 gap-4">
                          {templateSupportsConfig(data.templateId, 'heroPosition') && (
                            <div>
                              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Cover Image Alignment</label>
                              <select
                                value={data.heroPosition || 'Center'}
                                onChange={(e) => setData(prev => applyTemplateConfigToSalon(prev, {
                                  heroPosition: e.target.value as 'Top' | 'Center' | 'Bottom',
                                }))}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                              >
                                <option value="Top">Top aligned</option>
                                <option value="Center">Center aligned</option>
                                <option value="Bottom">Bottom aligned</option>
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Brand Logo URL</label>
                            <input 
                              type="text" 
                              value={data.logoUrl || ''}
                              onChange={(e) => setData(prev => ({ ...prev, logoUrl: e.target.value }))}
                              placeholder="e.g. Leave blank for default icon"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Shortcut Buttons Card */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-3">
                      <h4 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-widest">Other Design Shortcuts</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button 
                          type="button"
                          onClick={() => setActiveTab('services')}
                          className="px-4 py-3 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-left hover:shadow-2xs transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div>
                            <p className="text-xs font-bold text-gray-800">Edit Services Menu</p>
                            <p className="text-[10px] text-gray-400 font-semibold">{data.services.length} active treatments</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </button>
                        
                        <button 
                          type="button"
                          onClick={onOpenStaffManagement}
                          className="px-4 py-3 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-left hover:shadow-2xs transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div>
                            <p className="text-xs font-bold text-gray-800">Manage Staff Team</p>
                            <p className="text-[10px] text-gray-400 font-semibold">{data.team.length} specialists syncd</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </button>

                        <button 
                          type="button"
                          onClick={() => setActiveTab('settings')}
                          className="px-4 py-3 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-left hover:shadow-2xs transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div>
                            <p className="text-xs font-bold text-gray-800">Booking & Pay Rules</p>
                            <p className="text-[10px] text-gray-400 font-semibold">{25}% advance deposit</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Dynamic Live Preview Sticky Sandbox (5 cols on xl) */}
                  <div className="xl:col-span-5 space-y-4 xl:sticky xl:top-6">
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wider">Live Sandbox Preview</h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <ThemeSwitcher 
                          variant="minimal"
                          currentTheme={normalizeThemeId(data.templateId)} 
                          onThemeChange={(id) => onThemeChange ? onThemeChange(id) : setData(prev => switchSalonTemplatePresentation(prev, id))}
                        />

                        <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setMode('desktop')}
                          className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                            mode === 'desktop' ? 'bg-white text-gray-950 shadow-3xs' : 'text-gray-400'
                          }`}
                        >
                          <Monitor className="w-3.5 h-3.5" /> Desktop
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('mobile')}
                          className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                            mode === 'mobile' ? 'bg-white text-gray-950 shadow-3xs' : 'text-gray-400'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" /> Mobile
                        </button>
                      </div>
                    </div>
                  </div>

                    {/* Actual iframe/rendering sandbox box */}
                    <div className="bg-gray-100 rounded-3xl p-3 border border-gray-200/80 shadow-lg relative overflow-hidden flex justify-center items-center" style={{ minHeight: '620px' }}>
                      <div className="w-full h-[600px] rounded-2xl overflow-hidden relative border border-gray-200/60 shadow-inner">
                        <TemplateRenderer data={data} mode={mode} renderMode="owner-preview" />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs text-center">
                      <button 
                        type="button"
                        onClick={() => setShowLiveSiteModal(true)}
                        className="text-xs font-bold text-[#ac0053] hover:text-[#ba005b] inline-flex items-center gap-1 bg-[#ffd9e1]/40 hover:bg-[#ffd9e1]/60 px-4 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Fullscreen Interactive Mode
                      </button>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* TAB: SERVICES & CATALOG */}
            {activeTab === 'services' && (
              <motion.div 
                key="services"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-7xl mx-auto"
              >
                {/* 1. Header & Quick Actions Bar */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-3xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#ffd9e1]/50 text-[#ac0053]">
                        <Scissors className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm">Services & Catalog Manager</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Configure your treatment offerings and high-value package combos. Updates instantly sync to your public live booking site.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button 
                      onClick={() => {
                        setShowVoiceModal(true);
                        setIsVoiceListening(false);
                      }}
                      className="px-4 py-2 border border-[#ffd9e1] bg-[#ffd9e1]/20 hover:bg-[#ffd9e1]/40 text-[#ac0053] font-bold text-xs rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                    >
                      <Mic className="w-4 h-4 text-[#ac0053]" />
                      Voice Quick-Add
                    </button>
                    <button 
                      onClick={() => setShowAiSuggestModal(true)}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                      AI Suggest Ideas
                    </button>
                    <button 
                      onClick={() => {
                        if (servicesSubTab === 'services') {
                          setEditingService(null);
                          setNewServiceName('');
                          setNewServiceCategory('Hair Styling');
                          setNewServicePrice(400);
                          setNewServiceDuration(30);
                          setNewServiceDesc('');
                          setNewServiceFeatured(false);
                          setShowServiceDrawer(true);
                        } else {
                          setEditingPackage(null);
                          setNewPackageName('');
                          setNewPackagePrice(1200);
                          setNewPackageDuration(60);
                          setNewPackageDesc('');
                          setShowPackageDrawer(true);
                        }
                      }}
                      className="px-4 py-2 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-[#ac0053]/20"
                    >
                      <Plus className="w-4 h-4" />
                      {servicesSubTab === 'services' ? 'Add Service' : 'Add Package'}
                    </button>
                  </div>
                </div>

                {/* 2. Dynamic Summary Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 border border-gray-100">
                      <Scissors className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Services</p>
                      <p className="text-lg font-extrabold text-gray-900 mt-0.5">{data.services.length}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100">
                      <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Featured Items</p>
                      <p className="text-lg font-extrabold text-gray-900 mt-0.5">{data.services.filter(s => s.featured).length}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500 border border-purple-100">
                      <Gift className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Combo Packages</p>
                      <p className="text-lg font-extrabold text-gray-900 mt-0.5">{data.packages ? data.packages.length : 0}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100">
                      <span className="text-lg font-black text-emerald-600">₹</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Average Price</p>
                      <p className="text-lg font-extrabold text-gray-900 mt-0.5">
                        ₹{data.services.length > 0 ? Math.round(data.services.reduce((acc, s) => acc + s.price, 0) / data.services.length) : 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Catalog Controls Sub-Bar */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-3xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                  {/* Left: Tab Switcher (Services vs Packages) */}
                  <div className="flex p-1 bg-gray-100/80 border border-gray-200 rounded-xl max-w-xs">
                    <button
                      onClick={() => setServicesSubTab('services')}
                      className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                        servicesSubTab === 'services' 
                          ? 'bg-white text-gray-900 shadow-3xs' 
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Services Catalog ({data.services.length})
                    </button>
                    <button
                      onClick={() => setServicesSubTab('packages')}
                      className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                        servicesSubTab === 'packages' 
                          ? 'bg-white text-gray-900 shadow-3xs' 
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Package Combos ({data.packages ? data.packages.length : 0})
                    </button>
                  </div>

                  {/* Right: Dynamic Search & Filter */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-grow md:justify-end max-w-2xl">
                    <div className="relative flex-grow">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                      <input 
                        type="text"
                        value={servicesSearchQuery}
                        onChange={(e) => setServicesSearchQuery(e.target.value)}
                        placeholder={servicesSubTab === 'services' ? "Search services..." : "Search packages..."}
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/10"
                      />
                      {servicesSearchQuery && (
                        <button 
                          onClick={() => setServicesSearchQuery('')}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {servicesSubTab === 'services' && (
                      <select
                        value={servicesSelectedCategory}
                        onChange={(e) => setServicesSelectedCategory(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold outline-none"
                      >
                        <option value="All Categories">All Categories</option>
                        {Array.from(new Set(data.services.map(s => s.category))).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}

                    {/* Grid vs List layout buttons */}
                    <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200 shrink-0">
                      <button 
                        onClick={() => setServicesViewLayout('list')}
                        className={`p-1.5 rounded-lg ${servicesViewLayout === 'list' ? 'bg-white text-gray-900 shadow-3xs' : 'text-gray-400 hover:text-gray-700'}`}
                        title="List View"
                      >
                        <Menu className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setServicesViewLayout('grid')}
                        className={`p-1.5 rounded-lg ${servicesViewLayout === 'grid' ? 'bg-white text-gray-900 shadow-3xs' : 'text-gray-400 hover:text-gray-700'}`}
                        title="Grid View"
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Filtered Content Lists */}
                {servicesSubTab === 'services' ? (
                  // SERVICES VIEW
                  <div>
                    {data.services.filter(s => {
                      const matchesSearch = s.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                                            s.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                      const matchesCategory = servicesSelectedCategory === 'All Categories' || s.category === servicesSelectedCategory;
                      return matchesSearch && matchesCategory;
                    }).length === 0 ? (
                      // Empty Filter State
                      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-3xs max-w-xl mx-auto space-y-4">
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mx-auto border border-gray-100">
                          <Scissors className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-gray-800 text-sm">No Matching Services Found</h4>
                          <p className="text-xs text-gray-400 mt-1">Try relaxing your search terms or generate catalog items instantly using our AI Ideas engine.</p>
                        </div>
                        <div className="flex gap-2 justify-center pt-2">
                          <button 
                            onClick={() => {
                              setServicesSearchQuery('');
                              setServicesSelectedCategory('All Categories');
                            }}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all"
                          >
                            Clear Filters
                          </button>
                          <button 
                            onClick={() => setShowAiSuggestModal(true)}
                            className="px-4 py-2 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs rounded-xl transition-all"
                          >
                            Generate Services with AI
                          </button>
                        </div>
                      </div>
                    ) : servicesViewLayout === 'list' ? (
                      // Table List View
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-3xs overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest bg-gray-50/60 select-none">
                              <th className="py-3 px-6 w-10"></th>
                              <th className="py-3 px-6">Service Name & Info</th>
                              <th className="py-3 px-6">Category</th>
                              <th className="py-3 px-6">Duration</th>
                              <th className="py-3 px-6">Price</th>
                              <th className="py-3 px-6">Status</th>
                              <th className="py-3 px-6 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.services
                              .filter(s => {
                                const matchesSearch = s.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                                                      s.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                                const matchesCategory = servicesSelectedCategory === 'All Categories' || s.category === servicesSelectedCategory;
                                return matchesSearch && matchesCategory;
                              })
                              .map(serv => (
                                <tr key={serv.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
                                  <td className="py-4 px-6 text-center">
                                    <div className="text-gray-300 cursor-grab active:cursor-grabbing">
                                      <span className="material-symbols-outlined text-base">drag_indicator</span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-6">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-900">{serv.name}</span>
                                      {serv.featured && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] bg-amber-50 text-amber-700 font-extrabold px-1.5 py-0.5 rounded-md border border-amber-200">
                                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Featured
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-md font-semibold">{serv.description}</p>
                                  </td>
                                  <td className="py-4 px-6">
                                    <span className="text-[10px] font-extrabold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg uppercase tracking-wide border border-gray-200/50">
                                      {serv.category}
                                    </span>
                                  </td>
                                  <td className="py-4 px-6">
                                    <span className="text-xs font-bold text-gray-500 inline-flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      {serv.duration} mins
                                    </span>
                                  </td>
                                  <td className="py-4 px-6 text-xs font-extrabold text-gray-900">₹{serv.price}</td>
                                  <td className="py-4 px-6">
                                    <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100">
                                      Active
                                    </span>
                                  </td>
                                  <td className="py-4 px-6 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => {
                                          setEditingService(serv);
                                          setNewServiceName(serv.name);
                                          setNewServiceCategory(serv.category);
                                          setNewServicePrice(serv.price);
                                          setNewServiceDuration(serv.duration);
                                          setNewServiceDesc(serv.description);
                                          setNewServiceFeatured(!!serv.featured);
                                          setShowServiceDrawer(true);
                                        }}
                                        className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"
                                        title="Edit Service"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => handleDuplicateService(serv)}
                                        className="p-1 text-gray-400 hover:text-[#ac0053] hover:bg-[#ffd9e1]/20 rounded-md transition-all"
                                        title="Duplicate Service"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteService(serv.id, serv.name)}
                                        className="p-1 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all"
                                        title="Delete Service"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      // Grid Cards View
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {data.services
                          .filter(s => {
                            const matchesSearch = s.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                                                  s.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                            const matchesCategory = servicesSelectedCategory === 'All Categories' || s.category === servicesSelectedCategory;
                            return matchesSearch && matchesCategory;
                          })
                          .map(serv => (
                            <div 
                              key={serv.id}
                              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-3xs flex flex-col justify-between hover:shadow-md transition-all group relative overflow-hidden"
                            >
                              <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <span className="text-[10px] font-extrabold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full uppercase tracking-wide border border-gray-200/50">
                                    {serv.category}
                                  </span>
                                  {serv.featured && (
                                    <span className="text-[9px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-0.5">
                                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Featured
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-extrabold text-gray-900 text-sm group-hover:text-[#ac0053] transition-colors">{serv.name}</h4>
                                <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed font-semibold">{serv.description}</p>
                              </div>

                              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-gray-500 inline-flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {serv.duration} mins
                                  </span>
                                  <span className="text-xs font-black text-gray-900">₹{serv.price}</span>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => {
                                      setEditingService(serv);
                                      setNewServiceName(serv.name);
                                      setNewServiceCategory(serv.category);
                                      setNewServicePrice(serv.price);
                                      setNewServiceDuration(serv.duration);
                                      setNewServiceDesc(serv.description);
                                      setNewServiceFeatured(!!serv.featured);
                                      setShowServiceDrawer(true);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDuplicateService(serv)}
                                    className="p-1.5 text-gray-400 hover:text-[#ac0053] hover:bg-[#ffd9e1]/20 rounded-lg transition-all"
                                    title="Duplicate"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteService(serv.id, serv.name)}
                                    className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // PACKAGES VIEW
                  <div>
                    {!(data.packages && data.packages.filter(p => {
                      return p.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                             p.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                    }).length > 0) ? (
                      // Empty Filter State for Packages
                      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-3xs max-w-xl mx-auto space-y-4">
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mx-auto border border-gray-100">
                          <Gift className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-gray-800 text-sm">No Package Combos Available</h4>
                          <p className="text-xs text-gray-400 mt-1">Package combos combine multiple treatments together at a dynamic discount. Create your first high-ticket combo menu.</p>
                        </div>
                        <div className="pt-2 flex justify-center">
                          <button 
                            onClick={() => {
                              setEditingPackage(null);
                              setNewPackageName('');
                              setNewPackagePrice(1200);
                              setNewPackageDuration(60);
                              setNewPackageDesc('');
                              setShowPackageDrawer(true);
                            }}
                            className="px-5 py-2.5 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#ac0053]/15"
                          >
                            + Add First Package Combo
                          </button>
                        </div>
                      </div>
                    ) : servicesViewLayout === 'list' ? (
                      // Table view
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-3xs overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest bg-gray-50/60 select-none">
                              <th className="py-3 px-6 w-10"></th>
                              <th className="py-3 px-6">Package Details</th>
                              <th className="py-3 px-6">Est. Duration</th>
                              <th className="py-3 px-6">Combo Price</th>
                              <th className="py-3 px-6">Status</th>
                              <th className="py-3 px-6 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.packages || []).filter(p => {
                              return p.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                                     p.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                            }).map(pkg => (
                              <tr key={pkg.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
                                <td className="py-4 px-6 text-center">
                                  <div className="text-gray-300 cursor-grab active:cursor-grabbing">
                                    <span className="material-symbols-outlined text-base">drag_indicator</span>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="text-xs font-bold text-gray-900">{pkg.name}</div>
                                  <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-xl font-semibold">{pkg.description}</p>
                                </td>
                                <td className="py-4 px-6">
                                  <span className="text-xs font-bold text-gray-500 inline-flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {pkg.duration} mins
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-xs font-extrabold text-emerald-600">₹{pkg.price}</td>
                                <td className="py-4 px-6">
                                  <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg border border-purple-100">
                                    Live Combo
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => {
                                        setEditingPackage(pkg);
                                        setNewPackageName(pkg.name);
                                        setNewPackagePrice(pkg.price);
                                        setNewPackageDuration(pkg.duration);
                                        setNewPackageDesc(pkg.description);
                                        setShowPackageDrawer(true);
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"
                                      title="Edit Package"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleDuplicatePackage(pkg)}
                                      className="p-1 text-gray-400 hover:text-[#ac0053] hover:bg-[#ffd9e1]/20 rounded-md transition-all"
                                      title="Duplicate Package"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                                      className="p-1 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all"
                                      title="Delete Package"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      // Grid layout
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(data.packages || []).filter(p => {
                          return p.name.toLowerCase().includes(servicesSearchQuery.toLowerCase()) ||
                                 p.description.toLowerCase().includes(servicesSearchQuery.toLowerCase());
                        }).map(pkg => (
                          <div 
                            key={pkg.id}
                            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-3xs flex flex-col justify-between hover:shadow-md transition-all group relative overflow-hidden"
                          >
                            <div>
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <span className="text-[10px] font-extrabold bg-purple-50 text-purple-600 px-2.5 py-0.5 rounded-full uppercase tracking-wide border border-purple-100/50">
                                  Value Package
                                </span>
                              </div>
                              <h4 className="font-extrabold text-gray-900 text-sm group-hover:text-[#ac0053] transition-colors">{pkg.name}</h4>
                              <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed font-semibold">{pkg.description}</p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-500 inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {pkg.duration} mins
                                </span>
                                <span className="text-xs font-extrabold text-emerald-600">₹{pkg.price}</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => {
                                    setEditingPackage(pkg);
                                    setNewPackageName(pkg.name);
                                    setNewPackagePrice(pkg.price);
                                    setNewPackageDuration(pkg.duration);
                                    setNewPackageDesc(pkg.description);
                                    setShowPackageDrawer(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDuplicatePackage(pkg)}
                                  className="p-1.5 text-gray-400 hover:text-[#ac0053] hover:bg-[#ffd9e1]/20 rounded-lg transition-all"
                                  title="Duplicate"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                                  className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB: PLANNED DAILY BOOKINGS */}
            {activeTab === 'bookings' && (
              <motion.div 
                key="bookings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-5xl mx-auto"
              >
                {/* PHASE 16.7 — real website bookings for THIS salon only
                    (session-resolved actor; data layer re-checks access). */}
                <Suspense fallback={<PanelFallback />}>
                  <BookingManagementPanel
                    actor={bookingActor}
                    businessId={bookingTenantId}
                    themeId={currentThemeId}
                    onShowToast={(msg) => { setBookingToast(msg); }}
                  />
                </Suspense>
                {bookingToast && (
                  <div
                    data-testid="booking-management-toast"
                    className="bg-gray-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl inline-flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    {bookingToast}
                  </div>
                )}

                <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">On-Call Client Planner</h3>
                    <p className="text-xs text-gray-400">Total active booking pipelines for this session</p>
                  </div>
                  <button 
                    onClick={() => setShowNewAppointmentModal(true)}
                    className="bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Schedule New
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-8 bg-white rounded-2xl border border-gray-200 shadow-2xs p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Timeline Schedule</h4>
                    <div className="space-y-3">
                      {appointments.map(appt => (
                        <div key={appt.id} className="flex gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all bg-gray-50/20">
                          <div className="w-20 shrink-0 text-center border-r border-gray-100 pr-4">
                            <p className="text-xs font-bold text-gray-800">{appt.time}</p>
                            <span className="text-[10px] text-gray-400 font-semibold">Today</span>
                          </div>
                          <div className="flex-grow">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="text-xs font-bold text-gray-900">{appt.customerName}</h5>
                                <p className="text-[10px] text-gray-400 font-medium">Phone: {appt.phone}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase ${
                                appt.status === 'Confirmed' 
                                  ? 'bg-emerald-50 text-emerald-700' 
                                  : appt.status === 'Completed' 
                                    ? 'bg-blue-50 text-blue-700' 
                                    : 'bg-amber-50 text-amber-700'
                              }`}>
                                {appt.status}
                              </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-100/60 flex items-center justify-between text-[11px] font-semibold text-gray-500">
                              <div>
                                Treatment: <span className="text-gray-800 font-bold">{appt.serviceName}</span>
                              </div>
                              <div>
                                Stylist: <span className="text-[#ac0053] font-bold">{appt.staffName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-4 bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Status Ledgers</h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-800">Confirmed</span>
                        <span className="text-lg font-extrabold text-emerald-950">
                          {appointments.filter(a => a.status === 'Confirmed').length}
                        </span>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-bold text-amber-800">Pending Setup</span>
                        <span className="text-lg font-extrabold text-amber-950">
                          {appointments.filter(a => a.status === 'Pending').length}
                        </span>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600">Total Requests</span>
                        <span className="text-lg font-extrabold text-gray-900">
                          {appointments.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: STAFF MANAGEMENT */}
            {activeTab === 'staff' && (
              <motion.div 
                key="staff"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6 max-w-5xl mx-auto"
              >
                <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Staff Schedule & Roles</h3>
                    <p className="text-xs text-gray-400">Sync staff availability, ratings and internal commission rules</p>
                  </div>
                  <button 
                    onClick={onOpenStaffManagement}
                    className="bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Sync Advanced Roster
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.team.map(member => (
                    <div key={member.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3">
                          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#ffd9e1]">
                            <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900">{member.name}</h4>
                            <span className="text-xs font-bold text-[#ac0053]">{member.role}</span>
                            <div className="flex items-center gap-1 text-[11px] text-gray-400 font-bold mt-1">
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                              {member.rating || '5.0'} / 5.0 Rating
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleToggleStaffStatus(member.id)}
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border ${
                            member.status === 'Available' 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                              : member.status === 'Busy'
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}
                        >
                          {member.status || 'Available'}
                        </button>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-1.5">
                        {member.specialties.map((spec, i) => (
                          <span key={i} className="text-[9px] font-bold uppercase tracking-wider bg-gray-50 border border-gray-200 text-gray-500 px-2 py-0.5 rounded-lg">
                            {spec}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-[11px] font-semibold text-gray-400">
                        <span>Commission rate: <strong className="text-gray-700">{member.commission || 15}%</strong></span>
                        <span>Access: <strong className="text-gray-700">{member.appAccessRole || 'No App Access'}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* TAB: PAYMENTS — Premium Revenue Dashboard matching Nexora spec */}
            {activeTab === 'payments' && (
              <Suspense fallback={<PanelFallback />}>
                <PaymentsPanel
                  appointments={appointments}
                  setAppointments={setAppointments}
                  onNotify={(msg) => setNotifications(prev => [{ id: `n-${Date.now()}`, text: msg, time: 'Just now', read: false }, ...prev])}
                />
              </Suspense>
            )}

            {/* TAB: SHARE & REFERRAL MARKETING */}
            {activeTab === 'share' && (
              <Suspense fallback={<PanelFallback />}>
                <SharePanel
                  liveUrl={liveUrl}
                  copied={copied}
                  onCopyLink={handleCopyLink}
                  notificationsOpen={showNotifications}
                  onNotify={(msg) => setNotifications(prev => [{ id: `n-${Date.now()}`, text: msg, time: 'Just now', read: false }, ...prev])}
                />
              </Suspense>
            )}

            {/* TAB: SALON RULES & SETTINGS */}
            {activeTab === 'settings' && (
              <Suspense fallback={<PanelFallback />}>
                <SettingsPanel
                  data={data}
                  setData={setData}
                  onNotify={(msg) => setNotifications(prev => [{ id: `n-${Date.now()}`, text: msg, time: 'Just now', read: false }, ...prev])}
                />
              </Suspense>
            )}

            {/* TAB: SHARE & REFERRAL PREMIUM (Screen 24) */}
            {activeTab === 'referral' && (
              <motion.div 
                key="referral"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="max-w-[1440px] mx-auto w-full"
              >
                <Suspense fallback={<PanelFallback />}>
                  <ShareReferralPremium
                    salonName={data.salonName}
                    liveUrl={liveUrl}
                    onNotify={(msg) => setNotifications(prev => [{ id: `n-${Date.now()}`, text: msg, time: 'Just now', read: false }, ...prev])}
                  />
                </Suspense>
              </motion.div>
            )}

            {/* TAB: BRANDING & WHITE-LABEL PREMIUM (Screen 25) */}
            {activeTab === 'branding' && (
              <motion.div 
                key="branding"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="max-w-[1440px] mx-auto w-full"
              >
                <Suspense fallback={<PanelFallback />}>
                  <BrandingWhiteLabel
                    data={data}
                    setData={setData}
                    onNotify={(msg) => setNotifications(prev => [{ id: `n-${Date.now()}`, text: msg, time: 'Just now', read: false }, ...prev])}
                  />
                </Suspense>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* MODAL: NEW APPOINTMENT CREATOR */}
      <AnimatePresence>
        {showNewAppointmentModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.form 
              onSubmit={handleCreateAppointment}
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100"
            >
              <button 
                type="button"
                onClick={() => setShowNewAppointmentModal(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-bold text-gray-900 text-base mb-1">Add Salon Booking</h3>
              <p className="text-xs text-gray-400 mb-6">Manually record a client appointment walk-in or phone call</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Customer Name *</label>
                  <input 
                    type="text" 
                    required
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    placeholder="e.g. Neha Sharma"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contact Phone</label>
                  <input 
                    type="tel" 
                    value={newCustPhone}
                    onChange={e => setNewCustPhone(e.target.value)}
                    placeholder="e.g. +91 99000 11000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Service</label>
                    <select 
                      value={newSelectedService}
                      onChange={e => setNewSelectedService(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none"
                    >
                      {data.services.map(s => (
                        <option key={s.id} value={s.id}>{s.name} - ₹{s.price}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Stylist</label>
                    <select 
                      value={newSelectedStaff}
                      onChange={e => setNewSelectedStaff(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none"
                    >
                      {data.team.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Planned Time slot</label>
                  <select 
                    value={newSelectedTime}
                    onChange={e => setNewSelectedTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none"
                  >
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="12:00 PM">12:00 PM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="02:30 PM">02:30 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                    <option value="05:30 PM">05:30 PM</option>
                    <option value="07:00 PM">07:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowNewAppointmentModal(false)}
                  className="w-1/2 border border-gray-200 text-gray-500 font-bold text-xs py-3 rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="w-1/2 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl"
                >
                  Confirm Booking
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER: SERVICE SLIDE-OUT FROM RIGHT */}
      <AnimatePresence>
        {showServiceDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowServiceDrawer(false)}
              className="absolute inset-0 bg-black/45 backdrop-blur-xs"
            />

            {/* Slide out Panel */}
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-screen max-w-md bg-white border-l border-gray-100 flex flex-col shadow-2xl relative"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-sm">{editingService ? 'Edit Service Details' : 'Add Treatment Catalog'}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Customize service pricing, timing and tags</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowServiceDrawer(false)}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSaveService} className="flex-grow overflow-y-auto p-6 space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Service Name *</label>
                    <input 
                      type="text" 
                      required
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      placeholder="e.g. Balayage & Hair Spa Combo"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/15 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
                      <select 
                        value={newServiceCategory}
                        onChange={e => setNewServiceCategory(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                      >
                        <option value="Haircut">Haircut</option>
                        <option value="Hair Styling">Hair Styling</option>
                        <option value="Treatment">Treatment</option>
                        <option value="Hair Coloring">Hair Coloring</option>
                        <option value="Beauty">Beauty</option>
                        <option value="Wellness">Wellness</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Duration (mins)</label>
                      <input 
                        type="number" 
                        required
                        value={newServiceDuration}
                        onChange={e => setNewServiceDuration(Number(e.target.value))}
                        className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Treatment Fee (INR ₹) *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-2.5 text-gray-400 text-xs font-bold">₹</span>
                      <input 
                        type="number" 
                        required
                        value={newServicePrice}
                        onChange={e => setNewServicePrice(Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs font-extrabold text-gray-900 focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/15 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Service Description</label>
                      <button
                        type="button"
                        disabled={isImprovingWithAI || !newServiceName}
                        onClick={handleImproveDescriptionWithAI}
                        className="text-[10px] font-bold text-[#ac0053] hover:text-[#ba005b] flex items-center gap-1 bg-[#ffd9e1]/25 hover:bg-[#ffd9e1]/50 px-2 py-0.5 rounded-md border border-[#ffd9e1]/40 disabled:opacity-55"
                      >
                        <Sparkles className="w-3 h-3 text-[#ac0053]" />
                        {isImprovingWithAI ? 'AI Improving...' : 'Gemini Auto-Draft'}
                      </button>
                    </div>
                    <textarea 
                      value={newServiceDesc}
                      onChange={e => setNewServiceDesc(e.target.value)}
                      placeholder="e.g. Clarifying hair wash with deep nourishing mask..."
                      rows={4}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/15 outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-150">
                    <input 
                      type="checkbox"
                      id="drawerFeatured"
                      checked={newServiceFeatured}
                      onChange={e => setNewServiceFeatured(e.target.checked)}
                      className="rounded border-gray-300 text-[#ac0053] focus:ring-[#ac0053] w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="drawerFeatured" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                      Star feature this treatment on website banner
                    </label>
                  </div>

                  {/* Calculations Info Box */}
                  <div className="p-3.5 bg-[#ffd9e1]/10 rounded-xl border border-[#ffd9e1]/30 space-y-1">
                    <p className="text-[10px] font-extrabold text-[#ac0053] uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> ONLINE CLIENT CALCULATOR (25% DEPOSIT)
                    </p>
                    <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                      Clients pay an online booking deposit of <strong className="text-gray-800">₹{Math.round((newServicePrice || 0) * 0.25)}</strong> at checkout. Remaining <strong className="text-gray-800">₹{Math.round((newServicePrice || 0) * 0.75)}</strong> collected in-salon.
                    </p>
                  </div>

                  {/* Footer Buttons */}
                  <div className="pt-6 border-t border-gray-100 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setShowServiceDrawer(false)}
                      className="w-1/3 border border-gray-200 text-gray-500 font-bold text-xs py-3 rounded-xl hover:bg-gray-50 active:scale-98 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="w-2/3 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl shadow-md shadow-[#ac0053]/15 active:scale-98 transition-all"
                    >
                      {editingService ? 'Save Service Updates' : 'Add to Treatment Catalog'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* DRAWER: PACKAGE SLIDE-OUT FROM RIGHT */}
      <AnimatePresence>
        {showPackageDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPackageDrawer(false)}
              className="absolute inset-0 bg-black/45 backdrop-blur-xs"
            />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-screen max-w-md bg-white border-l border-gray-100 flex flex-col shadow-2xl relative"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-sm">{editingPackage ? 'Edit Package Combo' : 'Create Package Combo'}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Bundle multiple treatments for a dynamic discount</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowPackageDrawer(false)}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSavePackage} className="flex-grow overflow-y-auto p-6 space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Package Combo Name *</label>
                    <input 
                      type="text" 
                      required
                      value={newPackageName}
                      onChange={e => setNewPackageName(e.target.value)}
                      placeholder="e.g. Bridal Glow & Styling Bundle"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/15 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Total Duration (mins)</label>
                      <input 
                        type="number" 
                        required
                        value={newPackageDuration}
                        onChange={e => setNewPackageDuration(Number(e.target.value))}
                        className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Combo Fee (INR ₹) *</label>
                      <input 
                        type="number" 
                        required
                        value={newPackagePrice}
                        onChange={e => setNewPackagePrice(Number(e.target.value))}
                        className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-extrabold text-gray-900 focus:border-[#ac0053]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Package Items / Details</label>
                      <button
                        type="button"
                        disabled={isImprovingWithAI || !newPackageName}
                        onClick={handleImprovePackageDescWithAI}
                        className="text-[10px] font-bold text-[#ac0053] hover:text-[#ba005b] flex items-center gap-1 bg-[#ffd9e1]/25 hover:bg-[#ffd9e1]/50 px-2 py-0.5 rounded-md border border-[#ffd9e1]/40 disabled:opacity-55"
                      >
                        <Sparkles className="w-3 h-3 text-[#ac0053]" />
                        {isImprovingWithAI ? 'AI Designing...' : 'Gemini Combo Draft'}
                      </button>
                    </div>
                    <textarea 
                      value={newPackageDesc}
                      onChange={e => setNewPackageDesc(e.target.value)}
                      placeholder="e.g. Includes Global Hair Color, Precision Haircut, Hydra Facial & Scalp Massage..."
                      rows={5}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/15 outline-none resize-none"
                    />
                  </div>

                  {/* Calculations Info Box */}
                  <div className="p-3.5 bg-purple-50/50 rounded-xl border border-purple-100 space-y-1">
                    <p className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                      <Gift className="w-3.5 h-3.5" /> High-Value Bundling Strategy
                    </p>
                    <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                      Combo pricing allows salon operators to capture higher cart volumes. We recommend packaging popular services with a <strong className="text-gray-800">15-20% discount</strong> compared to standalone prices.
                    </p>
                  </div>

                  {/* Footer Buttons */}
                  <div className="pt-6 border-t border-gray-100 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setShowPackageDrawer(false)}
                      className="w-1/3 border border-gray-200 text-gray-500 font-bold text-xs py-3 rounded-xl hover:bg-gray-50 active:scale-98 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="w-2/3 bg-slate-900 hover:bg-black text-white font-bold text-xs py-3 rounded-xl active:scale-98 transition-all"
                    >
                      {editingPackage ? 'Save Package Updates' : 'Add Package to Catalog'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: VOICE QUICK-ADD ASSISTANT */}
      <AnimatePresence>
        {showVoiceModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100 overflow-hidden"
            >
              <button 
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-4">
                <div className="inline-flex p-3 rounded-full bg-[#ffd9e1]/45 text-[#ac0053] relative">
                  {isVoiceListening && (
                    <span className="absolute inset-0 rounded-full border-2 border-[#ac0053] animate-ping opacity-75"></span>
                  )}
                  <Mic className="w-8 h-8 text-[#ac0053]" />
                </div>

                <div>
                  <h3 className="font-extrabold text-gray-900 text-sm">Voice Catalog Command</h3>
                  <p className="text-[11px] text-gray-400 mt-1 font-semibold">Speak or paste a natural language statement to quickly register treatments</p>
                </div>

                {/* Animated Soundwave */}
                {isVoiceListening ? (
                  <div className="flex justify-center items-center gap-1 h-8">
                    {[1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                      <motion.span 
                        key={i} 
                        animate={{ height: [8, h * 6, 8] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.05 }}
                        className="w-1 bg-[#ac0053] rounded-full"
                        style={{ height: '8px' }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center justify-center text-xs text-gray-400 font-semibold">
                    Microphone is sleeping. Tap to talk!
                  </div>
                )}

                <div className="space-y-3 text-left">
                  <div className="relative">
                    <textarea 
                      value={voiceInputText}
                      onChange={e => setVoiceInputText(e.target.value)}
                      placeholder="e.g. Add service Deluxe Spa Pedicure for 1200 rupees lasting 45 minutes"
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] resize-none outline-none"
                    />
                  </div>

                  {/* Predefined Clickable Commands Fallback */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Or Click Preset Prompt to Try:</span>
                    <div className="space-y-1">
                      {[
                        'Add service Deluxe Spa Pedicure for 1200 rupees lasting 45 minutes',
                        'Create package Bridal Glow Combo with a price of 4500 rupees lasting 150 minutes',
                        'Add service Beard Trim for 250 rupees lasting 15 minutes'
                      ].map((cmd, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setVoiceInputText(cmd);
                            setIsVoiceListening(true);
                            setTimeout(() => {
                              setIsVoiceListening(false);
                            }, 1000);
                          }}
                          className="w-full text-left p-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-150 text-[10px] font-semibold text-gray-600 truncate transition-colors cursor-pointer"
                        >
                          📢 {cmd}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsVoiceListening(!isVoiceListening);
                      if (!isVoiceListening) {
                        setTimeout(() => {
                          setVoiceInputText('Add service Deep Nourishing Hair Spa for 850 rupees lasting 60 minutes');
                          setIsVoiceListening(false);
                        }, 2500);
                      }
                    }}
                    className={`w-1/2 py-2.5 rounded-xl font-bold text-xs border transition-all ${
                      isVoiceListening 
                        ? 'bg-[#ffd9e1]/20 border-[#ac0053] text-[#ac0053]' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {isVoiceListening ? 'Stop Mic Listening' : 'Toggle Mic'}
                  </button>
                  <button 
                    type="button"
                    disabled={!voiceInputText.trim()}
                    onClick={handleParseVoiceCommand}
                    className="w-1/2 bg-[#ac0053] hover:bg-[#ba005b] disabled:opacity-55 text-white font-bold text-xs py-2.5 rounded-xl shadow"
                  >
                    Parse & Add Service
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: AI SUGGEST IDEAS WIZARD */}
      <AnimatePresence>
        {showAiSuggestModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative border border-gray-100 overflow-hidden"
            >
              <button 
                type="button"
                onClick={() => {
                  setShowAiSuggestModal(false);
                  setGeneratedSuggestions([]);
                  setSelectedSuggestionIds([]);
                }}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-500">
                    <Sparkles className="w-5 h-5 fill-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-sm">AI Treatment Suggestion Engine</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-semibold">Generate high-converting treatments optimized for your specific archetype</p>
                  </div>
                </div>

                {generatedSuggestions.length === 0 ? (
                  /* STEP 1: Select Archetype & Generate */
                  <div className="space-y-5">
                    {isGeneratingSuggestions ? (
                      /* Live loading steps */
                      <div className="py-12 text-center space-y-4">
                        <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mx-auto" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-900 animate-pulse">🤖 Consulting Gemini AI Engine...</p>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Calculating optimal treatment price metrics</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Select Salon Archetype Idea Kit</label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'luxury', title: 'Luxury Chic', icon: '👑', desc: 'Premium colors, high price hair sculptures, complex glazes.' },
                            { id: 'barber', title: 'Barber Shop', icon: '💈', desc: 'Detail beard trims, razor lineups, facial packs, tonics.' },
                            { id: 'spa', title: 'Wellness Spa', icon: '🌸', desc: 'Aromatherapy body massages, salt scrubs, skincare.' },
                            { id: 'beauty', title: 'Nail & Beauty', icon: '💅', desc: 'Gel manicures, acrylic overlays, maps, brow mappings.' }
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setAiSuggestArchetype(item.id as any)}
                              className={`p-4 rounded-xl border text-left transition-all ${
                                aiSuggestArchetype === item.id 
                                  ? 'border-amber-400 bg-amber-50/20 shadow-2xs' 
                                  : 'border-gray-200 hover:border-gray-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{item.icon}</span>
                                <span className="text-xs font-bold text-gray-900">{item.title}</span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-1 font-semibold leading-relaxed">{item.desc}</p>
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTriggerSuggestions(aiSuggestArchetype)}
                          className="w-full mt-2 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl transition-all shadow"
                        >
                          Generate AI Catalog Ideas
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* STEP 2: Selection Catalog Matrix */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs text-gray-500 font-bold">
                      <span>Select treatments to import into your catalog:</span>
                      <button 
                        type="button"
                        onClick={() => {
                          if (selectedSuggestionIds.length === generatedSuggestions.length) {
                            setSelectedSuggestionIds([]);
                          } else {
                            setSelectedSuggestionIds(generatedSuggestions.map(s => s.id));
                          }
                        }}
                        className="text-[#ac0053] hover:underline"
                      >
                        {selectedSuggestionIds.length === generatedSuggestions.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {generatedSuggestions.map((sug) => {
                        const isChecked = selectedSuggestionIds.includes(sug.id);
                        return (
                          <div 
                            key={sug.id}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedSuggestionIds(prev => prev.filter(id => id !== sug.id));
                              } else {
                                setSelectedSuggestionIds(prev => [...prev, sug.id]);
                              }
                            }}
                            className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                              isChecked ? 'border-amber-300 bg-amber-50/10' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 mt-0.5"
                            />
                            <div className="flex-grow">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-900">{sug.name}</span>
                                <span className="text-xs font-extrabold text-gray-900">₹{sug.price}</span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-semibold line-clamp-1">{sug.description}</p>
                              <div className="mt-1 flex gap-2 text-[9px] text-gray-400 font-bold uppercase">
                                <span>{sug.category}</span>
                                <span>•</span>
                                <span>{sug.duration} mins</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => {
                          setGeneratedSuggestions([]);
                          setSelectedSuggestionIds([]);
                        }}
                        className="w-1/3 border border-gray-200 text-gray-500 font-bold text-xs py-3 rounded-xl hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button 
                        type="button"
                        onClick={handleAddSuggestionsToCatalog}
                        className="w-2/3 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs py-3 rounded-xl shadow-md"
                      >
                        Import Selected ({selectedSuggestionIds.length}) to Catalog
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: LIVE SITE IFRAME/PREVIEW SCREEN OVERLAY */}
      <AnimatePresence>
        {showLiveSiteModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 md:p-8 z-50 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden relative border border-gray-100 shadow-2xl"
            >
              <div className="h-14 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-gray-500 tracking-wide uppercase">Live client website preview</span>
                </div>
                
                <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                  <button 
                    onClick={() => setMode('desktop')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold ${mode === 'desktop' ? 'bg-white shadow-3xs text-gray-800' : 'text-gray-400'}`}
                  >
                    Desktop
                  </button>
                  <button 
                    onClick={() => setMode('mobile')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold ${mode === 'mobile' ? 'bg-white shadow-3xs text-gray-800' : 'text-gray-400'}`}
                  >
                    Mobile
                  </button>
                </div>

                <button 
                  onClick={() => setShowLiveSiteModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative bg-gray-50 flex items-center justify-center">
                <TemplateRenderer data={data} mode={mode} renderMode="owner-preview" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: HELP CENTER */}
      <AnimatePresence>
        {showHelpCenter && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100"
            >
              <button 
                onClick={() => setShowHelpCenter(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-bold text-gray-900 text-base mb-1">Help &amp; FAQ Center</h3>
              <p className="text-xs text-gray-400 mb-6 font-semibold">Everything you need to master your new {platform.name} platform</p>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-1 text-xs">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                  <h4 className="font-bold text-gray-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> How do advance payments work?
                  </h4>
                  <p className="text-gray-500 leading-relaxed font-semibold">
                    {platform.name} automatically asks clients to complete a percentage deposit before booking (defined in Salon Rules). You can confirm or cancel these manually.
                  </p>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                  <h4 className="font-bold text-gray-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Can I update my template styling later?
                  </h4>
                  <p className="text-gray-500 leading-relaxed font-semibold">
                    Yes! You can re-run the Onboarding wizard or jump to Step 10 (Customize) at any time via the sidebar control.
                  </p>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                  <h4 className="font-bold text-gray-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> How do clients scan my QR code?
                  </h4>
                  <p className="text-gray-500 leading-relaxed font-semibold">
                    Go to 'Share &amp; Marketing' tab, scan the dynamic QR with any mobile phone, or copy/download the QR to print for your shop desk!
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowHelpCenter(false)}
                className="w-full mt-6 bg-gray-900 hover:bg-black text-white font-bold text-xs py-3 rounded-xl transition-colors"
              >
                Close Help Center
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
