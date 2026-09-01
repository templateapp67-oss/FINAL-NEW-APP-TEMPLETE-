/**
 * TESTIMONIALS EDITOR — owner-curated social proof.
 *
 * Renders inside the builder (Step 4 — Team & Testimonials) and writes straight
 * into the unified draft (`SalonData.testimonials`), so the autosave hook picks
 * the change up and it survives refresh / step navigation / publish like every
 * other business field.
 *
 * Every mutation is validated before it reaches state; malformed rows coming
 * back from the database or the LocalStorage cache are normalised on read via
 * `normalizeTestimonials`.
 */
import { useMemo, useState } from 'react';
import { Plus, Star, Trash2, TriangleAlert } from 'lucide-react';
import type { SalonData, Testimonial } from '../types';
import {
  TESTIMONIAL_BODY_MAX,
  TESTIMONIAL_MAX_ITEMS,
  TESTIMONIAL_NAME_MAX,
  TESTIMONIAL_ROLE_MAX,
  normalizeTestimonials,
  testimonialAverage,
  validateTestimonial,
} from '../lib/testimonials';

/**
 * `onChange` is intentionally a plain callback rather than a React state
 * setter: some builder screens expose `setData(value)` only, others expose the
 * functional form. Receiving the next array keeps this component usable from
 * both without widening the contract.
 */
interface Props {
  data: SalonData;
  onChange: (next: Testimonial[]) => void;
}

const EMPTY: Omit<Testimonial, 'id'> = { name: '', rating: 5, body: '', role: '' };

function newId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `testimonial-${random}`;
}

const inputClass =
  'w-full rounded-lg border border-[#eeeeee] px-3 py-2 text-[13px] text-[#1a1c1c] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#ac0053]/30';

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={value >= star}
          data-testid={`testimonial-star-${star}`}
          onClick={() => onChange(star)}
          className="p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-[#ac0053]/30"
        >
          <Star
            className={`w-4 h-4 ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-[#d4d4d4]'}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function TestimonialsEditor({ data, onChange }: Props) {
  const items = useMemo(() => normalizeTestimonials(data.testimonials), [data.testimonials]);
  const [draft, setDraft] = useState<Omit<Testimonial, 'id'>>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(items.length > 0);

  const average = testimonialAverage(items);
  const atCap = items.length >= TESTIMONIAL_MAX_ITEMS;

  const commit = (next: Testimonial[]) => {
    onChange(normalizeTestimonials(next));
  };

  const addTestimonial = () => {
    const problems = validateTestimonial(draft);
    if (problems.length > 0) {
      setError(problems[0].message);
      return;
    }
    if (atCap) {
      setError(`You can showcase up to ${TESTIMONIAL_MAX_ITEMS} testimonials.`);
      return;
    }
    const entry: Testimonial = {
      id: newId(),
      name: draft.name.trim().slice(0, TESTIMONIAL_NAME_MAX),
      rating: Math.min(5, Math.max(1, Math.round(draft.rating))),
      body: draft.body.trim().slice(0, TESTIMONIAL_BODY_MAX),
    };
    const role = (draft.role || '').trim().slice(0, TESTIMONIAL_ROLE_MAX);
    if (role) entry.role = role;
    if (new Date().toISOString().slice(0, 10)) entry.date = new Date().toISOString().slice(0, 10);

    commit([...items, entry]);
    setDraft(EMPTY);
    setError(null);
  };

  const removeTestimonial = (id: string) => {
    commit(items.filter((item) => item.id !== id));
  };

  return (
    <section
      data-testid="testimonials-editor"
      className="rounded-2xl border border-[#eeeeee] bg-white p-5"
      aria-labelledby="testimonials-editor-heading"
    >
      <header className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 id="testimonials-editor-heading" className="text-[15px] font-bold text-[#1a1c1c]">
            Testimonials
          </h3>
          <p className="text-[12px] text-[#5f5e5e] mt-0.5">
            Client quotes you have collected. They appear on your website&apos;s Reviews section.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-[12px] font-semibold text-[#ac0053] hover:underline shrink-0"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </header>

      {items.length > 0 && (
        <p data-testid="testimonials-summary" className="text-[12px] text-[#5f5e5e] mb-3">
          {items.length} published · average {average.toFixed(1)}★
        </p>
      )}

      {expanded && (
        <>
          {items.length > 0 && (
            <ul className="space-y-2 mb-4">
              {items.map((item) => (
                <li
                  key={item.id}
                  data-testid="testimonial-row"
                  className="flex items-start gap-3 rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[#1a1c1c]">{item.name}</span>
                      {item.role && <span className="text-[11px] text-[#8a8a8a]">{item.role}</span>}
                      <span className="flex" aria-label={`${item.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3 h-3 ${star <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-[#dcdcdc]'}`}
                          />
                        ))}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#5f5e5e] mt-1 break-words">{item.body}</p>
                  </div>
                  <button
                    type="button"
                    data-testid="testimonial-remove"
                    aria-label={`Remove testimonial from ${item.name}`}
                    onClick={() => removeTestimonial(item.id)}
                    className="shrink-0 p-1.5 rounded-lg text-[#b0003a] hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-dashed border-[#dddddd] p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                data-testid="testimonial-name-input"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Client name"
                maxLength={TESTIMONIAL_NAME_MAX}
                className={inputClass}
              />
              <input
                data-testid="testimonial-role-input"
                value={draft.role || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="Role (optional) — e.g. Bridal client"
                maxLength={TESTIMONIAL_ROLE_MAX}
                className={inputClass}
              />
            </div>
            <textarea
              data-testid="testimonial-body-input"
              value={draft.body}
              onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
              placeholder="What did they say about your service?"
              rows={3}
              maxLength={TESTIMONIAL_BODY_MAX}
              className={`${inputClass} resize-y`}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <StarPicker
                label="Rating"
                value={draft.rating}
                onChange={(next) => setDraft((prev) => ({ ...prev, rating: next }))}
              />
              <button
                type="button"
                data-testid="testimonial-add"
                onClick={addTestimonial}
                disabled={atCap}
                className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-[#ac0053] text-white text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> Add testimonial
              </button>
            </div>
            {draft.body.length > 0 && (
              <p className="text-[11px] text-[#8a8a8a]">
                {draft.body.length}/{TESTIMONIAL_BODY_MAX} characters
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              data-testid="testimonial-error"
              className="mt-2 flex items-center gap-1.5 text-[12px] text-[#c0003a]"
            >
              <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
