import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Leaf,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Scissors,
  Smartphone,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import type { SalonData, Service } from '../types';
import { displayService } from '../lib/displayService';
import { serviceDisplayPrice, formatCurrency } from '../lib/pricing';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import SiteSalonStatus from './SiteSalonStatus';
import SiteMyBookings from './SiteMyBookings';
import { consumeBookingServicePrefill, salonDisplayName } from '../lib/siteBooking';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { useTickingNow, weekdayKeyOf } from '../lib/salonStatus';
import { bookingAvailabilityExtras } from '../lib/siteBookingAvailability';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
import { dayLabel, translateCategory } from '../lib/siteI18n';
import { bookingFlowText, fillBookingText } from '../lib/siteBookingI18n';
import { bookingSurfaces } from '../lib/siteBookingTheme';
import type { BookingFlowSurface } from '../lib/siteBookingTheme';
import {
  BOOKING_HOLD_EVENT,
  BOOKING_MAX_SERVICES,
  BOOKING_STEP_IDS,
  bookingCombinedSlotService,
  bookingDatesStatus,
  bookingDayList,
  bookingSalonContext,
  bookingSelectedServices,
  bookingSelectionSummary,
  bookingServicesByCategory,
  bookingServicesForTheme,
  bookingSlotIsStillAvailable,
  bookingSlotsForDay,
  releaseBookingSlot,
  reserveBookingSlot,
  toggleBookingService,
  validateBookingCustomer,
} from '../lib/siteBookingFlow';
import { readBookingDraft, saveBookingDraft } from '../lib/siteBookingDraft';
import { injectedSectionStatus } from '../lib/siteStructure';
import type { SectionStatus } from '../lib/siteStructure';
import { THEME_LABELS } from '../lib/themeServices';
import type { BookingDayInfo, BookingSlot, BookingStepId } from '../lib/siteBookingFlow';
import type { BookingNoticeInput } from '../lib/siteBookingNotices';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  /** One of the five database-backed theme ids (drives visuals + isolation). */
  themeId: SiteHeaderThemeId;
  data: SalonData;
  onBackToWebsite: () => void;
  /**
   * PHASE 16.9 — the EXISTING toast seam, upgraded to typed notices.
   * Plain strings (every pre-16.9 caller) still work and render as `info`.
   */
  onShowToast?: (input: BookingNoticeInput) => void;
  /**
   * PHASE 10.7 — handed the resolved booking context when the user taps
   * the Confirm button on the Summary step. The host swaps the entry flow
   * for the payment + confirmation + receipt flow. Optional: the 10.6 host
   * (which renders only the entry flow) does not provide it, and the
   * summary Confirm button keeps its 10.6 "next phase" toast behaviour.
   */
  onProceedToPayment?: (payload: {
    service: { id: string };
    /** PHASE 16.5 — every selected line (offer-aware price + duration). */
    serviceLines: Array<{ serviceId: string; serviceName: string; price: number; durationMinutes: number }>;
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
  }) => void;
  /**
   * PHASE 16.5 — when the visitor backs OUT of the payment flow, the host
   * remounts this component with `resumeAtSummary` so the journey lands
   * back on the Booking Summary with every selection (restored from the
   * 16.1 draft) intact — nothing is lost by looking at the payment screen.
   * Falls back to the normal start when the draft can't support a summary.
   */
  resumeAtSummary?: boolean;
}

/* ------------------------------------------------------------------ */
/* Per-theme visual design (structure is common, visuals are NOT).     */
/* ------------------------------------------------------------------ */

interface FlowDesign {
  /** Typography / shape personality for the five shared building blocks. */
  card: string;
  chip: string;
  primary: string;
  primaryShadow: string;
  secondary: string;
  stepTitle: string;
  stepChip: string;
  stepChipDone: string;
  input: string;
  slot: string;
  dateCard: string;
  serviceRow: string;
  label: string;
  sectionTitle: string;
  /** Small brand flourish next to the flow title. */
  flourish: (s: BookingFlowSurface) => ReactNode;
  /** Primary button decoration (nail uses a gradient, barber a flat gold). */
  primaryStyle: (s: BookingFlowSurface) => CSSProperties;
  /** Category chip selected decoration. */
  catSelectedStyle: (s: BookingFlowSurface) => CSSProperties;
}

const FLOW_DESIGNS: Record<SiteHeaderThemeId, FlowDesign> = {
  /* 1 · BARBER — sharp corners, engraving type, numbered rows, gold. */
  barber_mens_grooming: {
    card: 'border rounded-none shadow-sm',
    chip: 'border rounded-none',
    primary: 'rounded-none font-black uppercase tracking-[0.18em] text-[11px] py-3.5 transition-all hover:brightness-110 active:scale-[0.99]',
    primaryShadow: 'none',
    secondary: 'rounded-none border font-black uppercase tracking-[0.18em] text-[11px] py-3 transition-colors',
    stepTitle: 'font-black uppercase tracking-[0.08em]',
    stepChip: 'rounded-none border font-black uppercase text-[9px] tracking-[0.2em]',
    stepChipDone: 'rounded-none font-black uppercase text-[9px] tracking-[0.2em]',
    input: 'rounded-none border',
    slot: 'rounded-none border-2 font-black text-xs uppercase tracking-[0.08em]',
    dateCard: 'rounded-none border-2',
    serviceRow: 'rounded-none border',
    label: 'text-[9px] font-black uppercase tracking-[0.3em]',
    sectionTitle: 'font-black uppercase tracking-[0.12em] text-xs',
    flourish: (s) => <Scissors className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    catSelectedStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
  },

  /* 2 · HAIR STUDIO — editorial hairlines, serif headings, rose-gold. */
  hair_studio_color_bar: {
    card: 'border rounded-md shadow-none',
    chip: 'border rounded-md',
    primary: 'rounded-md font-serif font-semibold uppercase tracking-[0.16em] text-xs py-3.5 border transition-colors',
    primaryShadow: 'none',
    secondary: 'rounded-md border font-serif text-xs uppercase tracking-[0.16em] py-3 transition-colors',
    stepTitle: 'font-serif tracking-wide',
    stepChip: 'rounded-full border font-serif text-[9px] uppercase tracking-[0.18em]',
    stepChipDone: 'rounded-full font-serif text-[9px] uppercase tracking-[0.18em]',
    input: 'rounded-md border',
    slot: 'rounded-md border-2 font-serif text-xs',
    dateCard: 'rounded-md border-2',
    serviceRow: 'rounded-md border',
    label: 'text-[9px] font-medium uppercase tracking-[0.28em]',
    sectionTitle: 'font-serif text-xs uppercase tracking-[0.22em]',
    flourish: (s) => (
      <span className="font-serif italic text-sm leading-none" style={{ color: s.accent }}>No.</span>
    ),
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
    catSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accent, backgroundColor: s.accentSoft }),
  },

  /* 3 · BEAUTY SPA — soft pills, emerald wash, rounded sanctuary forms. */
  beauty_skin_spa: {
    card: 'border rounded-3xl shadow-sm',
    chip: 'border rounded-full',
    primary: 'rounded-full uppercase tracking-[0.18em] text-[11px] font-semibold py-3.5 transition-all hover:brightness-105 active:scale-[0.99] shadow-md',
    primaryShadow: 'none',
    secondary: 'rounded-full border text-[11px] font-semibold uppercase tracking-[0.14em] py-3 transition-colors',
    stepTitle: 'font-serif tracking-wide',
    stepChip: 'rounded-full text-[9px] font-semibold uppercase tracking-[0.16em]',
    stepChipDone: 'rounded-full text-[9px] font-semibold uppercase tracking-[0.16em]',
    input: 'rounded-2xl border',
    slot: 'rounded-full border-2 text-xs font-semibold',
    dateCard: 'rounded-2xl border-2',
    serviceRow: 'rounded-2xl border',
    label: 'text-[9px] font-semibold uppercase tracking-[0.24em]',
    sectionTitle: 'font-serif text-xs uppercase tracking-[0.2em]',
    flourish: (s) => <Leaf className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    catSelectedStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
  },

  /* 4 · FAMILY — friendly rounded cards, bold type, sky-blue energy. */
  family_full_service: {
    card: 'border rounded-2xl shadow-sm',
    chip: 'border rounded-lg',
    primary: 'rounded-xl font-extrabold text-xs py-3.5 transition-all hover:brightness-105 active:scale-[0.99]',
    primaryShadow: 'none',
    secondary: 'rounded-xl border font-extrabold text-xs py-3 transition-colors',
    stepTitle: 'font-extrabold tracking-tight',
    stepChip: 'rounded-lg text-[9px] font-extrabold uppercase tracking-[0.1em]',
    stepChipDone: 'rounded-lg text-[9px] font-extrabold uppercase tracking-[0.1em]',
    input: 'rounded-xl border',
    slot: 'rounded-xl border-2 font-bold text-xs',
    dateCard: 'rounded-xl border-2',
    serviceRow: 'rounded-xl border',
    label: 'text-[9px] font-extrabold uppercase tracking-[0.18em]',
    sectionTitle: 'font-extrabold text-xs uppercase tracking-[0.12em]',
    flourish: (s) => <Users className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    catSelectedStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
  },

  /* 5 · NAIL & LASH — pink flash, rounded-full, playful uppercase. */
  nail_lash_studio: {
    card: 'border rounded-3xl shadow-sm',
    chip: 'border rounded-full',
    primary: 'rounded-full font-extrabold text-[10px] uppercase tracking-[0.14em] py-3.5 transition-all hover:brightness-110 active:scale-[0.99]',
    primaryShadow: '0 6px 18px rgba(240,84,163,0.35)',
    secondary: 'rounded-full border font-extrabold text-[10px] uppercase tracking-[0.14em] py-3 transition-colors',
    stepTitle: 'font-extrabold uppercase tracking-[0.04em]',
    stepChip: 'rounded-full text-[8px] font-extrabold uppercase tracking-[0.16em]',
    stepChipDone: 'rounded-full text-[8px] font-extrabold uppercase tracking-[0.16em]',
    input: 'rounded-2xl border',
    slot: 'rounded-full border-2 font-extrabold text-xs',
    dateCard: 'rounded-2xl border-2',
    serviceRow: 'rounded-2xl border',
    label: 'text-[8px] font-extrabold uppercase tracking-[0.2em]',
    sectionTitle: 'font-extrabold text-xs uppercase tracking-[0.16em]',
    flourish: (s) => <Sparkles className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({
      backgroundImage: `linear-gradient(120deg, ${s.accent} 0%, ${s.accentHover} 100%)`,
      backgroundColor: s.accent,
      color: s.accentText,
    }),
    catSelectedStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
  },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SiteBookingFlow({ themeId, data, onBackToWebsite, onShowToast, onProceedToPayment, resumeAtSummary }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const now = useTickingNow(30_000);
  const T = bookingFlowText(locale);
  const s = bookingSurfaces(themeId, appearance);
  const D = FLOW_DESIGNS[themeId];

  // PHASE 12.3 — optional prefill: a Featured-service "Book Now" may hand the
  // flow a service to pre-select. Same single flow; the prefill is consumed
  // once on mount and prepended to the theme's own list so it stays selectable.
  const [initialPrefill] = useState<Service | null>(() => consumeBookingServicePrefill(themeId));
  const services = useMemo(() => {
    const base = bookingServicesForTheme(data, themeId);
    if (initialPrefill && !base.some((item) => item.id === initialPrefill.id)) {
      return [initialPrefill, ...base];
    }
    return base;
  }, [data, themeId, initialPrefill]);
  const categories = useMemo(() => bookingServicesByCategory(services), [services]);

  /* ---------- PHASE 16.1 · salon context + resumable draft ---------- */
  // The salon is ALWAYS the one whose website is open — derived from the
  // existing data, never picked from a list, never an invented id.
  const salonContext = useMemo(() => bookingSalonContext(data, themeId), [data, themeId]);
  // One draft per (business, theme, browser). Restored once on mount so a
  // closed/reopened flow keeps the visitor's selections; foreign-tenant or
  // foreign-theme drafts can never be read here (keyed lookups only).
  const [initialDraft] = useState(() => readBookingDraft(salonContext.businessId, themeId));

  /* ---------- wizard state (preserved while moving between steps) ---------- */
  // A service-specific "Book Now" (Phase 12.3 prefill) arrives from inside
  // this salon's own website, so the salon confirmation is already implicit
  // and the flow opens on the service step. A plain open starts on `salon`.
  // PHASE 16.5 — backing out of the payment flow lands on the summary with
  // the draft-restored selection (only when the draft actually reached it).
  const resumeSummaryValid = Boolean(
    resumeAtSummary
    && !initialPrefill
    && initialDraft
    && initialDraft.status === 'summary_ready'
    && initialDraft.dateKey
    && initialDraft.startMinutes != null
    && initialDraft.customer?.name
    && initialDraft.customer?.mobile,
  );
  const [step, setStep] = useState<BookingStepId>(
    resumeSummaryValid ? 'summary' : initialPrefill ? 'service' : 'salon',
  );
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // PHASE 16.2 — MULTI-SERVICE selection: an ordered id list. The first
  // service stays auto-selected on open (10.6 behaviour); a resumed draft
  // restores every line that still exists on the active theme.
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() => {
    if (initialPrefill) return [initialPrefill.id];
    const draftIds = (initialDraft?.services?.length
      ? initialDraft.services.map((line) => line.serviceId)
      : initialDraft?.serviceId
        ? [initialDraft.serviceId]
        : []
    ).filter((id) => services.some((item) => item.id === id));
    if (draftIds.length > 0) return draftIds.slice(0, BOOKING_MAX_SERVICES);
    return services[0] ? [services[0].id] : [];
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(
    () => (resumeSummaryValid ? initialDraft?.dateKey ?? null : null),
  );
  const [selectedSlotMinutes, setSelectedSlotMinutes] = useState<number | null>(
    () => (resumeSummaryValid ? initialDraft?.startMinutes ?? null : null),
  );
  const [holdKey, setHoldKey] = useState<string | null>(null);
  const [holdsVersion, setHoldsVersion] = useState(0);
  const [customer, setCustomer] = useState(
    () => initialDraft?.customer ?? { name: '', mobile: '', email: '', notes: '' },
  );
  const [formTouched, setFormTouched] = useState(false);
  // PHASE 16.9 — per-field touch so validation messages appear as soon as
  // the visitor leaves an invalid field (the Continue button stays gated
  // exactly as in 10.6/16.1 — a disabled action is never used to hide the
  // reason the form cannot proceed).
  const [touchedFields, setTouchedFields] = useState<{ name: boolean; mobile: boolean; email: boolean }>({
    name: false,
    mobile: false,
    email: false,
  });
  const showFieldError = (field: 'name' | 'mobile' | 'email'): boolean =>
    formTouched || touchedFields[field];
  const draftResumed = !initialPrefill && !!initialDraft
    && !!(initialDraft.serviceId || initialDraft.services?.length || initialDraft.customer?.name || initialDraft.customer?.mobile);

  /* PHASE 16.9 — navigation lock: set by every step transition, cleared
   * once the new step has rendered (see the effect below). Guards against
   * double-click/double-tap skipping a step. */
  const stepLockRef = useRef(false);
  useEffect(() => {
    stepLockRef.current = false;
  }, [step]);

  /* PHASE 16.2 — service-list state through the EXISTING shared section
   * seam ('services'): loading / error / empty / ready. Retry re-reads the
   * seam so a recovered source renders immediately. */
  const [serviceListRetry, setServiceListRetry] = useState(0);
  const serviceListState: SectionStatus = useMemo(() => {
    const forced = injectedSectionStatus('services');
    if (forced === 'loading' || forced === 'error') return forced;
    return services.length === 0 ? 'empty' : 'ready';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceListRetry]);

  /* PHASE 16.2 — resolved selection + totals (ids that vanished from the
   * active catalog are dropped at resolve time; nothing is ever invented). */
  const selectedServices = useMemo(
    () => bookingSelectedServices(services, selectedServiceIds),
    [services, selectedServiceIds],
  );
  const selection = useMemo(
    () => bookingSelectionSummary(selectedServices, data.offers),
    [selectedServices, data.offers],
  );
  /** ONE bookable sitting for the existing slot/hold engine. */
  const slotService = useMemo(
    () => bookingCombinedSlotService(selectedServices),
    [selectedServices],
  );
  /** First selected service — kept for 16.1 draft compatibility + prefill. */
  const selectedService = selectedServices[0] || null;
  const selectedDate = selectedDateKey ? new Date(`${selectedDateKey}T12:00:00`) : null;

  const days = useMemo(
    () => bookingDayList(data, 14, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, now.getTime()],
  );

  /* PHASE 16.3 — availability context: real booked spans (existing 10.7
   * records, salon+theme keyed) + staff windows (existing team schedule ↔
   * assignedServiceIds relationship). Recomputed whenever the salon,
   * selection, date, holds or booking records change. */
  const [recordsVersion, setRecordsVersion] = useState(0);
  useEffect(() => {
    const bump = () => setRecordsVersion((v) => v + 1);
    window.addEventListener(PAYMENT_EVENT, bump);
    return () => window.removeEventListener(PAYMENT_EVENT, bump);
  }, []);

  const slotExtras = useMemo(
    () => bookingAvailabilityExtras(
      data,
      salonContext.businessId,
      themeId,
      selectedServices,
      selectedDate ? weekdayKeyOf(selectedDate) : null,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, salonContext.businessId, themeId, selectedServices, selectedDateKey, recordsVersion],
  );

  /* PHASE 16.3 — availability state for the time step, through the SAME
   * shared seam (the 'booking' section key). loading / error are forceable
   * for tests and future async sources; ready renders the computed grid. */
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const availabilityState: 'loading' | 'error' | 'ready' = useMemo(() => {
    const forced = injectedSectionStatus('booking');
    if (forced === 'loading' || forced === 'error') return forced;
    return 'ready';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityRetry, selectedDateKey, slotService?.id]);

  const slots: BookingSlot[] = useMemo(() => {
    if (!slotService || !selectedDate) return [];
    return bookingSlotsForDay(data, themeId, slotService, selectedDate, now, slotExtras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, themeId, slotService?.id, selectedDateKey, now.getTime(), holdsVersion, slotExtras]);

  /* PHASE 16.9 — date-step state through its OWN seam (loading / error
   * forceable for tests + future async sources), independent of the
   * 'booking' seam the 16.3 slot states use. Retry re-reads the seam. */
  const [dateRetry, setDateRetry] = useState(0);
  const dateState: 'loading' | 'error' | 'ready' = useMemo(
    () => bookingDatesStatus(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateRetry, selectedDateKey],
  );

  const visibleServices = useMemo(
    () => (categoryFilter ? services.filter((item) => item.category === categoryFilter) : services),
    [services, categoryFilter],
  );

  /* Foreign holds landing while we look at the grid must refresh it. */
  useEffect(() => {
    const bump = () => setHoldsVersion((v) => v + 1);
    window.addEventListener(BOOKING_HOLD_EVENT, bump);
    return () => window.removeEventListener(BOOKING_HOLD_EVENT, bump);
  }, []);

  /* PHASE 16.1 — keep the salon+theme-scoped draft in sync with progress.
   * Idempotent upsert (one row per business/theme/browser), so refreshes
   * and re-renders never duplicate anything. Later phases convert a
   * `summary_ready` draft into the real payment/confirmation records. */
  useEffect(() => {
    // Sitting on the salon confirmation card is not progress yet — only
    // steps after it write the draft (keeps a plain open/close side-effect free).
    if (step === 'salon') return;
    // PHASE 16.2 — the draft snapshots EVERY selected line plus the totals;
    // the 16.1 single-service fields mirror the first line + summed values
    // so earlier consumers keep working unchanged.
    const firstLine = selection.lines[0] || null;
    saveBookingDraft({
      businessId: salonContext.businessId,
      themeId,
      status: step === 'summary' ? 'summary_ready' : 'in_progress',
      step,
      serviceId: firstLine?.service.id ?? null,
      serviceName: firstLine?.service.name ?? null,
      servicePrice: selection.count > 0 ? selection.totalPrice : null,
      serviceDurationMinutes: selection.count > 0 ? selection.totalDurationMinutes : null,
      services: selection.lines.map((line) => ({
        serviceId: line.service.id,
        serviceName: line.service.name,
        category: line.service.category,
        price: line.finalPrice,
        durationMinutes: line.durationMinutes,
      })),
      totalPrice: selection.count > 0 ? selection.totalPrice : null,
      totalDurationMinutes: selection.count > 0 ? selection.totalDurationMinutes : null,
      dateKey: selectedDateKey,
      startMinutes: selectedSlotMinutes,
      endMinutes:
        selectedSlotMinutes != null && selection.count > 0
          ? selectedSlotMinutes + selection.totalDurationMinutes
          : null,
      customer,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selection, selectedDateKey, selectedSlotMinutes, customer, salonContext.businessId, themeId]);

  /* ---------- slot picking + double-booking guard ---------- */
  const pickSlot = useCallback(
    (slot: BookingSlot) => {
      if (!slotService || !selectedDateKey) return;
      if (slot.state === 'past' || slot.state === 'taken') return;
      // PHASE 16.2 — the hold covers the COMBINED sitting (summed duration),
      // so a multi-service appointment blocks its entire span for others.
      // PHASE 16.3 — extras: booked spans + staff windows + salon stamp.
      const result = reserveBookingSlot(themeId, slotService, selectedDateKey, slot.minutes, slotExtras);
      if (!result.ok || !result.hold) {
        setHoldsVersion((v) => v + 1);
        // PHASE 16.9 — booking-error feedback through the EXISTING toast seam.
        onShowToast?.({ kind: 'error', message: T.slotLost });
        return;
      }
      if (holdKey && holdKey !== result.hold.key) releaseBookingSlot(holdKey);
      setHoldKey(result.hold.key);
      setSelectedSlotMinutes(slot.minutes);
      setHoldsVersion((v) => v + 1);
    },
    [themeId, slotService, selectedDateKey, holdKey, onShowToast, T, slotExtras],
  );

  /* Entering the time step always lands on a valid, held slot. */
  useEffect(() => {
    if (step !== 'time' || !slotService || !selectedDate) return;
    if (availabilityState !== 'ready') return; // 16.3 — no auto-hold while loading / error
    if (
      selectedSlotMinutes != null
      && bookingSlotIsStillAvailable(data, themeId, slotService, selectedDate, selectedSlotMinutes, now, slotExtras)
    ) {
      return;
    }
    // PHASE 16.3 — the visitor HAD a slot and lost it (someone booked the
    // span meanwhile). Never silently swap their time: clear the dead
    // selection, release the dead hold and tell them to pick again.
    if (selectedSlotMinutes != null) {
      onShowToast?.({ kind: 'error', message: T.slotLost });
      if (holdKey) releaseBookingSlot(holdKey);
      setHoldKey(null);
      setSelectedSlotMinutes(null);
      setHoldsVersion((v) => v + 1);
      return;
    }
    // Initial entry with no selection yet: auto-hold the first open slot.
    const first = bookingSlotsForDay(data, themeId, slotService, selectedDate, now, slotExtras).find(
      (slot) => slot.state === 'available' || slot.state === 'held',
    );
    if (first) pickSlot(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDateKey, slotService?.id, now.getTime(), recordsVersion, availabilityState]);

  /* PHASE 16.2 — toggle a service in/out of the multi-selection. Any change
   * to the selection invalidates the held slot (the sitting length changed). */
  const selectService = useCallback(
    (service: Service) => {
      const result = toggleBookingService(selectedServiceIds, service.id);
      if (!result.changed) {
        if (result.reason === 'limit') {
          onShowToast?.({
            kind: 'info',
            message: fillBookingText(T['service.limitNote'], { max: BOOKING_MAX_SERVICES }),
          });
        }
        return;
      }
      if (holdKey) releaseBookingSlot(holdKey);
      setSelectedServiceIds(result.ids);
      setSelectedSlotMinutes(null);
      setHoldKey(null);
      setHoldsVersion((v) => v + 1);
    },
    [selectedServiceIds, holdKey, onShowToast, T],
  );

  const clearSelectedServices = useCallback(() => {
    if (holdKey) releaseBookingSlot(holdKey);
    setSelectedServiceIds([]);
    setSelectedSlotMinutes(null);
    setHoldKey(null);
    setHoldsVersion((v) => v + 1);
  }, [holdKey]);

  const selectDate = useCallback(
    (day: BookingDayInfo) => {
      if (!day.selectable) return;
      if (holdKey) releaseBookingSlot(holdKey);
      setSelectedDateKey(day.dateKey);
      setSelectedSlotMinutes(null);
      setHoldKey(null);
      setHoldsVersion((v) => v + 1);
    },
    [holdKey],
  );

  /* ---------- navigation + gating ---------- */
  const customerErrors = validateBookingCustomer(customer);
  const detailsValid = !customerErrors.name && !customerErrors.mobile && !customerErrors.email;

  const stepIndex = BOOKING_STEP_IDS.indexOf(step);

  const canContinue = (() => {
    if (step === 'salon') return salonContext.hasServices;
    if (step === 'service') return selection.count > 0;
    if (step === 'date') {
      const day = days.find((item) => item.dateKey === selectedDateKey);
      return !!day && day.selectable;
    }
    if (step === 'time') return availabilityState === 'ready' && selectedSlotMinutes != null;
    if (step === 'details') return detailsValid;
    return true;
  })();

  const goNext = () => {
    // PHASE 16.9 — duplicate-submission guard for step navigation: two
    // rapid clicks must not skip a step. The lock clears once the new
    // step has rendered (see the effect below).
    if (stepLockRef.current) return;
    if (!canContinue) return;
    if (step === 'salon') {
      stepLockRef.current = true;
      setStep('service');
      return;
    }
    if (step === 'service' && selection.count > 0) {
      if (!selectedDateKey) {
        const firstOpen = days.find((day) => day.selectable);
        if (firstOpen) setSelectedDateKey(firstOpen.dateKey);
      }
      stepLockRef.current = true;
      setStep('date');
      return;
    }
    if (step === 'date') {
      stepLockRef.current = true;
      setStep('time');
      return;
    }
    if (step === 'time') {
      if (!slotService || !selectedDate || selectedSlotMinutes == null) return;
      if (!bookingSlotIsStillAvailable(data, themeId, slotService, selectedDate, selectedSlotMinutes, now, slotExtras)) {
        onShowToast?.({ kind: 'error', message: T.slotLost });
        setStep('time');
        return;
      }
      stepLockRef.current = true;
      setStep('details');
      return;
    }
    if (step === 'details') {
      setFormTouched(true);
      if (!detailsValid) return;
      stepLockRef.current = true;
      setStep('summary');
      return;
    }
  };

  const goBack = () => {
    if (stepLockRef.current) return;
    if (step === 'summary') {
      stepLockRef.current = true;
      setStep('details');
      return;
    }
    if (step === 'details') {
      stepLockRef.current = true;
      setStep('time');
      return;
    }
    if (step === 'time') {
      stepLockRef.current = true;
      setStep('date');
      return;
    }
    if (step === 'date') {
      stepLockRef.current = true;
      setStep('service');
      return;
    }
    if (step === 'service') {
      stepLockRef.current = true;
      setStep('salon');
      return;
    }
  };

  const jumpToStep = (target: BookingStepId) => {
    if (stepLockRef.current) return;
    const targetIndex = BOOKING_STEP_IDS.indexOf(target);
    if (targetIndex >= stepIndex) return; // only backward jumps are free
    if (target === 'summary') return; // summary is reached through details
    stepLockRef.current = true;
    setStep(target);
  };

  /* ---------- derived display data ---------- */
  const serviceDisplay = selectedService ? displayService(selectedService, locale) : null;
  // PHASE 16.2 — totals come from the selection summary (offer-aware,
  // variant-aware); single-selection values equal the 10.6 ones exactly.
  const totalPrice = selection.totalPrice;
  const totalDuration = selection.totalDurationMinutes;
  const isMultiService = selection.count > 1;
  const minuteLabel = locale === 'hi' ? 'मिनट' : 'min';
  const selectionCountLabel = selection.count === 1
    ? T['service.totalService']
    : fillBookingText(T['service.totalServices'], { count: selection.count });

  const dateLabel = (date: Date) =>
    date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const selectedDay = days.find((item) => item.dateKey === selectedDateKey);
  const selectedSlot = slots.find((slot) => slot.minutes === selectedSlotMinutes);

  const salonName = salonDisplayName(data, themeId);
  const nameStyle = { ...getSalonNameStyle(data) };
  if (!nameStyle.color) nameStyle.color = s.textStrong;

  const toast = (key: string) => onShowToast?.(T[key as keyof typeof T]);

  /* ---------- shared building blocks ---------- */
  const stepChipStyle = (id: BookingStepId): CSSProperties => {
    const index = BOOKING_STEP_IDS.indexOf(id);
    if (index < stepIndex) return { backgroundColor: s.success, color: '#ffffff', borderColor: s.success };
    if (index === stepIndex) return { backgroundColor: s.accent, color: s.accentText, borderColor: s.accent };
    return { backgroundColor: s.chip, color: s.muted, borderColor: s.chipLine };
  };

  const primaryBtnStyle: CSSProperties = canContinue
    ? { ...D.primaryStyle(s), boxShadow: D.primaryShadow }
    : { backgroundColor: s.disabled, color: s.disabledText, borderColor: 'transparent', boxShadow: 'none', cursor: 'not-allowed' };

  const summaryLine = (icon: ReactNode, label: string, value: ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="flex items-center gap-2 shrink-0" style={{ color: s.muted }}>
        {icon}
        <span className={D.label}>{label}</span>
      </span>
      <span className="text-right text-xs font-semibold break-words" style={{ color: s.textStrong }}>
        {value}
      </span>
    </div>
  );

  /* ================================================================ */
  return (
    <div
      data-testid="booking-flow"
      data-theme={themeId}
      data-appearance={appearance}
      data-locale={locale}
      data-step={step}
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden booking-page-container booking-wrapper step-container"
      style={{ backgroundColor: s.page, color: s.text }}
    >
      {/* ---- header ---- */}
      <header
        className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            data-testid="booking-close"
            onClick={onBackToWebsite}
            className={`${D.secondary} px-3 md:px-3.5 flex items-center gap-1.5 shrink-0 cursor-pointer`}
            style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            aria-label={T['flow.close']}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{T['flow.close']}</span>
          </button>
          <div className="min-w-0 flex items-center gap-2">
            <span className="truncate text-sm md:text-base font-bold" style={nameStyle}>
              {salonName}
            </span>
            <SiteSalonStatus themeId={themeId} data={data} placement="booking" compact />
          </div>
        </div>
        <span
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: s.well, color: s.muted, border: `1px solid ${s.chipLine}`, borderRadius: 8 }}
        >
          {fillBookingText(T['step.of'], { current: stepIndex + 1, total: BOOKING_STEP_IDS.length })}
        </span>
      </header>

      {/* ---- stepper ---- */}
      <div
        data-testid="booking-stepper"
        className="shrink-0 px-4 md:px-6 py-3 border-b flex items-center gap-1.5 md:gap-2 overflow-x-auto"
        style={{ backgroundColor: s.page, borderColor: s.line }}
      >
        {BOOKING_STEP_IDS.map((id, index) => {
          const isDone = index < stepIndex;
          const isCurrent = index === stepIndex;
          const label = T[`step.${id}` as keyof typeof T];
          return (
            <React.Fragment key={id}>
              {index > 0 && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: s.chipLine }} />}
              <button
                type="button"
                data-testid={`booking-step-${id}`}
                data-state={isDone ? 'done' : isCurrent ? 'current' : 'upcoming'}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => jumpToStep(id)}
                className={`${isDone ? D.stepChipDone : D.stepChip} px-2.5 md:px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap transition-colors ${isDone ? 'cursor-pointer' : isCurrent ? '' : 'cursor-default'}`}
                style={stepChipStyle(id)}
              >
                {isDone ? <Check className="w-3 h-3" /> : <span>{index + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ---- body ---- */}
      <main className="overflow-y-auto overflow-x-hidden custom-scrollbar booking-step-wrapper booking-step-content">
        <div
          data-testid="booking-body"
          className="max-w-5xl mx-auto w-full px-4 md:px-6 py-5 md:py-6 grid grid-cols-1 lg:grid-cols-12 gap-5"
        >
            {/* ===================== STEP 1 · SALON (PHASE 16.1) ===================== */}
            {step === 'salon' && (
              <motion.div
                key="step-salon"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['salon.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {T['salon.subtitle']}
                    </p>
                  </div>
                </div>

                <div
                  data-testid="booking-salon-card"
                  data-business-id={salonContext.businessId}
                  data-theme-id={salonContext.themeId}
                  className={`${D.card} p-4 md:p-5 flex flex-col gap-3`}
                  style={{ backgroundColor: s.card, borderColor: s.line }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base md:text-lg font-bold" style={nameStyle}>
                      {salonName}
                    </span>
                    <SiteSalonStatus themeId={themeId} data={data} placement="booking" compact />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="flex items-start gap-2 text-xs font-semibold" style={{ color: s.text }}>
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: s.accent }} />
                      <span>
                        <span className={`${D.label} block`} style={{ color: s.muted }}>{T['salon.address']}</span>
                        {salonContext.address || T['salon.addressPending']}
                      </span>
                    </span>
                    {salonContext.phone && (
                      <span className="flex items-start gap-2 text-xs font-semibold" style={{ color: s.text }}>
                        <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: s.accent }} />
                        <span>
                          <span className={`${D.label} block`} style={{ color: s.muted }}>{T['salon.phone']}</span>
                          {salonContext.phone}
                        </span>
                      </span>
                    )}
                    <span className="flex items-start gap-2 text-xs font-semibold" style={{ color: s.text }}>
                      <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: s.accent }} />
                      <span>
                        <span className={`${D.label} block`} style={{ color: s.muted }}>{T['salon.theme']}</span>
                        {THEME_LABELS[themeId] || themeId}
                      </span>
                    </span>
                  </div>

                  {salonContext.hasServices ? (
                    <p
                      data-testid="booking-salon-ready"
                      className="text-[11px] font-bold flex items-center gap-1.5 mt-1 p-2.5"
                      style={{ backgroundColor: s.successSoft, color: s.success, borderRadius: 10 }}
                    >
                      <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                      {fillBookingText(T['salon.servicesReady'], { count: services.length })}
                    </p>
                  ) : (
                    <p
                      data-testid="booking-salon-no-services"
                      className="text-[11px] font-bold flex items-center gap-1.5 mt-1 p-2.5"
                      style={{ backgroundColor: s.well, color: s.muted, borderRadius: 10 }}
                    >
                      {T['salon.noServices']}
                    </p>
                  )}

                  {draftResumed && (
                    <p
                      data-testid="booking-draft-resumed"
                      className="text-[10px] font-semibold p-2.5 border"
                      style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.muted, borderRadius: 10 }}
                    >
                      {T['salon.resume']}
                    </p>
                  )}

                  <p className="text-[10px] font-semibold" style={{ color: s.muted }}>
                    {T['salon.confirm']}
                  </p>
                </div>

                {/* PHASE 16.7 — this visitor's OWN bookings at THIS salon
                    (renders nothing when they have never booked here). */}
                <SiteMyBookings
                  themeId={themeId}
                  data={data}
                  businessId={salonContext.businessId}
                  onShowToast={onShowToast}
                />
              </motion.div>
            )}

            {/* ===================== STEP 2 · SERVICE ===================== */}
            {step === 'service' && (
              <motion.div
                key="step-service"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
                style={{ paddingBottom: '20px' }}
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['service.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {fillBookingText(T['service.subtitle'], { salon: salonName })}
                    </p>
                  </div>
                </div>

                {/* PHASE 16.2 — the booking service list honours the SAME
                    shared section-state seam the website 'services' section
                    uses (loading / error / empty), no second state system. */}
                {serviceListState === 'loading' ? (
                  <div
                    data-testid="booking-loading-services"
                    className={`${D.card} p-8 flex flex-col items-center gap-3`}
                    style={{ backgroundColor: s.card, borderColor: s.line }}
                    aria-busy="true"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`${D.serviceRow} h-16 animate-pulse`}
                          style={{ backgroundColor: s.well, borderColor: s.chipLine }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-semibold" style={{ color: s.muted }}>
                      {T['service.loading']}
                    </p>
                  </div>
                ) : serviceListState === 'error' ? (
                  <div
                    data-testid="booking-error-services"
                    className={`${D.card} p-8 text-center flex flex-col items-center gap-3`}
                    style={{ backgroundColor: s.card, borderColor: s.line }}
                  >
                    <p className="text-xs font-semibold" style={{ color: s.danger }}>
                      {T['service.error']}
                    </p>
                    <button
                      type="button"
                      data-testid="booking-retry-services"
                      onClick={() => setServiceListRetry((v) => v + 1)}
                      className={`${D.secondary} px-4 py-2 cursor-pointer`}
                      style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                    >
                      {T['service.retry']}
                    </button>
                  </div>
                ) : services.length === 0 ? (
                  <div
                    data-testid="booking-empty-services"
                    className={`${D.card} p-8 text-center text-xs font-semibold`}
                    style={{ backgroundColor: s.card, borderColor: s.line, color: s.muted }}
                  >
                    {T['service.empty']}
                  </div>
                ) : (
                  <>
                    {/* Category → service: isolated to the ACTIVE theme's list. */}
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      <button
                        type="button"
                        data-testid="booking-category-all"
                        onClick={() => setCategoryFilter(null)}
                        className={`${D.chip} px-3 py-1.5 text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer`}
                        style={
                          categoryFilter === null
                            ? D.catSelectedStyle(s)
                            : { backgroundColor: s.chip, color: s.muted, borderColor: s.chipLine }
                        }
                      >
                        {T['service.allCategories']}
                      </button>
                      {categories.map((group) => (
                        <button
                          key={group.category}
                          type="button"
                          data-testid={`booking-category-${group.category}`}
                          onClick={() => setCategoryFilter(group.category)}
                          className={`${D.chip} px-3 py-1.5 text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer`}
                          style={
                            categoryFilter === group.category
                              ? D.catSelectedStyle(s)
                              : { backgroundColor: s.chip, color: s.muted, borderColor: s.chipLine }
                          }
                        >
                          {translateCategory(group.category, locale)}
                        </button>
                      ))}
                    </div>

                    {/* PHASE 16.2 — multi-select hint. */}
                    <p className="text-[10px] font-semibold -mt-1" style={{ color: s.muted }}>
                      {T['service.multiHint']}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {visibleServices.map((service, index) => {
                        const shown = displayService(service, locale);
                        const pricing = serviceDisplayPrice(service, data.offers);
                        const isSelected = selectedServiceIds.includes(service.id);
                        return (
                          <button
                            key={service.id}
                            type="button"
                            data-testid={`booking-service-${service.id}`}
                            data-selected={isSelected}
                            onClick={() => selectService(service)}
                            className={`${D.serviceRow} text-left p-3.5 md:p-4 flex gap-3 items-start transition-all cursor-pointer`}
                            style={{
                              backgroundColor: isSelected ? s.accentSoft : s.card,
                              borderColor: isSelected ? s.accent : s.line,
                            }}
                          >
                            <span
                              className={`${D.stepChipDone} w-7 h-7 shrink-0 flex items-center justify-center`}
                              style={{
                                backgroundColor: isSelected ? s.accent : s.chip,
                                color: isSelected ? s.accentText : s.muted,
                                borderColor: isSelected ? s.accent : s.chipLine,
                              }}
                            >
                              {isSelected ? <Check className="w-3.5 h-3.5" /> : String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs md:text-sm font-bold truncate" style={{ color: s.textStrong }}>
                                  {shown.name}
                                </span>
                                {(pricing.offer?.promotionalBadge || service.promotionalBadge) && (
                                  <span
                                    className="px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide"
                                    style={{ backgroundColor: s.accentSoft, color: s.accent }}
                                  >
                                    {pricing.offer?.promotionalBadge || service.promotionalBadge}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] font-semibold mt-0.5 truncate" style={{ color: s.muted }}>
                                {translateCategory(service.category, locale)}
                                {shown.description ? ` · ${shown.description}` : ''}
                              </span>
                              <span className="mt-1.5 flex items-center gap-3">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: s.muted }}>
                                  <Clock className="w-3 h-3" style={{ color: s.accent }} />
                                  {service.duration} {locale === 'hi' ? 'मिनट' : 'min'}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold" style={{ color: s.accent }}>
                                  <CreditCard className="w-3 h-3" />
                                  {formatCurrency(pricing.finalPrice)}
                                </span>
                              </span>
                            </span>
                            <span
                              className="shrink-0 text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 mt-0.5"
                              style={{ backgroundColor: isSelected ? s.accent : s.chip, color: isSelected ? s.accentText : s.muted }}
                            >
                              {isSelected ? T['service.added'] : T['service.add']}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                  </>
                )}
              </motion.div>
            )}

            {/* ===================== STEP 2 · DATE ===================== */}
            {step === 'date' && (
              <motion.div
                key="step-date"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['date.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {T['date.subtitle']}
                    </p>
                  </div>
                </div>

                {/* PHASE 16.9 — date loading / error / empty states through the
                    date step's own seam (independent of the 16.3 slot seam). */}
                {dateState === 'loading' ? (
                  <div
                    data-testid="booking-loading-dates"
                    className={`${D.card} p-4 md:p-5 flex flex-col items-center gap-3`}
                    style={{ backgroundColor: s.card, borderColor: s.line }}
                    aria-busy="true"
                  >
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 w-full">
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className={`${D.dateCard} h-16 animate-pulse`}
                          style={{ backgroundColor: s.well, borderColor: s.chipLine }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-semibold" style={{ color: s.muted }}>
                      {T['date.loading']}
                    </p>
                  </div>
                ) : dateState === 'error' ? (
                  <div
                    data-testid="booking-error-dates"
                    className={`${D.card} p-6 text-center flex flex-col items-center gap-3`}
                    style={{ backgroundColor: s.card, borderColor: s.line }}
                  >
                    <p className="text-xs font-semibold" style={{ color: s.danger }}>
                      {T['date.error']}
                    </p>
                    <button
                      type="button"
                      data-testid="booking-retry-dates"
                      onClick={() => setDateRetry((v) => v + 1)}
                      className={`${D.secondary} px-4 py-2 cursor-pointer`}
                      style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                    >
                      {T['date.retry']}
                    </button>
                  </div>
                ) : days.every((day) => !day.selectable) ? (
                  <div
                    data-testid="booking-empty-dates"
                    className={`${D.card} p-6 text-center text-xs font-semibold`}
                    style={{ backgroundColor: s.card, borderColor: s.line, color: s.muted }}
                  >
                    {T['date.empty']}
                  </div>
                ) : (
                <div className={`${D.card} p-4 md:p-5`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {days.map((day) => {
                      const isSelected = day.dateKey === selectedDateKey;
                      const dayName = dayLabel(day.weekday, locale);
                      const monthName = day.date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short' });
                      const reasonLabel =
                        day.reason === 'holiday'
                          ? T['date.holiday']
                          : day.reason === 'closed' || day.reason === 'outside-window' || day.reason === 'past'
                            ? T['date.closed']
                            : undefined;
                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          data-testid={`booking-date-${day.dateKey}`}
                          data-date-selectable={day.selectable}
                          data-date-reason={day.reason || 'ok'}
                          data-selected={isSelected}
                          disabled={!day.selectable}
                          onClick={() => selectDate(day)}
                          className={`${D.dateCard} flex flex-col items-center justify-center px-1 py-2.5 md:py-3 transition-all ${
                            day.selectable ? 'cursor-pointer' : 'cursor-not-allowed'
                          }`}
                          style={{
                            backgroundColor: isSelected ? s.accentSoft : s.card,
                            borderColor: isSelected ? s.accent : day.selectable ? s.chipLine : s.disabled,
                          }}
                        >
                          <span
                            className="text-[8px] md:text-[9px] font-extrabold uppercase tracking-wider truncate max-w-full"
                            style={{ color: isSelected ? s.accent : day.selectable ? s.muted : s.disabledText }}
                          >
                            {day.isToday ? T['date.today'] : dayName.slice(0, 3)}
                          </span>
                          <span
                            className="text-base md:text-lg font-black leading-tight my-0.5"
                            style={{ color: isSelected ? s.accent : day.selectable ? s.textStrong : s.disabledText }}
                          >
                            {day.date.getDate()}
                          </span>
                          <span
                            className="text-[8px] md:text-[9px] font-bold uppercase tracking-wider"
                            style={{ color: isSelected ? s.accent : day.selectable ? s.muted : s.disabledText }}
                          >
                            {monthName}
                          </span>
                          <span
                            className="text-[7px] md:text-[8px] font-bold uppercase tracking-wide truncate max-w-full mt-0.5"
                            style={{ color: s.disabledText }}
                          >
                            {day.reason === 'holiday' ? day.holiday?.name || reasonLabel : reasonLabel || ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedDay && selectedDay.openLabel && selectedDay.closeLabel && (
                    <p className="mt-3 text-[10px] font-semibold flex items-center gap-1.5" style={{ color: s.muted }}>
                      <Clock className="w-3 h-3" style={{ color: s.accent }} />
                      {fillBookingText(T['time.openFrom'], { open: selectedDay.openLabel, close: selectedDay.closeLabel })}
                    </p>
                  )}
                </div>
                )}
              </motion.div>
            )}

            {/* ===================== STEP 3 · TIME ===================== */}
            {step === 'time' && (
              <motion.div
                key="step-time"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['time.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {T['time.subtitle']}
                    </p>
                  </div>
                </div>

                <div className={`${D.card} p-4 md:p-5`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <p className="text-xs font-bold" style={{ color: s.textStrong }}>
                      {selectedDate ? dateLabel(selectedDate) : ''}
                    </p>
                    {selectedDay?.openLabel && selectedDay?.closeLabel && (
                      <span
                        className="text-[10px] font-bold px-2 py-1"
                        style={{ backgroundColor: s.well, color: s.muted, borderRadius: 999 }}
                      >
                        {fillBookingText(T['time.openFrom'], { open: selectedDay.openLabel, close: selectedDay.closeLabel })}
                      </span>
                    )}
                  </div>

                  {/* PHASE 16.3 — availability loading / error / empty states. */}
                  {availabilityState === 'loading' ? (
                    <div
                      data-testid="booking-loading-slots"
                      className="p-4 flex flex-col items-center gap-3"
                      aria-busy="true"
                    >
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-2.5 w-full">
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div
                            key={i}
                            className={`${D.slot} h-10 animate-pulse`}
                            style={{ backgroundColor: s.well, borderColor: s.chipLine }}
                          />
                        ))}
                      </div>
                      <p className="text-xs font-semibold" style={{ color: s.muted }}>
                        {T['time.loading']}
                      </p>
                    </div>
                  ) : availabilityState === 'error' ? (
                    <div
                      data-testid="booking-error-slots"
                      className="p-6 text-center flex flex-col items-center gap-3"
                    >
                      <p className="text-xs font-semibold" style={{ color: s.danger }}>
                        {T['time.error']}
                      </p>
                      <button
                        type="button"
                        data-testid="booking-retry-slots"
                        onClick={() => setAvailabilityRetry((v) => v + 1)}
                        className={`${D.secondary} px-4 py-2 cursor-pointer`}
                        style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                      >
                        {T['time.retry']}
                      </button>
                    </div>
                  ) : slots.length === 0 ? (
                    <div
                      data-testid="booking-empty-slots"
                      className="p-6 text-center text-xs font-semibold"
                      style={{ color: s.muted }}
                    >
                      {T['time.noSlots']}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-2.5">
                      {slots.map((slot) => {
                        const isSelected = slot.minutes === selectedSlotMinutes;
                        const disabled = slot.state === 'past' || slot.state === 'taken';
                        const held = slot.state === 'held';
                        return (
                          <button
                            key={slot.minutes}
                            type="button"
                            data-testid={`booking-slot-${slot.minutes}`}
                            data-slot-state={slot.state}
                            data-selected={isSelected}
                            disabled={disabled}
                            onClick={() => pickSlot(slot)}
                            className={`${D.slot} py-2.5 px-2 text-center transition-all ${
                              disabled ? 'cursor-not-allowed line-through' : 'cursor-pointer'
                            }`}
                            style={
                              disabled
                                ? { backgroundColor: s.disabled, borderColor: s.disabled, color: s.disabledText }
                                : isSelected
                                  ? { backgroundColor: s.accent, borderColor: s.accent, color: s.accentText }
                                  : { backgroundColor: held ? s.successSoft : s.card, borderColor: held ? s.success : s.chipLine, color: s.textStrong }
                            }
                          >
                            {slot.startLabel}
                            {held && !isSelected && (
                              <span className="block text-[7px] font-bold uppercase tracking-wide mt-0.5" style={{ color: s.success }}>
                                {T['time.heldByYou']}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {availabilityState === 'ready' && selectedSlot && !disabledSlot(selectedSlot) && (
                    <p className="mt-3 text-[10px] font-semibold flex items-start gap-1.5" style={{ color: s.muted }}>
                      <CalendarCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: s.success }} />
                      {T['time.holdNote']}
                    </p>
                  )}
                  {availabilityState === 'ready' && slots.some((slot) => slot.state === 'taken') && (
                    <p
                      data-testid="booking-booked-note"
                      className="mt-2 text-[10px] font-semibold"
                      style={{ color: s.muted }}
                    >
                      {T['time.bookedNote']}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* ===================== STEP 4 · DETAILS ===================== */}
            {step === 'details' && (
              <motion.div
                key="step-details"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['details.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {T['details.subtitle']}
                    </p>
                  </div>
                </div>

                <div className={`${D.card} p-4 md:p-5 flex flex-col gap-4`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                  <label className="flex flex-col gap-1.5">
                    <span className={D.label} style={{ color: s.muted }}>
                      {T['details.name']} <span style={{ color: s.danger }}>*</span>
                    </span>
                    <input
                      type="text"
                      data-testid="booking-input-name"
                      value={customer.name}
                      onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                      onBlur={() => setTouchedFields((t) => ({ ...t, name: true }))}
                      placeholder={T['details.namePlaceholder']}
                      aria-invalid={showFieldError('name') && Boolean(customerErrors.name)}
                      aria-describedby={showFieldError('name') && customerErrors.name ? 'booking-err-name' : undefined}
                      className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none transition-colors`}
                      style={{
                        backgroundColor: s.well,
                        borderColor: showFieldError('name') && customerErrors.name ? s.danger : s.chipLine,
                        color: s.textStrong,
                      }}
                    />
                    {showFieldError('name') && customerErrors.name && (
                      <span id="booking-err-name" data-testid="booking-err-name" className="text-[10px] font-bold" style={{ color: s.danger }}>
                        {T['details.errName']}
                      </span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className={D.label} style={{ color: s.muted }}>
                      {T['details.mobile']} <span style={{ color: s.danger }}>*</span>
                    </span>
                    <div className="relative">
                      <Smartphone className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: s.accent }} />
                      <input
                        type="tel"
                        inputMode="numeric"
                        data-testid="booking-input-mobile"
                        value={customer.mobile}
                        onChange={(e) => setCustomer((c) => ({ ...c, mobile: e.target.value }))}
                        onBlur={() => setTouchedFields((t) => ({ ...t, mobile: true }))}
                        placeholder={T['details.mobilePlaceholder']}
                        aria-invalid={showFieldError('mobile') && Boolean(customerErrors.mobile)}
                        aria-describedby={showFieldError('mobile') && customerErrors.mobile ? 'booking-err-mobile' : undefined}
                        className={`${D.input} w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold outline-none transition-colors`}
                        style={{
                          backgroundColor: s.well,
                          borderColor: showFieldError('mobile') && customerErrors.mobile ? s.danger : s.chipLine,
                          color: s.textStrong,
                        }}
                      />
                    </div>
                    {showFieldError('mobile') && customerErrors.mobile && (
                      <span id="booking-err-mobile" data-testid="booking-err-mobile" className="text-[10px] font-bold" style={{ color: s.danger }}>
                        {T['details.errMobile']}
                      </span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className={D.label} style={{ color: s.muted }}>
                      {T['details.email']}
                    </span>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: s.accent }} />
                      <input
                        type="email"
                        data-testid="booking-input-email"
                        value={customer.email}
                        onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                        onBlur={() => setTouchedFields((t) => ({ ...t, email: true }))}
                        placeholder={T['details.emailPlaceholder']}
                        aria-invalid={showFieldError('email') && Boolean(customerErrors.email)}
                        aria-describedby={showFieldError('email') && customerErrors.email ? 'booking-err-email' : undefined}
                        className={`${D.input} w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold outline-none transition-colors`}
                        style={{
                          backgroundColor: s.well,
                          borderColor: showFieldError('email') && customerErrors.email ? s.danger : s.chipLine,
                          color: s.textStrong,
                        }}
                      />
                    </div>
                    {showFieldError('email') && customerErrors.email && (
                      <span id="booking-err-email" data-testid="booking-err-email" className="text-[10px] font-bold" style={{ color: s.danger }}>
                        {T['details.errEmail']}
                      </span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className={D.label} style={{ color: s.muted }}>
                      {T['details.notes']}
                    </span>
                    <div className="relative">
                      <MessageSquare className="w-3.5 h-3.5 absolute left-3.5 top-3" style={{ color: s.accent }} />
                      <textarea
                        rows={3}
                        data-testid="booking-input-notes"
                        value={customer.notes}
                        onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))}
                        placeholder={T['details.notesPlaceholder']}
                        className={`${D.input} w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold outline-none resize-none transition-colors`}
                        style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                      />
                    </div>
                  </label>
                </div>
              </motion.div>
            )}

            {/* ===================== STEP 5 · SUMMARY ===================== */}
            {step === 'summary' && (
              <motion.div
                key="step-summary"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-12 flex flex-col gap-4"
              >
                <div className="flex items-center gap-2.5">
                  {D.flourish(s)}
                  <div>
                    <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                      {T['summary.title']}
                    </h1>
                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                      {T['summary.subtitle']}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className={`${D.card} p-4 md:p-5 flex flex-col gap-1`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                    <div className="flex items-center justify-between mb-1">
                      <h2 className={D.sectionTitle} style={{ color: s.accent }}>
                        {isMultiService ? T['summary.services'] : T['summary.service']}
                      </h2>
                      <button
                        type="button"
                        data-testid="booking-summary-edit-service"
                        onClick={() => setStep('service')}
                        className="text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                        style={{ color: s.accent }}
                      >
                        {T['summary.change']}
                      </button>
                    </div>
                    {/* PHASE 16.2 — every selected service, each with its own
                        category / duration / price, then the totals. */}
                    {selection.lines.map((line) => {
                      const shown = displayService(line.service, locale);
                      return (
                        <div
                          key={line.service.id}
                          data-testid={`booking-summary-service-${line.service.id}`}
                          className="py-2 border-b last:border-b-0"
                          style={{ borderColor: s.chipLine }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex items-center gap-2 min-w-0">
                              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: s.muted }} />
                              <span className="text-xs font-semibold truncate" style={{ color: s.textStrong }}>
                                {shown.name}
                              </span>
                            </span>
                            <span className="text-xs font-semibold shrink-0" style={{ color: s.textStrong }}>
                              {formatCurrency(line.finalPrice)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 pl-5">
                            <span className="text-[10px] font-semibold" style={{ color: s.muted }}>
                              {translateCategory(line.service.category, locale)}
                            </span>
                            <span className="text-[10px] font-semibold inline-flex items-center gap-1" style={{ color: s.muted }}>
                              <Clock className="w-3 h-3" />
                              {line.durationMinutes} {minuteLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {summaryLine(
                      <Clock className="w-3.5 h-3.5" />,
                      T['service.totalDuration'],
                      `${totalDuration} ${minuteLabel}`,
                    )}
                    {summaryLine(
                      <CreditCard className="w-3.5 h-3.5" />,
                      T['service.totalPrice'],
                      selection.count > 0 ? formatCurrency(totalPrice) : '—',
                    )}
                  </div>

                  <div className={`${D.card} p-4 md:p-5 flex flex-col gap-1`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                    <div className="flex items-center justify-between mb-1">
                      <h2 className={D.sectionTitle} style={{ color: s.accent }}>
                        {T['step.time']}
                      </h2>
                      <button
                        type="button"
                        data-testid="booking-summary-edit-time"
                        onClick={() => setStep('date')}
                        className="text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                        style={{ color: s.accent }}
                      >
                        {T['summary.change']}
                      </button>
                    </div>
                    {summaryLine(<Calendar className="w-3.5 h-3.5" />, T['summary.date'], selectedDate ? dateLabel(selectedDate) : '—')}
                    {summaryLine(<Clock className="w-3.5 h-3.5" />, T['summary.time'], selectedSlot ? `${selectedSlot.startLabel} – ${selectedSlot.endLabel}` : '—')}
                    {summaryLine(<User className="w-3.5 h-3.5" />, T['summary.salon'], salonName)}
                  </div>

                  <div className={`${D.card} p-4 md:p-5 flex flex-col gap-1`} style={{ backgroundColor: s.card, borderColor: s.line }}>
                    <div className="flex items-center justify-between mb-1">
                      <h2 className={D.sectionTitle} style={{ color: s.accent }}>
                        {T['summary.customer']}
                      </h2>
                      <button
                        type="button"
                        data-testid="booking-summary-edit-details"
                        onClick={() => setStep('details')}
                        className="text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                        style={{ color: s.accent }}
                      >
                        {T['summary.change']}
                      </button>
                    </div>
                    {summaryLine(<User className="w-3.5 h-3.5" />, T['details.name'], customer.name)}
                    {summaryLine(<Phone className="w-3.5 h-3.5" />, T['summary.mobile'], customer.mobile)}
                    {summaryLine(
                      <Mail className="w-3.5 h-3.5" />,
                      T['summary.email'],
                      customer.email || T['summary.notProvided'],
                    )}
                    {summaryLine(
                      <MessageSquare className="w-3.5 h-3.5" />,
                      T['summary.notes'],
                      customer.notes || T['summary.notProvided'],
                    )}
                  </div>

                  <div className={`${D.card} p-4 md:p-5 flex flex-col gap-2`} style={{ backgroundColor: s.well, borderColor: s.line }}>
                    <h2 className={D.sectionTitle} style={{ color: s.accent }}>
                      {T['summary.price']}
                    </h2>
    {selection.lines.map((line) => (
                      <div key={line.service.id} className="flex items-center justify-between text-xs font-bold" style={{ color: s.text }}>
                        <span className="truncate pr-3">{displayService(line.service, locale).name}</span>
                        <span className="shrink-0">{formatCurrency(line.finalPrice)}</span>
                      </div>
                    ))}
                    <div
                      data-testid="booking-summary-total"
                      className="flex items-center justify-between text-sm font-extrabold pt-1 border-t"
                      style={{ color: s.textStrong, borderColor: s.chipLine }}
                    >
                      <span>{selectionCountLabel} · {totalDuration} {minuteLabel}</span>
                      <span data-testid="summary-total-amount">{selection.count > 0 ? formatCurrency(totalPrice) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold" style={{ color: s.accent }}>
                      <span>25% Advance (Payable Now)</span>
                      <span data-testid="summary-advance-amount">{selection.count > 0 ? formatCurrency(Math.round(totalPrice * 0.25)) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold" style={{ color: s.muted }}>
                      <span>Remaining (Pay at Salon)</span>
                      <span data-testid="summary-remaining-amount">{selection.count > 0 ? formatCurrency(totalPrice - Math.round(totalPrice * 0.25)) : '—'}</span>
                    </div>
                    <p
                      className="text-[10px] font-semibold mt-2 p-2.5 border"
                      style={{
                        backgroundColor: s.card,
                        borderColor: s.chipLine,
                        color: s.muted,
                        borderRadius: 10,
                      }}
                    >
                      {onProceedToPayment ? T['summary.paymentNext'] : T['summary.confirmNote']}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
        </div>
      </main>

      {/* ---- compact action bar (mobile-first) ---- */}
      <footer
        className="shrink-0 flex flex-col"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        {step === 'service' && selection.count > 0 && (
          <div
            data-testid="booking-selection-totals"
            data-count={selection.count}
            data-total-price={totalPrice}
            data-total-duration={totalDuration}
            className="p-4 md:p-5 flex flex-col gap-2 border-b selection-summary-container"
            style={{ backgroundColor: s.well, borderColor: s.line }}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className={D.sectionTitle} style={{ color: s.accent }}>
                {T['service.totalTitle']} · {selectionCountLabel}
              </h2>
              <button
                type="button"
                data-testid="booking-selection-clear"
                onClick={clearSelectedServices}
                className="text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                style={{ color: s.muted }}
              >
                {T['service.clearAll']}
              </button>
            </div>
            <div className="max-h-[100px] overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scrollbar">
              {selection.lines.map((line) => (
                <div
                  key={line.service.id}
                  data-testid={`booking-selection-line-${line.service.id}`}
                  className="flex items-center justify-between gap-3 text-xs font-bold"
                  style={{ color: s.text }}
                >
                  <span className="min-w-0 flex items-center gap-2">
                    <span className="truncate">{displayService(line.service, locale).name}</span>
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: s.muted }}>
                      {line.durationMinutes} {minuteLabel}
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5 shrink-0">
                    <span>{formatCurrency(line.finalPrice)}</span>
                    <button
                      type="button"
                      data-testid={`booking-selection-remove-${line.service.id}`}
                      onClick={() => selectService(line.service)}
                      aria-label={`${T['service.remove']}: ${displayService(line.service, locale).name}`}
                      className="text-[9px] font-extrabold uppercase tracking-wider cursor-pointer"
                      style={{ color: s.danger }}
                    >
                      {T['service.remove']}
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div
              className="flex items-center justify-between text-sm font-extrabold pt-2 border-t"
              style={{ color: s.textStrong, borderColor: s.chipLine }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: s.accent }} />
                {totalDuration} {minuteLabel}
              </span>
              <span data-testid="booking-selection-total-price">{formatCurrency(totalPrice)}</span>
            </div>
            {selection.count >= BOOKING_MAX_SERVICES && (
              <p className="text-[10px] font-semibold" style={{ color: s.muted }}>
                {fillBookingText(T['service.limitNote'], { max: BOOKING_MAX_SERVICES })}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 p-4 flex items-center justify-between gap-6 booking-action-bar booking-actions-bar navigation-footer">
          <button
            type="button"
            data-testid="booking-back"
            onClick={goBack}
            disabled={step === 'salon'}
            className={`${D.secondary} px-4 flex items-center gap-1.5 ${step === 'salon' ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
            style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {T.back}
          </button>

          {step === 'summary' ? (
            <button
              type="button"
              data-testid="booking-confirm"
              onClick={() => {
                // PHASE 16.5 — single AND multi-service selections hand off to
                // the EXISTING payment architecture. The full line items travel
                // with the payload so the payment engine prices the REAL total
                // (sum of offer-aware line prices — never hardcoded).
                if (
                  onProceedToPayment
                  && selectedService && selectedDateKey && selectedSlotMinutes != null
                ) {
                  onProceedToPayment({
                    service: { id: selectedService.id },
                    serviceLines: selection.lines.map((line) => ({
                      serviceId: line.service.id,
                      serviceName: line.service.name,
                      price: line.finalPrice,
                      durationMinutes: line.durationMinutes,
                    })),
                    dateKey: selectedDateKey,
                    startMinutes: selectedSlotMinutes,
                    endMinutes: selectedSlotMinutes + totalDuration,
                    customer,
                  });
                  return;
                }
                toast('summary.confirmNote');
              }}
              className={`${D.primary} px-6 md:px-8 flex items-center gap-2 cursor-pointer`}
              style={D.primaryStyle(s)}
            >
              <CalendarCheck className="w-4 h-4" />
              {T.confirm}
            </button>
          ) : (
            <button
              type="button"
              data-testid="booking-continue"
              onClick={goNext}
              disabled={!canContinue}
              className={`${D.primary} px-6 md:px-8 flex items-center gap-2`}
              style={primaryBtnStyle}
            >
              {T.continue}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Slot that the visitor may still book (available or their own hold). */
function disabledSlot(slot: BookingSlot): boolean {
  return slot.state === 'past' || slot.state === 'taken';
}
