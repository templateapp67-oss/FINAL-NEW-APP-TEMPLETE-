import React, { useState } from 'react';
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
} from 'lucide-react';

interface Props {
  salonName?: string;
  liveUrl?: string;
  onNotify?: (msg: string) => void;
}

const REFERRAL_CODE = 'LUMINA-25';

const TIERS = [
  { name: 'Silver', min: 3, reward: '₹250', rewardLabel: 'Salon credit', icon: '🥈', desc: '3 friends book a service' },
  { name: 'Gold', min: 8, reward: '₹750', rewardLabel: 'Salon credit', icon: '🥇', desc: '8 friends book a service' },
  { name: 'Platinum', min: 15, reward: 'Free Signature Package', rewardLabel: 'Full luxury package', icon: '💎', desc: '15 friends book a service' },
];

const LEADERBOARD = [
  { name: 'Neha Verma', referrals: 9, earned: '₹1,120', initials: 'NV', color: 'bg-[#ffd9e1] text-[#ac0053]' },
  { name: 'Ritika Jain', referrals: 7, earned: '₹840', initials: 'RJ', color: 'bg-violet-50 text-violet-600' },
  { name: 'Ananya Iyer', referrals: 5, earned: '₹620', initials: 'AI', color: 'bg-amber-50 text-amber-600' },
];

const RECENT_REFERRALS = [
  { id: '#NX-10482', friend: 'Meera Nair', service: 'Nourishing Hair Spa', date: '10 Aug 2026', status: 'Booked', reward: '₹120' },
  { id: '#NX-10479', friend: 'Sana Khan', service: 'Haircut & Blow-Dry', date: '09 Aug 2026', status: 'Booked', reward: '₹120' },
  { id: '#NX-10471', friend: 'Kavya Menon', service: 'HD Bridal Makeup', date: '08 Aug 2026', status: 'Booked', reward: '₹450' },
  { id: '#NX-10462', friend: 'Ishita Bose', service: 'Signature Facial', date: '06 Aug 2026', status: 'Pending', reward: '—' },
];

export default function ShareReferralPremium({ salonName, liveUrl, onNotify }: Props) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

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

  const referralLink = `https://${liveUrl || 'nexora.site/lumina'}?ref=${REFERRAL_CODE.toLowerCase()}`;
  const invitesSent = 24;
  const friendsBooked = 9;
  const creditsEarned = 1250;
  const pendingRewards = 300;
  const nextTier = TIERS[2]; // Platinum
  const progressPct = Math.min(100, Math.round((friendsBooked / nextTier.min) * 100));

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
          <p className="text-xs md:text-sm text-gray-500">Refer friends, they get 10% off — you earn salon credit with every booked visit.</p>
        </div>
        <button
          onClick={() => notify('Invite sent via WhatsApp — share sheet opened')}
          className="flex items-center gap-2 px-4 py-2 bg-[#ac0053] hover:bg-[#ba005b] text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Invite Friends
        </button>
      </div>

      {/* 2. LUMINA HERO BENTO — REFER & EARN */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3f001a] via-[#6d0b38] to-[#ac0053] text-white shadow-xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#ffd9e1]/20 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 p-8 md:p-10">
          {/* Left: pitch + code + share */}
          <div className="lg:col-span-3 flex flex-col justify-center gap-6">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-black uppercase tracking-widest">
              <Gift className="w-3.5 h-3.5" /> Nexora Lumina Refer & Earn
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                Invite friends.
                <br />
                <span className="bg-gradient-to-r from-[#ffd9e1] to-white bg-clip-text text-transparent">You both earn rewards.</span>
              </h2>
              <p className="text-sm text-white/70 mt-3 max-w-md leading-relaxed">
                Share your unique code with friends. When they book their first service at {salonName || 'Nexora Lumina'}, you both unlock 10% salon credit instantly.
              </p>
            </div>

            {/* Referral code */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 bg-white/10 border border-white/25 rounded-2xl pl-4 pr-2 py-2 backdrop-blur-sm">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Your code</span>
                <span className="text-lg font-black tracking-[0.2em] text-white">{REFERRAL_CODE}</span>
                <button
                  onClick={() => copyText(REFERRAL_CODE, 'code')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[#ac0053] text-xs font-black hover:bg-[#ffd9e1] transition-colors"
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Book your next service at ${salonName || 'Nexora Lumina'} and get 10% off — use my code ${REFERRAL_CODE}! ${referralLink}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-11 h-11 rounded-xl bg-white/10 border border-white/25 flex items-center justify-center hover:bg-white/20 transition-colors"
                  title="Share on WhatsApp"
                >
                  <MessageCircle className="w-5 h-5" />
                </a>
                <button
                  onClick={() => copyText(referralLink, 'link')}
                  className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/10 border border-white/25 text-xs font-bold hover:bg-white/20 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  {linkCopied ? 'Link Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Share row */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Share via</span>
              <button
                onClick={() => notify('Instagram story template opened')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
              >
                <Instagram className="w-3.5 h-3.5" /> Story
              </button>
              <button
                onClick={() => notify('Facebook post template opened')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
              >
                <Facebook className="w-3.5 h-3.5" /> Facebook
              </button>
              <button
                onClick={() => notify('Downloading shareable poster…')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Poster
              </button>
            </div>
          </div>

          {/* Right: earnings summary */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Your earnings</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-black">
                  <TrendingUp className="w-3 h-3" /> +18% this month
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black tracking-tight">₹{creditsEarned.toLocaleString()}</span>
                <span className="text-sm text-white/60 font-semibold mb-1.5">in credits</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/15">
                <div>
                  <span className="block text-[10px] font-bold text-white/50 uppercase">Invites sent</span>
                  <span className="text-lg font-black">{invitesSent}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-white/50 uppercase">Friends booked</span>
                  <span className="text-lg font-black">{friendsBooked}</span>
                </div>
              </div>
              <div className="pt-1">
                <div className="flex justify-between text-[10px] font-bold text-white/60 uppercase tracking-wider mb-1.5">
                  <span>{friendsBooked}/{nextTier.min} → {nextTier.name}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#ffd9e1] to-white transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-[11px] text-white/60 mt-2 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#ffd9e1]" /> {nextTier.min - friendsBooked} more bookings to unlock Platinum
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Invites Sent</span>
            <span className="w-8 h-8 rounded-xl bg-[#ffd9e1]/40 border border-[#ffd9e1] flex items-center justify-center text-[#ac0053]">
              <UserPlus className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{invitesSent}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">This month</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Friends Booked</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{friendsBooked}</div>
          <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-1">
            <TrendingUp className="w-3.5 h-3.5" /> +3 vs last month
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Credits Earned</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{creditsEarned.toLocaleString()}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">Redeemable at the salon</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Rewards</span>
            <span className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
              <BadgePercent className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-gray-900 mt-2">₹{pendingRewards.toLocaleString()}</div>
          <div className="text-[11px] font-semibold text-gray-500 mt-1">Awaiting friend's visit</div>
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
              { step: '01', title: 'Share your code', desc: 'Send your LUMINA-25 code or referral link to friends on WhatsApp, Instagram or in person.', icon: <Share2 className="w-4 h-4" /> },
              { step: '02', title: 'They book & get 10% off', desc: 'Friends get an instant 10% discount on their first service when they use your code at checkout.', icon: <Gift className="w-4 h-4" /> },
              { step: '03', title: 'You earn credit', desc: 'Once their visit is completed, 10% of the service value is credited to your salon wallet. No limits.', icon: <Wallet className="w-4 h-4" /> },
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
              const unlocked = friendsBooked >= tier.min;
              const isActive = idx === TIERS.findIndex(t => friendsBooked < t.min);
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

        {/* Recent referrals */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Gift className="w-4 h-4" /></span>
              Recent referrals
            </h2>
            <button className="flex items-center gap-1 text-[11px] font-bold text-[#ac0053] hover:underline">
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-y border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-2.5">Booking</th>
                  <th className="px-6 py-2.5">Friend</th>
                  <th className="px-6 py-2.5">Service</th>
                  <th className="px-6 py-2.5">Date</th>
                  <th className="px-6 py-2.5">Status</th>
                  <th className="px-6 py-2.5 text-right">Reward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {RECENT_REFERRALS.map(r => (
                  <tr key={r.id} className="hover:bg-[#ac0053]/[0.03] transition-colors">
                    <td className="px-6 py-3.5 font-mono text-[11px] text-gray-400 font-bold">{r.id}</td>
                    <td className="px-6 py-3.5 font-bold text-gray-900">{r.friend}</td>
                    <td className="px-6 py-3.5 text-gray-500">{r.service}</td>
                    <td className="px-6 py-3.5 text-gray-500">{r.date}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border ${r.status === 'Booked' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-[#ac0053]">{r.reward}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between text-[11px] font-semibold text-gray-500">
            <span className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 rotate-90 text-[#ac0053]" /> Credits auto-credit to your salon wallet after each completed visit
            </span>
            <button
              onClick={() => notify('Referral report exported')}
              className="text-[#ac0053] hover:underline font-bold"
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
