import { safeGetItem, safeSetItem } from './safeStorage';

export const REFERRAL_STORAGE_KEY = 'nexora_referral_code';
export const REFERRED_SALONS_STORAGE_KEY = 'nexora_referred_salons';
export const REFERRAL_REWARDS_PAID_KEY = 'nexora_referral_rewards_paid';

export type ReferralRegistrationStatus = 'published' | 'in_progress' | 'pending' | 'verified';
export type RewardStatus = 'credited' | 'pending' | 'paid_out';

export interface ReferredSalon {
  id: string;
  salonName: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  registrationDate: string;
  status: ReferralRegistrationStatus;
  themeName: string;
  plan: string;
  rewardAmount: number;
  rewardStatus: RewardStatus;
  commissionRate: string;
  lastActive: string;
  location?: string;
  referralCodeUsed: string;
}

export interface ReferralMetrics {
  totalReferredSalons: number;
  activeSalons: number;
  inProgressSalons: number;
  pendingSalons: number;
  totalRewardsAccumulated: number;
  rewardsPending: number;
  rewardsPaidOut: number;
  availableBalance: number;
  referralCode: string;
  partnerTier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  tierBonusRate: string;
}

const DEFAULT_REFERRED_SALONS: ReferredSalon[] = [
  {
    id: 'ref-101',
    salonName: 'Aura Luxury Hair & Spa',
    ownerName: 'Pooja Deshmukh',
    ownerEmail: 'pooja.aura@example.com',
    ownerPhone: '+91 98201 44552',
    registrationDate: '2026-08-14',
    status: 'published',
    themeName: 'Luxury Hair & Spa',
    plan: 'Annual Pro (₹14,999/yr)',
    rewardAmount: 1500,
    rewardStatus: 'credited',
    commissionRate: '10% Tier 1 Bonus',
    lastActive: 'Today, 2:15 PM',
    location: 'Bandra West, Mumbai',
    referralCodeUsed: 'NX-GROWTH-2026',
  },
  {
    id: 'ref-102',
    salonName: 'The Gentlemen’s Barber & Grooming Club',
    ownerName: 'Vikram Singh Chauhan',
    ownerEmail: 'vikram.barber@example.com',
    ownerPhone: '+91 98112 33441',
    registrationDate: '2026-08-18',
    status: 'published',
    themeName: 'Classic Vintage Barber',
    plan: 'Quarterly Growth (₹4,499)',
    rewardAmount: 650,
    rewardStatus: 'credited',
    commissionRate: '10% First Booking Bonus',
    lastActive: 'Yesterday, 6:40 PM',
    location: 'Indiranagar, Bengaluru',
    referralCodeUsed: 'NX-GROWTH-2026',
  },
  {
    id: 'ref-103',
    salonName: 'Glitz Nail & Lash Artistry',
    ownerName: 'Simran Kaur',
    ownerEmail: 'simran.glitz@example.com',
    ownerPhone: '+91 97410 88990',
    registrationDate: '2026-08-20',
    status: 'in_progress',
    themeName: 'Nail & Lash Boutique',
    plan: 'Monthly Starter (₹1,499/mo)',
    rewardAmount: 400,
    rewardStatus: 'pending',
    commissionRate: 'Pending Website Launch',
    lastActive: '3 hours ago',
    location: 'Sector 29, Gurgaon',
    referralCodeUsed: 'NX-GROWTH-2026',
  },
  {
    id: 'ref-104',
    salonName: 'Velvet Glow Unisex Studio',
    ownerName: 'Amit Saxena',
    ownerEmail: 'amit.velvet@example.com',
    ownerPhone: '+91 98860 12345',
    registrationDate: '2026-08-21',
    status: 'pending',
    themeName: 'Modern Family Salon',
    plan: 'Free Trial',
    rewardAmount: 250,
    rewardStatus: 'pending',
    commissionRate: 'Pending Subscription',
    lastActive: 'Just registered',
    location: 'Koramangala, Bengaluru',
    referralCodeUsed: 'NX-GROWTH-2026',
  },
  {
    id: 'ref-105',
    salonName: 'Serene Botanical Ayur-Spa',
    ownerName: 'Dr. Ananya Nair',
    ownerEmail: 'ananya.ayur@example.com',
    ownerPhone: '+91 94470 55667',
    registrationDate: '2026-08-08',
    status: 'published',
    themeName: 'Ayurvedic Wellness Spa',
    plan: 'Annual Pro (₹14,999/yr)',
    rewardAmount: 1500,
    rewardStatus: 'paid_out',
    commissionRate: '10% Tier 1 Bonus',
    lastActive: 'Active 1 day ago',
    location: 'Alwarpet, Chennai',
    referralCodeUsed: 'NX-GROWTH-2026',
  },
];

/** Read the stored referral code from localStorage or return fallback */
export function getStoredReferralCode(): string {
  const code = safeGetItem(REFERRAL_STORAGE_KEY);
  if (code && code.trim()) {
    return code.trim();
  }
  return 'NX-OWNER-2026';
}

/** Set or update the stored referral code */
export function setStoredReferralCode(code: string): void {
  if (!code.trim()) return;
  safeSetItem(REFERRAL_STORAGE_KEY, code.trim());
}

/** Load all referred salons from storage or initialize default */
export function getReferredSalons(): ReferredSalon[] {
  const raw = safeGetItem(REFERRED_SALONS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      /* fallback */
    }
  }

  const activeCode = getStoredReferralCode();
  const initialized = DEFAULT_REFERRED_SALONS.map((salon) => ({
    ...salon,
    referralCodeUsed: activeCode,
  }));
  safeSetItem(REFERRED_SALONS_STORAGE_KEY, JSON.stringify(initialized));
  return initialized;
}

/** Save updated referred salons array */
export function saveReferredSalons(salons: ReferredSalon[]): void {
  safeSetItem(REFERRED_SALONS_STORAGE_KEY, JSON.stringify(salons));
}

/** Add a newly invited / referred salon */
export function addReferredSalon(newSalon: Omit<ReferredSalon, 'id' | 'registrationDate' | 'referralCodeUsed' | 'rewardStatus'>): ReferredSalon {
  const salons = getReferredSalons();
  const code = getStoredReferralCode();
  const record: ReferredSalon = {
    ...newSalon,
    id: `ref-${Date.now()}`,
    registrationDate: new Date().toISOString().split('T')[0],
    referralCodeUsed: code,
    rewardStatus: newSalon.status === 'published' ? 'credited' : 'pending',
  };

  const updated = [record, ...salons];
  saveReferredSalons(updated);
  return record;
}

/** Compute overall metrics and partner tier */
export function calculateReferralMetrics(salons: ReferredSalon[], referralCode: string): ReferralMetrics {
  const totalReferredSalons = salons.length;
  const activeSalons = salons.filter((s) => s.status === 'published' || s.status === 'verified').length;
  const inProgressSalons = salons.filter((s) => s.status === 'in_progress').length;
  const pendingSalons = salons.filter((s) => s.status === 'pending').length;

  const totalRewardsAccumulated = salons.reduce((acc, s) => acc + (s.rewardAmount || 0), 0);
  const rewardsPending = salons
    .filter((s) => s.rewardStatus === 'pending')
    .reduce((acc, s) => acc + (s.rewardAmount || 0), 0);
  const rewardsPaidOut = salons
    .filter((s) => s.rewardStatus === 'paid_out')
    .reduce((acc, s) => acc + (s.rewardAmount || 0), 0);
  const availableBalance = salons
    .filter((s) => s.rewardStatus === 'credited')
    .reduce((acc, s) => acc + (s.rewardAmount || 0), 0);

  let partnerTier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' = 'Bronze';
  let tierBonusRate = '5% Direct Commission';

  if (activeSalons >= 10) {
    partnerTier = 'Platinum';
    tierBonusRate = '20% Recurring + ₹2,500 Milestone Bonus';
  } else if (activeSalons >= 5) {
    partnerTier = 'Gold';
    tierBonusRate = '15% Direct + Priority Partner Support';
  } else if (activeSalons >= 2) {
    partnerTier = 'Silver';
    tierBonusRate = '10% Direct Commission';
  }

  return {
    totalReferredSalons,
    activeSalons,
    inProgressSalons,
    pendingSalons,
    totalRewardsAccumulated,
    rewardsPending,
    rewardsPaidOut,
    availableBalance,
    referralCode,
    partnerTier,
    tierBonusRate,
  };
}

/** Request withdrawal or credit transfer for accumulated rewards */
export function claimReferralRewards(): { success: boolean; claimedAmount: number; message: string } {
  const salons = getReferredSalons();
  const creditedSalons = salons.filter((s) => s.rewardStatus === 'credited');
  const claimableAmount = creditedSalons.reduce((acc, s) => acc + s.rewardAmount, 0);

  if (claimableAmount <= 0) {
    return {
      success: false,
      claimedAmount: 0,
      message: 'No available rewards ready for payout at this time.',
    };
  }

  const updated = salons.map((s) => (s.rewardStatus === 'credited' ? { ...s, rewardStatus: 'paid_out' as RewardStatus } : s));
  saveReferredSalons(updated);

  return {
    success: true,
    claimedAmount: claimableAmount,
    message: `₹${claimableAmount.toLocaleString('en-IN')} has been successfully transferred to your salon payout account / wallet!`,
  };
}
