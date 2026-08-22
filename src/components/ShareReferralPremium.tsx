import React, { useEffect, useState } from 'react';
import {
  Gift,
  Copy,
  Check,
  Share2,
  MessageCircle,
  Instagram,
  Facebook,
  Users,
  Star,
  TrendingUp,
  Award,
  BadgePercent,
  Sparkles,
  Crown,
  Wallet,
  ChevronRight,
  Link2,
  PartyPopper,
  UserPlus,
  Zap,
  ArrowUpRight,
  X,
  ImageDown,
  Send,
  Lock,
} from 'lucide-react';
import {
  getReferralCode,
  buildReferralLink,
  buildReferralShareText,
  shareReferralNatively,
  shareToFacebook,
} from '../lib/referral';
import {
  getReferralDashboard,
  onReferralDashboardUpdated,
  CREDITS_BY_STATUS,
} from '../lib/referralDashboard';
import type { ReferralDashboardData, ReferralStatus } from '../lib/referralDashboard';
import {
  generateReferralPoster,
  generateReferralStoryCard,
  downloadDataUrlImage,
  shareImageNatively,
} from '../lib/referralCanvas';

interface Props {
  salonName?: string;
  liveUrl?: string;
  onNotify?: (msg: string) => void;
}

const TIERS = [
  { name: 'Silver', min: 3, reward: '₹250', rewardLabel: 'Salon credit', icon: '🥈', desc: '3 referred salons go Active' },
  { name: 'Gold', min: 8, reward: '₹750', rewardLabel: 'Salon credit', icon: '🥇', desc: '8 referred salons go Active' },
  { name: 'Platinum', min: 15, reward: 'Free Signature Package', rewardLabel: 'Full luxury package', icon: '💎', desc: '15 referred salons go Active' },
];

const LEADERBOARD = [
  { name: 'Neha Verma', referrals: 9, earned: '₹1,120', initials: 'NV', color: 'bg-[#ffd9e1] text-[#ac0053]' },
  { name: 'Ritika Jain', referrals: 7, earned: '₹840', initials: 'RJ', color: 'bg-violet-50 text-violet-600' },
  { name: 'Ananya Iyer', referrals: 5, earned: '₹620', initials: 'AI', color: 'bg-amber-50 text-amber-600' },
];

const STATUS_STYLES: Record<ReferralStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Registered: 'bg-sky-50 text-sky-700 border-sky-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/** Live referral dashboard data (registry + localStorage referral context). */
function useReferralDashboard(ownCode: string | null): ReferralDashboardData {
  const [data, setData] = useState<ReferralDashboardData>(() => getReferralDashboard(ownCode));
  useEffect(() => {
    setData(getReferralDashboard(ownCode));
    return onReferralDashboardUpdated(() => setData(getReferralDashboard(ownCode)));
  }, [ownCode]);
  return data;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function ShareReferralPremium({ salonName, liveUrl, onNotify }: Props) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyDataUrl, setStoryDataUrl] = useState<string | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);

  const displayName = (salonName || 'Nexora Lumina').trim();

  // 1. DYNAMIC REFERRAL CODE — `NX-[WEBSITE_SHORT_NAME]-<YEAR>`, generated
  //    from the salon/website name. No static hardcoded codes anywhere.
  const code = getReferralCode(salonName);
  // 2. REFERRAL LINK — always targets the Sign-Up page with `?ref=<code>`.
  const referralLink = buildReferralLink(salonName);
  const shareText = buildReferralShareText(salonName, code, referralLink);

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  // 4. REAL-TIME REFERRAL DASHBOARD — referred salons, registration status
  //    (Pending / Registered / Active) and accumulated wallet credits, read
  //    from the referral context (`nexora_referral_code`) + registry.
  const dashboard = useReferralDashboard(code);
  const { totals, entries } = dashboard;

  const activeCount = totals.active;
  const bookedCount = totals.registered + totals.active;
  const nextTier = TIERS.find((t) => activeCount < t.min) || TIERS[TIERS.length - 1];
  const progressPct = Math.min(100, Math.round((activeCount / nextTier.min) * 100));

  useEffect(() => {
    if (!storyOpen) return;
    let active = true;
    setStoryDataUrl(null);
    try {
      const url = generateReferralStoryCard({
        salonName: displayName,
        code,
        link: referralLink,
      });
      if (active) setStoryDataUrl(url);
    } catch (err) {
      console.error('Story card generation failed:', err);
    }
    return () => {
      active = false;
    };
  }, [storyOpen, displayName, code, referralLink]);

  const copyText = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('Copy failed', e);
    }
    if (kind === 'code') {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      notify('Referral code copied to clipboard!');
    } else {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      notify('Referral link copied to clipboard!');
    }
  };

  /* ------------------------------------------------------------------ */
  /* 3. SOCIAL SHARING — Story / Facebook / Poster                        */
  /* ------------------------------------------------------------------ */

  /** Story: canvas card + native share sheet, with image download fallback. */
  const handleStoryShare = async () => {
    if (!storyDataUrl) return;
    setStoryBusy(true);
    const shared = await shareImageNatively(storyDataUrl, 'Nexora Refer & Earn', shareText, referralLink);
    setStoryBusy(false);
    if (shared) {
      notify('Story shared!');
      setStoryOpen(false);
      return;
    }
    const downloaded = downloadDataUrlImage(storyDataUrl, `nexora-story-${code}.png`);
    notify(
      downloaded
        ? 'Story image downloaded — add it to your Instagram Story!'
        : 'Could not generate the story on this device.',
    );
  };

  const handleStoryDownload = () => {
    if (!storyDataUrl) return;
    const ok = downloadDataUrlImage(storyDataUrl, `nexora-story-${code}.png`);
    notify(ok ? 'Story image downloaded.' : 'Story download failed on this device.');
  };

  /** Facebook: direct sharer URL for the referral link. */
  const handleFacebookShare = () => {
    const ok = shareToFacebook(referralLink);
    notify(
      ok
        ? 'Facebook share window opened — post your referral!'
        : 'Popup blocked — allow popups to share on Facebook.',
    );
  };

  /** Poster: canvas banner with salon name, rewards + dynamic code, then download. */
  const handlePosterDownload = () => {
    try {
      const url = generateReferralPoster({
        salonName: displayName,
        code,
        link: referralLink,
        rewardLine: 'Friends get 10% off their first service — you earn salon credit on every booked visit.',
      });
      const ok = downloadDataUrlImage(url, `nexora-poster-${code}.png`);
      notify(ok ? 'Poster downloaded — share it anywhere!' : 'Poster download failed on this device.');
    } catch (err) {
      console.error('Poster generation failed:', err);
      notify('Could not generate the poster on this device.');
    }
  };

  /** Invite Friends: native share sheet with formatted referral text + link. */
  const handleInviteFriends = async () => {
    const result = await shareReferralNatively(salonName);
    if (result === 'shared') notify('Invite shared!');
    else if (result === 'copied') notify('Invite text copied to clipboard — paste it anywhere.');
    else notify('Could not open the share sheet.');
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Share & Referral</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#ac0053] to-[#3f001a] text-white text-[10px] font-black uppercase tracking-widest shadow-sm">
              <Sparkles className="w-3 h-3" /> Premium
            </span>
          </div>
          <p className="text-xs md:text-sm text-gray-500">Refer salons & friends — they get 10% off, you earn salon credit with every booked visit.</p>
        </div>
        <button
          onClick={() => void handleInviteFriends()}
          className="flex items-center gap-2 px-4 py-2 bg-[#ac0053] hover:bg-[#ba005b] text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Invite Friends
        </button>
      </div>

      {/* 2. HERO BENTO — REFER & EARN */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3f001a] via-[#6d0b38] to-[#ac0053] text-white shadow-xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#ffd9e1]/20 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 p-8 md:p-10">
          {/* Left: pitch + code + share */}
          <div className="lg:col-span-3 flex flex-col justify-center gap-6">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-black uppercase tracking-widest">
              <Gift className="w-3.5 h-3.5" /> Nexora Refer & Earn
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                Invite salons & friends.
                <br />
                <span className="bg-gradient-to-r from-[#ffd9e1] to-white bg-clip-text text-transparent">You both earn rewards.</span>
              </h2>
              <p className="text-sm text-white/70 mt-3 max-w-md leading-relaxed">
                Share your code with salon owners and friends. When they sign up with it, you both unlock 10% salon credit instantly at {displayName}.
              </p>
            </div>

            {/* Referral code — dynamically generated from the salon name */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 bg-white/10 border border-white/25 rounded-2xl pl-4 pr-2 py-2 backdrop-blur-sm">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Your code</span>
                <span className="text-lg font-black tracking-[0.2em] text-white">{code}</span>
                <button
                  onClick={() => void copyText(code, 'code')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[#ac0053] text-xs font-black hover:bg-[#ffd9e1] transition-colors"
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-11 h-11 rounded-xl bg-white/10 border border-white/25 flex items-center justify-center hover:bg-white/20 transition-colors"
                  title="Share on WhatsApp"
                >
                  <MessageCircle className="w-5 h-5" />
                </a>
                <button
                  onClick={() => void copyText(referralLink, 'link')}
                  className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/10 border border-white/25 text-xs font-bold hover:bg-white/20 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  {linkCopied ? 'Link Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-white/50 font-mono break-all">
              {referralLink}
            </p>

            {dashboard.referredByCode && (
              <p className="flex items-center gap-1.5 text-[11px] text-white/60">
                <Lock className="w-3 h-3 text-[#ffd9e1]" />
                This salon joined via code{' '}
                <span className="font-mono font-bold text-white/80">{dashboard.referredByCode}</span>
              </p>
            )}

            {/* Share row */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Share via</span>
              <button
                onClick={() => setStoryOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                title="Generate & share an Instagram-style story card"
              >
                <Instagram className="w-3.5 h-3.5" /> Story
              </button>
              <button
                onClick={handleFacebookShare}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                title="Share on Facebook"
              >
                <Facebook className="w-3.5 h-3.5" /> Facebook
              </button>
              <button
                onClick={handlePosterDownload}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                title="Download a shareable poster image"
              >
                <Share2 className="w-3.5 h-3.5" /> Poster
              </button>
            </div>
          </div>

          {/* Right: live earnings summary */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Your wallet</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-black">
                  <TrendingUp className="w-3 h-3" /> Live
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black tracking-tight">₹{totals.totalCredits.toLocaleString()}</span>
                <span className="text-sm text-white/60 font-semibold mb-1.5">in credits</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/15">
                <div>
                  <span className="block text-[10px] font-bold text-white/50 uppercase">Referred salons</span>
                  <span className="text-lg font-black">{totals.referred}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-white/50 uppercase">Active salons</span>
                  <span className="text-lg font-black">{activeCount}</span>
                </div>
              </div>
              <div className="pt-1">
                <div className="flex justify-between text-[10px] font-bold text-white/60 uppercase tracking-wider mb-1.5">
                  <span>{activeCount}/{nextTier.min} → {nextTier.name}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#ffd9e1] to-white transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-[11px] text-white/60 mt-2 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#ffd9e1]" /> {Math.max(0, nextTier.min - activeCount)} more active salons to unlock {nextTier.name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. STAT CARDS (live from the referral registry) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Referred Salons</span>
            <span className="w-8 h-8 rounded-xl bg-[#ffd9e1]/40 border border-[#ffd9e1] flex items-center justify-center text-[#ac0053]">
              <UserPlus className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{totals.referred}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">Signed up with your code</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Salons</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{activeCount}</div>
          <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-1">
            <TrendingUp className="w-3.5 h-3.5" /> {bookedCount} registered overall
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Wallet Credits</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{totals.totalCredits.toLocaleString()}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">Accumulated — redeemable at the salon</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Rewards</span>
            <span className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
              <BadgePercent className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{totals.pendingCredits.toLocaleString()}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">Awaiting first visit</div>
        </div>
      </div>

      {/* 4. BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* How it works */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#ac0053]/10 text-[#ac0053] flex items-center justify-center"><PartyPopper className="w-4 h-4" /></span>
            How it works
          </h2>
          <div className="space-y-5">
            {[
              { step: '01', title: 'Share your code', desc: `Send your ${code} code or referral link to friends on WhatsApp, Instagram Story or Facebook.`, icon: <Share2 className="w-4 h-4" /> },
              { step: '02', title: 'They sign up & get 10% off', desc: 'The code is pre-filled and locked on the sign-up page, so the referral is credited automatically.', icon: <Gift className="w-4 h-4" /> },
              { step: '03', title: 'You earn credit', desc: 'Once their visit is completed, salon credit is added to your wallet. No limits.', icon: <Wallet className="w-4 h-4" /> },
            ].map(item => (
              <div key={item.step} className="flex gap-4">
                <div className="w-9 h-9 rounded-xl bg-[#3f001a] text-white flex items-center justify-center shrink-0 shadow-sm">{item.icon}</div>
                <div>
                  <p className="text-xs font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-[10px] font-black text-[#ac0053] tracking-widest">STEP {item.step}</span>
                  </p>
                  <p className="text-xs font-bold text-gray-900 mt-0.5">{item.title}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards tiers */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Award className="w-4 h-4" /></span>
            Rewards tiers
          </h2>
          <div className="space-y-3">
            {TIERS.map((tier, idx) => {
              const unlocked = activeCount >= tier.min;
              const isActive = idx === TIERS.findIndex(t => activeCount < t.min);
              return (
                <div
                  key={tier.name}
                  className={`relative p-4 rounded-xl border transition-all ${unlocked ? 'border-emerald-200 bg-emerald-50/40' : isActive ? 'border-[#ac0053]/40 bg-[#ffd9e1]/20 shadow-sm' : 'border-gray-100 bg-gray-50/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{tier.icon}</span>
                      <div>
                        <p className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                          {tier.name}
                          {unlocked && <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase">Unlocked</span>}
                          {isActive && !unlocked && <span className="text-[9px] font-black text-[#ac0053] bg-[#ffd9e1] px-1.5 py-0.5 rounded-full uppercase">Next</span>}
                        </p>
                        <p className="text-[11px] text-gray-500">{tier.desc}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-[#ac0053]">{tier.reward}</p>
                      <p className="text-[10px] text-gray-400 font-semibold">{tier.rewardLabel}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Referred salons — REAL-TIME registry */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Gift className="w-4 h-4" /></span>
              Referred Salons
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </h2>
            <button
              onClick={() => notify('Full referral report queued to your inbox')}
              className="flex items-center gap-1 text-[11px] font-bold text-[#ac0053] hover:underline"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-y border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-2.5">Salon</th>
                  <th className="px-6 py-2.5">Code</th>
                  <th className="px-6 py-2.5">Joined</th>
                  <th className="px-6 py-2.5">Registration Status</th>
                  <th className="px-6 py-2.5 text-right">Wallet Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-semibold">
                      No referred salons yet — share your {code} link to get started.
                    </td>
                  </tr>
                )}
                {entries.map(r => (
                  <tr key={r.id} className="hover:bg-[#ac0053]/[0.03] transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-[#ffd9e1]/60 text-[#ac0053] flex items-center justify-center text-[10px] font-black shrink-0">
                          {r.salonName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 max-w-[220px] truncate">{r.salonName}</p>
                          <p className="text-[10px] text-gray-400 font-semibold max-w-[220px] truncate">
                            {r.email}{r.demo ? ' · Demo' : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-gray-500 font-bold">{r.code}</td>
                    <td className="px-6 py-3.5 text-gray-500">{formatDate(r.joinedAt)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-[#ac0053]">
                      {r.credits > 0 ? `₹${r.credits.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-semibold text-gray-500">
            <span className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 rotate-90 text-[#ac0053]" />
              Credits: Pending ₹0 · Registered ₹{CREDITS_BY_STATUS.Registered} · Active ₹{CREDITS_BY_STATUS.Active} per salon
            </span>
            <button
              onClick={() => notify('Referral report exported')}
              className="text-[#ac0053] hover:underline font-bold"
            >
              Export
            </button>
          </div>
        </div>

        {/* Top referrers */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Crown className="w-4 h-4" /></span>
            Top referrers
          </h2>
          <div className="space-y-3">
            {LEADERBOARD.map((person, idx) => (
              <div key={person.name} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/40">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-[#ac0053] text-white' : idx === 1 ? 'bg-gray-900 text-white' : 'bg-amber-100 text-amber-700'}`}>
                  {idx + 1}
                </span>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black ${person.color}`}>{person.initials}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{person.name}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">{person.referrals} referrals</p>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-black text-gray-900">{person.earned}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Wallet detail */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Wallet className="w-4 h-4" /></span>
            Wallet breakdown
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
              <div>
                <p className="text-xs font-black text-gray-900">Available credits</p>
                <p className="text-[10px] text-gray-500">From {activeCount} active salon{activeCount === 1 ? '' : 's'}</p>
              </div>
              <p className="text-lg font-black text-emerald-600">₹{(activeCount * CREDITS_BY_STATUS.Active).toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl border border-sky-100 bg-sky-50/40">
              <div>
                <p className="text-xs font-black text-gray-900">Pending rewards</p>
                <p className="text-[10px] text-gray-500">{totals.registered} registered, awaiting first visit</p>
              </div>
              <p className="text-lg font-black text-sky-600">₹{totals.pendingCredits.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/40">
              <div>
                <p className="text-xs font-black text-gray-900">Pending sign-ups</p>
                <p className="text-[10px] text-gray-500">{totals.pending} awaiting email confirmation</p>
              </div>
              <p className="text-lg font-black text-gray-500">₹0</p>
            </div>
            <p className="text-[11px] text-gray-400 pt-1">
              Your code <span className="font-mono font-bold text-gray-600">{code}</span> is generated from{' '}
              <span className="font-bold text-gray-600">{displayName}</span> — it updates everywhere when your salon name changes.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Instagram / social Story card */}
      {storyOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setStoryOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Share referral story"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ac0053] to-[#ff2d8d] text-white flex items-center justify-center">
                  <Instagram className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Story Card</h3>
                  <p className="text-[10px] text-gray-500 font-semibold">1080 × 1920 — ready for Instagram</p>
                </div>
              </div>
              <button
                onClick={() => setStoryOpen(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                aria-label="Close story modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-gray-50/60 flex justify-center">
              {storyDataUrl ? (
                <img
                  src={storyDataUrl}
                  alt={`Referral story card for ${displayName}`}
                  className="w-44 sm:w-48 rounded-2xl shadow-lg border border-gray-200"
                />
              ) : (
                <div className="w-44 sm:w-48 aspect-[9/16] rounded-2xl bg-gradient-to-br from-[#3f001a] to-[#ac0053] flex items-center justify-center text-white/60 text-xs font-bold">
                  Generating…
                </div>
              )}
            </div>

            <div className="p-5 pt-3 space-y-2.5">
              <button
                onClick={() => void handleStoryShare()}
                disabled={!storyDataUrl || storyBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#ba005b] transition-colors disabled:opacity-50"
              >
                {storyBusy ? <span>Sharing…</span> : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Share to Story / App
                  </>
                )}
              </button>
              <button
                onClick={handleStoryDownload}
                disabled={!storyDataUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <ImageDown className="w-3.5 h-3.5" /> Download Story Image
              </button>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Sharing opens your device&apos;s share sheet with the card attached. If it isn&apos;t
                available, the image is downloaded automatically — attach it to your Instagram Story.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
