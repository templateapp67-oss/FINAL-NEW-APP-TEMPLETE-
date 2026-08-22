import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  Award,
  Sparkles,
  Wallet,
  Building2,
  ArrowUpRight,
  UserCheck,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  Plus,
  X,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  QrCode,
  DollarSign,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Flame,
} from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import {
  getStoredReferralCode,
  setStoredReferralCode,
  getReferredSalons,
  calculateReferralMetrics,
  addReferredSalon,
  claimReferralRewards,
  ReferredSalon,
  ReferralRegistrationStatus,
  RewardStatus,
} from '../lib/referralService';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';

interface Props {
  salonName?: string;
  onNotify?: (msg: string) => void;
  className?: string;
}

export default function ReferralDashboard({ salonName, onNotify, className = '' }: Props) {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string>('');
  const [salons, setSalons] = useState<ReferredSalon[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReferralRegistrationStatus>('all');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'link' | 'code' | 'success';
  } | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState<string | null>(null);

  // New Invite Form State
  const [newSalonName, setNewSalonName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newThemeName, setNewThemeName] = useState('Luxury Hair & Spa');
  const [newLocation, setNewLocation] = useState('');

  // Initial Load from localStorage
  useEffect(() => {
    const code = getStoredReferralCode();
    setReferralCode(code);
    setCustomCodeInput(code);
    const loadedSalons = getReferredSalons();
    setSalons(loadedSalons);
  }, []);

  // Auto-dismiss toast after 3.5s
  useEffect(() => {
    if (!toast?.show) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const triggerToast = (title: string, message: string, type: 'link' | 'code' | 'success' = 'link') => {
    setToast({ show: true, title, message, type });
  };

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  const metrics = useMemo(() => {
    return calculateReferralMetrics(salons, referralCode);
  }, [salons, referralCode]);

  const fallbackDomain =
    DEFAULT_BRAND_CONFIG.platform.websiteUrl.replace(/^https?:\/\//, '') +
    '/' +
    DEFAULT_BRAND_CONFIG.defaultSalon.slug;
  const liveReferralLink = `https://${window?.location?.host || fallbackDomain}?ref=${encodeURIComponent(referralCode)}`;

  const copyToClipboard = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
        triggerToast('Referral Code Copied!', `Code "${referralCode}" copied to clipboard.`, 'code');
        notify('Referral code copied to clipboard!');
      } else {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        triggerToast('Referral Link Copied!', 'Direct invite link copied to clipboard.', 'link');
        notify('Referral link copied to clipboard!');
      }
    } catch {
      triggerToast('Failed to copy', 'Please copy manually from the input.', 'code');
      notify('Failed to copy to clipboard');
    }
  };

  const handleSaveCustomCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCodeInput.trim()) return;
    const cleanCode = customCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setReferralCode(cleanCode);
    setStoredReferralCode(cleanCode);
    setIsEditingCode(false);
    notify(`Referral code updated to ${cleanCode}`);
  };

  const handleAddInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalonName.trim() || !newOwnerName.trim()) {
      notify('Please provide at least the Salon Name and Owner Name');
      return;
    }

    const created = addReferredSalon({
      salonName: newSalonName.trim(),
      ownerName: newOwnerName.trim(),
      ownerEmail: newOwnerEmail.trim() || undefined,
      ownerPhone: newOwnerPhone.trim() || undefined,
      status: 'pending',
      themeName: newThemeName,
      plan: '14-Day Free Trial',
      rewardAmount: 500,
      commissionRate: '10% Launch Commission',
      lastActive: 'Invitation sent just now',
      location: newLocation.trim() || 'India',
    });

    setSalons(getReferredSalons());
    setIsInviteModalOpen(false);
    setNewSalonName('');
    setNewOwnerName('');
    setNewOwnerEmail('');
    setNewOwnerPhone('');
    setNewLocation('');
    notify(`Invitation created for ${created.salonName}!`);
  };

  const handleClaimPayout = () => {
    if (metrics.availableBalance <= 0) {
      notify('No available rewards ready for payout');
      return;
    }
    setIsClaiming(true);
    setTimeout(() => {
      const res = claimReferralRewards();
      setIsClaiming(false);
      if (res.success) {
        setSalons(getReferredSalons());
        setPayoutSuccessMsg(res.message);
        notify(res.message);
      } else {
        notify(res.message);
      }
    }, 600);
  };

  const filteredSalons = useMemo(() => {
    return salons.filter((s) => {
      const matchesSearch =
        s.salonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.location && s.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        s.themeName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' ? true : s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [salons, searchQuery, statusFilter]);

  const getStatusBadge = (status: ReferralRegistrationStatus) => {
    switch (status) {
      case 'published':
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Live & Published
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            Onboarding in Progress
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 shadow-xs">
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
            Invited / Pending Setup
          </span>
        );
    }
  };

  const getRewardStatusBadge = (status: RewardStatus, amount: number) => {
    switch (status) {
      case 'credited':
        return (
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-emerald-600">+₹{amount.toLocaleString('en-IN')}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Available</span>
          </div>
        );
      case 'paid_out':
        return (
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-gray-500 line-through">₹{amount.toLocaleString('en-IN')}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Paid Out</span>
          </div>
        );
      case 'pending':
      default:
        return (
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-amber-600">₹{amount.toLocaleString('en-IN')}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Pending Live</span>
          </div>
        );
    }
  };

  return (
    <div className={`space-y-6 max-w-7xl mx-auto w-full ${className}`}>
      {/* 1. HERO HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-[#3f001a] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#ac0053]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[#ffd9e1] text-xs font-semibold border border-white/10">
                <Flame className="w-3.5 h-3.5 text-[#ffd9e1]" />
                Owner Partner Program
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30">
                <Award className="w-3.5 h-3.5" />
                {metrics.partnerTier} Partner
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Referral Dashboard & Earnings
            </h1>
            <p className="text-sm text-gray-300 leading-relaxed">
              Earn direct cash commissions and rewards when fellow salon owners launch their websites using your
              referral code. Track registrations, onboarding progress, and accumulated payouts in real-time.
            </p>

            {user?.email && (
              <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Logged in as: <strong className="text-gray-200">{user.email}</strong></span>
                {salonName && <span className="text-gray-500">• {salonName}</span>}
              </div>
            )}
          </div>

          {/* Referral Code Quick Card */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/15 p-5 rounded-2xl flex flex-col gap-3 min-w-[280px] sm:min-w-[320px]">
            <div className="flex items-center justify-between text-xs font-medium text-gray-300">
              <span>Your Active Referral Code</span>
              <button
                onClick={() => setIsEditingCode(!isEditingCode)}
                className="text-[#ffd9e1] hover:underline cursor-pointer"
              >
                {isEditingCode ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {isEditingCode ? (
              <form onSubmit={handleSaveCustomCode} className="flex gap-2">
                <input
                  type="text"
                  value={customCodeInput}
                  onChange={(e) => setCustomCodeInput(e.target.value)}
                  className="bg-black/40 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white font-mono uppercase focus:outline-none focus:border-[#ffd9e1] flex-1"
                  placeholder="CODE"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#ac0053] hover:bg-[#8f0043] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-4 py-2.5">
                <span className="font-mono text-lg font-black tracking-widest text-[#ffd9e1]">
                  {referralCode}
                </span>
                <button
                  onClick={() => copyToClipboard(referralCode, 'code')}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Copy referral code"
                >
                  {codeCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => copyToClipboard(liveReferralLink, 'link')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-white text-gray-900 rounded-xl font-bold text-xs hover:bg-gray-100 transition-colors shadow-sm cursor-pointer"
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-[#ac0053]" />}
                <span>{linkCopied ? 'Link Copied' : 'Share Link'}</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Hey! Build your salon website with Nexora in 2 minutes. Use my referral code "${referralCode}" to get a 14-day Pro trial and discount: ${liveReferralLink}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center p-2 bg-[#25D366] text-white rounded-xl hover:bg-[#20bd5a] transition-colors shadow-sm cursor-pointer"
                title="Share via WhatsApp"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 2. REVENUE & ACCUMULATED REWARDS METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Accumulated */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Accumulated</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            ₹{metrics.totalRewardsAccumulated.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <span>Lifetime referral earnings</span>
          </div>
        </div>

        {/* Available Balance / Claim */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Available Balance</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tracking-tight">
            ₹{metrics.availableBalance.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-emerald-600 font-medium">Ready for payout</span>
            {metrics.availableBalance > 0 && (
              <button
                onClick={handleClaimPayout}
                disabled={isClaiming}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isClaiming ? <RefreshCw className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                Claim
              </button>
            )}
          </div>
        </div>

        {/* Pending Payouts */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Setup</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 tracking-tight">
            ₹{metrics.rewardsPending.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            <span>{metrics.inProgressSalons + metrics.pendingSalons} salons finishing setup</span>
          </div>
        </div>

        {/* Total Referred Salons */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Referred Salons</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {metrics.totalReferredSalons}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-600 font-bold">{metrics.activeSalons} Active</span>
            <span>•</span>
            <span className="text-amber-600 font-medium">{metrics.inProgressSalons} Onboarding</span>
          </div>
        </div>
      </div>

      {/* Payout Success Alert */}
      {payoutSuccessMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="w-4 h-4 font-bold" />
            </div>
            <div>
              <p className="text-sm font-bold">Reward Payout Initiated</p>
              <p className="text-xs text-emerald-700">{payoutSuccessMsg}</p>
            </div>
          </div>
          <button
            onClick={() => setPayoutSuccessMsg(null)}
            className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* 3. REFERRED SALONS LIST SECTION */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
        {/* Controls Bar */}
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Referred Salons & Onboarding Status</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live registration status and commission earnings per referred salon
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search salons, owners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white transition-colors"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                All ({salons.length})
              </button>
              <button
                onClick={() => setStatusFilter('published')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'published' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Live ({metrics.activeSalons})
              </button>
              <button
                onClick={() => setStatusFilter('in_progress')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'in_progress' ? 'bg-white text-amber-700 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Onboarding ({metrics.inProgressSalons})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'pending' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                Pending ({metrics.pendingSalons})
              </button>
            </div>

            {/* Invite Salon Button */}
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ac0053] hover:bg-[#8f0043] text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Invite Salon</span>
            </button>
          </div>
        </div>

        {/* Salons Table / List */}
        {filteredSalons.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-700">No referred salons found</p>
            <p className="text-xs text-gray-400 mt-1">Try changing your search query or filter</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSalons.map((salon) => (
              <div
                key={salon.id}
                className="p-5 sm:p-6 hover:bg-gray-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left info: Salon name, owner, theme */}
                <div className="space-y-1.5 flex-1 min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{salon.salonName}</h3>
                    {getStatusBadge(salon.status)}
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium">
                      {salon.themeName}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-medium text-gray-700">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {salon.ownerName}
                    </span>

                    {salon.location && (
                      <span className="flex items-center gap-1 text-gray-500">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {salon.location}
                      </span>
                    )}

                    {salon.ownerEmail && (
                      <span className="flex items-center gap-1 text-gray-500">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        {salon.ownerEmail}
                      </span>
                    )}

                    {salon.ownerPhone && (
                      <span className="flex items-center gap-1 text-gray-500">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {salon.ownerPhone}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-gray-400 pt-0.5">
                    <span>Registered: {salon.registrationDate}</span>
                    <span>•</span>
                    <span>Plan: {salon.plan}</span>
                    <span>•</span>
                    <span>Code used: <strong className="text-gray-600 font-mono">{salon.referralCodeUsed}</strong></span>
                  </div>
                </div>

                {/* Right info: Reward amount and status */}
                <div className="flex items-center justify-between lg:justify-end gap-6 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                  <div className="text-right">
                    {getRewardStatusBadge(salon.rewardStatus, salon.rewardAmount)}
                    <span className="text-[11px] text-gray-400">{salon.commissionRate}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {salon.status === 'in_progress' && (
                      <button
                        onClick={() => notify(`Reminder sent to ${salon.ownerName} to complete their salon setup!`)}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-amber-200"
                      >
                        Nudge Setup
                      </button>
                    )}

                    {salon.status === 'pending' && (
                      <button
                        onClick={() => notify(`Invite re-sent to ${salon.ownerName}!`)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-blue-200"
                      >
                        Resend Invite
                      </button>
                    )}

                    {salon.status === 'published' && (
                      <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. PARTNER TIERS & REWARD PERKS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-black">
              1
            </div>
            <h3 className="font-bold text-gray-900">Share Your Code</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Send your unique referral code or invitation link to fellow salon owners, barbers, and spa managers looking to digitize their business.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-black">
              2
            </div>
            <h3 className="font-bold text-gray-900">They Launch & Go Live</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            When they complete onboarding and publish their high-converting website, their status updates to <strong className="text-emerald-700">Live & Published</strong>.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-black">
              3
            </div>
            <h3 className="font-bold text-gray-900">Accumulate Rewards</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Earn between <strong className="text-gray-900">₹500 to ₹1,500</strong> per active salon. Withdraw directly into your bank or use as salon subscription credit.
          </p>
        </div>
      </div>

      {/* 5. INVITE MODAL */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="absolute top-6 right-6 p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-[#ffd9e1] flex items-center justify-center text-[#ac0053]">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Invite a Fellow Salon Owner</h3>
                <p className="text-xs text-gray-500">
                  Send an official invite with your code <strong className="text-[#ac0053]">{referralCode}</strong>
                </p>
              </div>

              <form onSubmit={handleAddInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Salon / Business Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Royal Bliss Unisex Spa"
                    value={newSalonName}
                    onChange={(e) => setNewSalonName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Owner Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Sharma"
                      value={newOwnerName}
                      onChange={(e) => setNewOwnerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">City / Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Delhi NCR"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="owner@example.com"
                      value={newOwnerEmail}
                      onChange={(e) => setNewOwnerEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={newOwnerPhone}
                      onChange={(e) => setNewOwnerPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Recommended Theme / Category</label>
                  <select
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#ac0053] focus:bg-white"
                  >
                    <option value="Luxury Hair & Spa">Luxury Hair & Spa</option>
                    <option value="Classic Vintage Barber">Classic Vintage Barber</option>
                    <option value="Nail & Lash Boutique">Nail & Lash Boutique</option>
                    <option value="Modern Family Salon">Modern Family Salon</option>
                    <option value="Ayurvedic Wellness Spa">Ayurvedic Wellness Spa</option>
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold bg-[#ac0053] hover:bg-[#8f0043] text-white rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    Add & Generate Invite
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Notification for Referral Link & Code Copy */}
      <AnimatePresence>
        {toast?.show && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-auto bg-gray-900/95 text-white backdrop-blur-md px-4 py-3.5 rounded-2xl shadow-2xl border border-gray-700/80 flex items-start gap-3.5"
            role="status"
            aria-live="polite"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-white tracking-wide">{toast.title}</p>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-gray-300 truncate mt-0.5">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
