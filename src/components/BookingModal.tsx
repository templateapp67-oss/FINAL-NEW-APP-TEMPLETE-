import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { AlertCircle, CalendarDays, Check, Clock, Loader2, MessageCircle, Phone, Sparkles, User, X } from 'lucide-react';
import {
  type BookingContext,
  type BookingServiceOption,
  type BookingExpertOption,
  type DayScheduleInfo,
  type SlotOption,
  type WebsiteBookingResult,
  createWebsiteBooking,
  fetchBookingContext,
  formatDayLabel,
  formatDuration,
  formatINR,
  formatSlotTime,
  slotFitsService,
} from '../lib/websiteBooking';
import { saveOfflineBooking } from '../lib/offlineBookings';

/** What the clicked button passed to the modal (service / bundle / stylist / plain). */
export interface BookingPrefill {
  kind: 'service' | 'bundle' | 'stylist' | 'general';
  /** Prefilled offering (service card, package card). */
  item?: { id: string; name: string; price: number; duration: number };
  /** Prefilled stylist (team card). */
  stylist?: { id: string; name: string; role?: string };
}

interface BookingModalProps {
  prefill: BookingPrefill | null;
  /** Context already fetched on page load (avoids a duplicate request). */
  initialContext?: BookingContext | null;
  salonSlug: string;
  salonName: string;
  brandColor: string;
  /** Page data used as an offline fallback (local drafts / preview). */
  fallbackServices: BookingServiceOption[];
  fallbackExperts: BookingExpertOption[];
  fallbackHours: Record<string, DayScheduleInfo> | null;
  phoneHref: string;
  whatsappHref: string;
  onClose: () => void;
}

const DAY_COUNT = 14;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function localDatePlusDays(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function localDayName(isoDate: string): string {
  return DAY_NAMES[new Date(`${isoDate}T12:00:00`).getDay()];
}

const DEFAULT_HOURS: Record<string, DayScheduleInfo> = {
  monday: { open: true, startTime: '10:00', endTime: '20:00' },
  tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
  wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
  thursday: { open: true, startTime: '10:00', endTime: '20:00' },
  friday: { open: true, startTime: '10:00', endTime: '20:00' },
  saturday: { open: true, startTime: '10:00', endTime: '20:00' },
  sunday: { open: false, startTime: '10:00', endTime: '20:00' },
};

function localSlotGrid(hours: Record<string, DayScheduleInfo>, date: string): SlotOption[] {
  const day = hours[localDayName(date)] || { open: false, startTime: '10:00', endTime: '20:00' };
  if (!day.open) return [];
  const start = toMinutes(day.startTime);
  const end = toMinutes(day.endTime);
  const grid: SlotOption[] = [];
  for (let t = start; t + 30 <= end; t += 30) grid.push({ time: toHHMM(t), available: true });
  return grid;
}

export default function BookingModal(props: BookingModalProps) {
  const { prefill, initialContext, salonSlug, salonName, brandColor, fallbackServices, fallbackExperts, fallbackHours, phoneHref, whatsappHref, onClose } = props;

  const [context, setContext] = useState<BookingContext | null>(null);
  const [contextFailed, setContextFailed] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);

  const [serviceId, setServiceId] = useState('');
  const [stylistId, setStylistId] = useState('');
  const [date, setDate] = useState('');
  const [daySlots, setDaySlots] = useState<SlotOption[] | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  /** Bumped on every (re)open so the slot grid refetches even when the
   *  selected date is unchanged. */
  const [gridTick, setGridTick] = useState(0);
  const [time, setTime] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<WebsiteBookingResult | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const openedFor = useRef<string>('');

  /* ---------------- live data: services, experts, slots from DB ---------------- */
  const liveMode = Boolean(salonSlug);

  useEffect(() => {
    if (!prefill) return;
    // Reset per opening (keyed by what was clicked) so a second open is fresh.
    const key = `${prefill.kind}:${prefill.item?.id || ''}:${prefill.stylist?.id || ''}`;
    if (openedFor.current === key) return;
    openedFor.current = key;

    setResult(null);
    setSubmitError('');
    setSubmitting(false);
    setTime('');
    setDaySlots(null);
    setGridTick((tick) => tick + 1);
    setName('');
    setPhone('');
    setNote('');

    // Prefill from the clicked button.
    setServiceId('');
    setStylistId(prefill.stylist?.id || '');
    if (prefill.kind === 'bundle' && prefill.item) {
      setNote(`Requested bundle: ${prefill.item.name} (${formatINR(prefill.item.price)}, ${formatDuration(prefill.item.duration)}).`);
    }

    if (liveMode && initialContext) {
      // Reuse the context the page already fetched from the database API.
      setContext(initialContext);
      if (prefill.item && initialContext.services.some((service) => service.id === prefill.item?.id)) {
        setServiceId(prefill.item.id);
      }
      if (prefill.stylist && !initialContext.experts.some((expert) => expert.id === prefill.stylist?.id)) {
        setStylistId('');
      }
      return;
    }
    if (liveMode) {
      setLoadingContext(true);
      setContextFailed(false);
      fetchBookingContext(salonSlug)
        .then((data) => {
          setContext(data);
          // Prefilled service wins when it exists in the live DB catalog.
          if (prefill.item && data.services.some((service) => service.id === prefill.item?.id)) {
            setServiceId(prefill.item.id);
          }
          // If the prefill came from a stylist card, keep it only when the
          // live staff list agrees; otherwise fall back to "any stylist".
          if (prefill.stylist && !data.experts.some((expert) => expert.id === prefill.stylist?.id)
              && fallbackExperts.some((expert) => expert.id === prefill.stylist?.id)) {
            /* keep — the expert list below merges the fallback */
          } else if (prefill.stylist && !data.experts.some((expert) => expert.id === prefill.stylist?.id)) {
            setStylistId('');
          }
        })
        .catch(() => setContextFailed(true))
        .finally(() => setLoadingContext(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, initialContext]);

  /* Service list: live DB catalog first, page data as offline fallback. */
  const services: BookingServiceOption[] = useMemo(() => {
    if (context && context.services.length > 0) return context.services;
    if (contextFailed || !liveMode) return fallbackServices;
    return [];
  }, [context, contextFailed, liveMode, fallbackServices]);

  const experts: BookingExpertOption[] = useMemo(() => {
    const base = context && context.experts.length > 0 ? context.experts : fallbackExperts;
    const prefillStylist = prefill?.stylist;
    if (prefillStylist && !base.some((expert) => expert.id === prefillStylist.id)) {
      return [{ id: prefillStylist.id, name: prefillStylist.name, role: prefillStylist.role || 'Stylist' }, ...base];
    }
    return base;
  }, [context, fallbackExperts, prefill]);

  const selectedService = services.find((service) => service.id === serviceId) || null;
  /** The clicked bundle, when a "Book Bundle" CTA opened the modal. */
  const bundlePrefill = prefill?.kind === 'bundle' && prefill.item
    ? { id: prefill.item.id, name: prefill.item.name, price: prefill.item.price, duration: prefill.item.duration }
    : null;
  /**
   * The offering shown in the summary:
   *  - bundle CTA → the clicked bundle itself (name / price / duration);
   *  - otherwise → the selected service, falling back to the clicked service
   *    when the service list is empty (offline without page data).
   */
  const effectiveService: BookingServiceOption | null = bundlePrefill
    || selectedService
    || (prefill?.item && services.length === 0
      ? { id: prefill.item.id, name: prefill.item.name, price: prefill.item.price, duration: prefill.item.duration }
      : null);

  /* Default service: prefill, else first DB service, else most-featured. */
  useEffect(() => {
    if (serviceId || services.length === 0) return;
    if (prefill?.item && services.some((service) => service.id === prefill.item?.id)) {
      setServiceId(prefill.item.id);
    } else {
      setServiceId((services.find((service) => service.featured) || services[0]).id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceId, prefill]);

  /* Day strip: live per-day availability, or locally computed from hours. */
  const days = useMemo(() => {
    if (context && context.days.length > 0) return context.days;
    if (liveMode && !contextFailed && !context) return null; // still loading
    const hours = fallbackHours || DEFAULT_HOURS;
    const today = todayIso();
    const list = [];
    for (let offset = 0; offset < DAY_COUNT; offset += 1) {
      const iso = localDatePlusDays(today, offset);
      const day = hours[localDayName(iso)] || { open: false, startTime: '10:00', endTime: '20:00' };
      const grid = localSlotGrid({ [localDayName(iso)]: day }, iso);
      list.push({ date: iso, open: Boolean(day.open), totalSlots: grid.length, freeSlots: grid.length });
    }
    return list;
  }, [context, contextFailed, liveMode, fallbackHours]);

  /* Default date: first open day with free slots (today first). */
  useEffect(() => {
    if (date || !days) return;
    const first = days.find((day) => day.open && day.freeSlots > 0);
    if (first) setDate(first.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, date]);

  /* Slot grid for the selected day (live fetch, or local fallback). */
  useEffect(() => {
    if (!date) { setDaySlots(null); return; }
    setTime('');
    if (liveMode && !contextFailed) {
      let active = true;
      setLoadingDay(true);
      setDaySlots(null);
      fetchBookingContext(salonSlug, date)
        .then((data) => { if (active) setDaySlots(data.slots && data.slots.length > 0 ? data.slots : []); })
        .catch(() => { if (active) setDaySlots(localSlotGrid(fallbackHours || DEFAULT_HOURS, date)); })
        .finally(() => { if (active) setLoadingDay(false); });
      return () => { active = false; };
    }
    setDaySlots(localSlotGrid(fallbackHours || DEFAULT_HOURS, date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, salonSlug, liveMode, contextFailed, gridTick]);

  /* Esc closes (never mid-submit). */
  useEffect(() => {
    if (!prefill) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefill, submitting, onClose]);

  const selectSlot = useCallback((slot: SlotOption) => {
    if (!effectiveService) return;
    if (daySlots && !slotFitsService(slot, daySlots, effectiveService.duration)) return;
    setTime(slot.time);
  }, [daySlots, effectiveService]);

  const phoneDigits = phone.replace(/\D/g, '');
  /**
   * The service id sent to the booking API. A bundle is not a bookable
   * service row, so bundle bookings carry the (auto-prefilled) selected
   * service id plus the bundle in the note — the API contract stays the
   * same and the salon sees both.
   */
  const submitServiceId = bundlePrefill
    ? (serviceId || services[0]?.id || '')
    : (effectiveService?.id || '');
  const canSubmit = Boolean(
    effectiveService
    && submitServiceId
    && date
    && time
    && name.trim().length >= 2
    && phoneDigits.length >= 10
    && phoneDigits.length <= 15
    && !submitting,
  );

  /** Human checklist shown while the Confirm button is disabled. */
  const missingFields = (() => {
    const missing: string[] = [];
    if (!effectiveService || !submitServiceId) missing.push('service');
    if (!date) missing.push('date');
    if (!time) missing.push('time slot');
    if (name.trim().length < 2) missing.push('name');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) missing.push('phone number');
    return missing;
  })();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !effectiveService) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const booking = await createWebsiteBooking({
        salonSlug,
        serviceId: submitServiceId,
        staffId: stylistId || null,
        date,
        time,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        note: note.trim() || undefined,
      });
      setResult(booking);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The booking could not be created. Please try again.';
      // Only when the API was ALREADY known to be unreachable (context
      // fetch failed on open) does the request fall back to a local save,
      // so the offline banner ("Your request will still be saved") stays
      // true. When the API is up, a POST failure is a real domain error
      // (slot just taken, validation) → show it and refresh the grid.
      if (offline) {
        const saved = saveOfflineBooking({
          salonSlug,
          salonName,
          serviceName: effectiveService.name,
          serviceId: submitServiceId,
          date,
          time,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          note: note.trim() || undefined,
        });
        if (saved) {
          setResult({
            bookingId: saved.id,
            bookingReference: saved.reference,
            serviceName: effectiveService.name,
            amount: effectiveService.price,
            currency: 'INR',
            durationMinutes: effectiveService.duration > 0 ? effectiveService.duration : null,
            appointmentDate: date,
            startTime: time,
            endTime: null,
            status: 'saved_offline',
            local: true,
          });
        } else {
          setSubmitError(message);
        }
      } else {
        setSubmitError(message);
      }
      // If the slot was just taken, refresh the grid.
      if (liveMode) {
        fetchBookingContext(salonSlug, date)
          .then((data) => setDaySlots(data.slots && data.slots.length > 0 ? data.slots : []))
          .catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!prefill) return null;

  const accent = brandColor || '#ac0053';
  const offline = contextFailed || !liveMode;

  /* ---------------------------- success view ---------------------------- */
  if (result) {
    const isLocalSave = result.local === true;
    return (
      <ModalShell onClose={onClose} panelRef={panelRef}>
        <div className="flex flex-col items-center text-center px-6 py-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${accent}1a` }}>
            <Check className="w-7 h-7" style={{ color: accent }} />
          </div>
          <h3 className="text-lg font-extrabold text-gray-900">{isLocalSave ? 'Request saved!' : 'Booking received!'}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Reference <span className="font-mono font-bold text-gray-900">{result.bookingReference}</span>
          </p>
          {isLocalSave ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
              Live booking is offline right now, so your request was saved on this device.
              {salonName || 'Our team'} will call you shortly to confirm your appointment.
            </p>
          ) : null}

          <div className="w-full mt-5 rounded-xl border border-gray-200 divide-y divide-gray-100 text-left text-xs">
            <SummaryRow label="Service" value={result.serviceName || effectiveService?.name || '—'} />
            <SummaryRow label="Date & time" value={`${formatDayLabel(result.appointmentDate).weekday}, ${result.appointmentDate} · ${formatSlotTime(result.startTime)}${result.endTime ? ` – ${formatSlotTime(result.endTime)}` : ''}`} />
            {stylistId ? <SummaryRow label="Stylist" value={experts.find((expert) => expert.id === stylistId)?.name || 'Preferred expert'} /> : null}
            <SummaryRow label="Name" value={name} />
            <SummaryRow label="Phone" value={phone} />
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold text-gray-500">Total (pay at salon)</span>
              <span className="font-extrabold text-sm" style={{ color: accent }}>{formatINR(result.amount)}</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
            {salonName || 'Our team'} will confirm your appointment by phone or WhatsApp shortly.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full py-3 rounded-xl text-xs font-bold text-white transition-colors hover:brightness-95"
            style={{ backgroundColor: accent }}
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  /* ----------------------------- form view ------------------------------ */
  return (
    <ModalShell onClose={onClose} panelRef={panelRef}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-extrabold text-gray-900">Book an Appointment</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{salonName || 'Salon'} · live slots from our booking system</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Close booking form"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {offline ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Live availability is offline right now — showing salon hours instead. Your request will still be saved.</span>
          </div>
        ) : null}

        {/* Prefilled offering summary (Service Name · Price · Duration) */}
        {effectiveService ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{prefill?.kind === 'bundle' ? 'Bundle' : 'Service'}</p>
                <p className="text-sm font-bold text-gray-900 truncate">{effectiveService.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-extrabold" style={{ color: accent }}>{formatINR(effectiveService.price)}</p>
                {effectiveService.duration > 0 ? (
                  <p className="text-[11px] text-gray-500 flex items-center gap-1 justify-end"><Clock className="w-3 h-3" />{formatDuration(effectiveService.duration)}</p>
                ) : null}
              </div>
            </div>
            {services.length > 1 || bundlePrefill ? (
              <>
                <select
                  value={serviceId || (bundlePrefill ? services[0]?.id || '' : effectiveService.id)}
                  onChange={(event) => setServiceId(event.target.value)}
                  className="mt-3 w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800 focus:outline-none"
                  style={{ borderColor: serviceId ? accent : undefined }}
                  aria-label="Choose a service"
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — {formatINR(service.price)} · {formatDuration(service.duration)}
                    </option>
                  ))}
                </select>
                {bundlePrefill ? (
                  <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                    Your time slot is booked under the selected service; the bundle above is noted for the salon.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-[11px] text-gray-500">
            {loadingContext ? 'Loading services from the booking system…' : 'No services are available for online booking yet.'}
          </div>
        )}

        {/* Stylist */}
        {experts.length > 0 ? (
          <label className="block">
            <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Stylist</span>
            <select
              value={stylistId}
              onChange={(event) => setStylistId(event.target.value)}
              className="mt-1.5 w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-gray-800 focus:outline-none"
            >
              <option value="">Any available stylist</option>
              {experts.map((expert) => (
                <option key={expert.id} value={expert.id}>{expert.name} · {expert.role}</option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Date strip */}
        <div>
          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Select Date</span>
          {days ? (
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
              {days.map((day) => {
                const label = formatDayLabel(day.date);
                const disabled = !day.open || day.freeSlots <= 0;
                const selected = date === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDate(day.date)}
                    className={`shrink-0 w-14 rounded-xl border px-1 py-2 text-center transition-colors ${
                      selected ? 'text-white border-transparent' : disabled ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                    style={selected ? { backgroundColor: accent } : undefined}
                  >
                    <span className="block text-[9px] font-bold uppercase">{label.weekday}</span>
                    <span className="block text-sm font-extrabold leading-tight">{label.day}</span>
                    <span className="block text-[9px] opacity-70">{disabled ? (day.open ? 'Full' : 'Closed') : label.month}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-1.5 h-16 rounded-xl bg-gray-100 animate-pulse" />
          )}
        </div>

        {/* Time slots */}
        <div>
          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Select Time</span>
          <div className="mt-1.5">
            {loadingDay ? (
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-8 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : daySlots && daySlots.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {daySlots.map((slot) => {
                  const selectable = effectiveService ? slotFitsService(slot, daySlots, effectiveService.duration) : slot.available;
                  const selected = time === slot.time;
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!selectable}
                      onClick={() => selectSlot(slot)}
                      className={`h-8 rounded-lg text-[11px] font-semibold border transition-colors ${
                        selected ? 'text-white border-transparent'
                          : selectable ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                            : 'border-gray-100 bg-gray-50 text-gray-300 line-through cursor-not-allowed'
                      }`}
                      style={selected ? { backgroundColor: accent } : undefined}
                    >
                      {formatSlotTime(slot.time)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 py-2">No open slots on this day — please pick another date.</p>
            )}
          </div>
        </div>

        {/* Customer details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold text-gray-700">Full Name *</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={120}
              required
              className="mt-1.5 w-full text-xs rounded-lg border border-gray-200 px-3 py-2.5 text-gray-800 focus:outline-none focus:border-gray-400"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-gray-700">Mobile Number *</span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d+\s-]/g, ''))}
              placeholder="+91 98765 43210"
              maxLength={20}
              required
              className="mt-1.5 w-full text-xs rounded-lg border border-gray-200 px-3 py-2.5 text-gray-800 focus:outline-none focus:border-gray-400"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[11px] font-bold text-gray-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything we should know?"
            rows={2}
            maxLength={500}
            className="mt-1.5 w-full text-xs rounded-lg border border-gray-200 px-3 py-2.5 text-gray-800 focus:outline-none focus:border-gray-400 resize-none"
          />
        </label>

        {submitError ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl text-xs font-bold text-white transition-all hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: accent }}
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Confirming your slot…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Confirm Booking{effectiveService ? ` · ${formatINR(effectiveService.price)}` : ''}</>
          )}
        </button>

        {!canSubmit && !submitting && missingFields.length > 0 ? (
          <p data-testid="booking-missing-fields" className="text-[10px] text-gray-400 text-center -mt-1.5">
            Add {missingFields.join(', ')} to confirm your booking.
          </p>
        ) : null}

        <div className="flex items-center justify-center gap-4 text-[11px] text-gray-500 pb-1">
          <a href={phoneHref} className="flex items-center gap-1 font-semibold hover:underline"><Phone className="w-3 h-3" /> Call us</a>
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold hover:underline"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell(props: { onClose: () => void; panelRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Book an appointment"
    >
      <div
        ref={props.panelRef}
        className="w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col"
      >
        {props.children}
      </div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="font-semibold text-gray-500">{props.label}</span>
      <span className="font-bold text-gray-900 text-right truncate">{props.value}</span>
    </div>
  );
}
