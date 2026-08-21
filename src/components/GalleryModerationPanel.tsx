/**
 * PHASE 14.7 — OWNER/ADMIN GALLERY APPROVAL panel.
 *
 * Moderation UI for the existing 14.1/14.6 gallery (no duplicate gallery):
 *   - Lists every managed gallery item with thumbnail, theme, category,
 *     linked service and its moderation/publish status.
 *   - Approve (gated by the publish validator — invalid mapping is refused),
 *     Reject (with a reason), Unpublish, Reactivate (approved only).
 *   - Locked (read-only) when the caller is not an authorized owner/admin.
 */
import { useState } from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';
import type { GalleryImage, SalonData } from '../types';
import {
  approveGalleryItem,
  rejectGalleryItem,
  unpublishGalleryItem,
  reactivateGalleryItem,
  validateGalleryItemForPublish,
  effectiveModeration,
} from '../lib/galleryModeration';
import { galleryManagementThemeLabel, galleryServicesForTheme } from '../lib/galleryManagement';
import { isSiteHeaderTheme, type SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onSave?: () => void;
  /** Whether the current session may moderate (authorized owner/admin). */
  canModerate: boolean;
}

function itemThemeOf(data: SalonData, item: GalleryImage): SiteHeaderThemeId | null {
  if (isSiteHeaderTheme(item.themeId)) return item.themeId;
  return isSiteHeaderTheme(data.templateId || '') ? (data.templateId as SiteHeaderThemeId) : null;
}

function serviceNameOf(data: SalonData, item: GalleryImage): string | null {
  const theme = itemThemeOf(data, item);
  if (!item.serviceId || !theme) return null;
  return galleryServicesForTheme(data, theme).find((service) => service.id === item.serviceId)?.name ?? null;
}

function statusMeta(item: GalleryImage): { label: string; tone: string; published: boolean } {
  const mod = effectiveModeration(item);
  if (mod === 'pending') return { label: 'Pending', tone: 'bg-amber-100 text-amber-800', published: false };
  if (mod === 'rejected') return { label: 'Rejected', tone: 'bg-red-100 text-red-700', published: false };
  if (item.status === 'inactive') return { label: 'Unpublished', tone: 'bg-gray-200 text-gray-700', published: false };
  return { label: 'Published', tone: 'bg-green-100 text-green-800', published: true };
}

export default function GalleryModerationPanel({ data, setData, onSave, canModerate }: Props) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const items = data.gallery || [];

  const updateItems = (next: GalleryImage[]) => {
    setData({ ...data, gallery: next });
    if (onSave) onSave();
  };

  const patchItem = (id: string, patch: (item: GalleryImage) => GalleryImage) => {
    updateItems(items.map((item) => (item.id === id ? patch(item) : item)));
  };

  const handleApprove = (item: GalleryImage) => {
    const theme = itemThemeOf(data, item);
    const themeId: SiteHeaderThemeId = theme || (isSiteHeaderTheme(data.templateId || '') ? (data.templateId as SiteHeaderThemeId) : 'barber_mens_grooming');
    const problems = validateGalleryItemForPublish(data, item, themeId);
    if (problems.length > 0) {
      setErrors((prev) => ({ ...prev, [item.id]: problems.join(' ') }));
      return;
    }
    setErrors((prev) => ({ ...prev, [item.id]: '' }));
    patchItem(item.id, (existing) => approveGalleryItem(existing));
  };

  const handleReject = (item: GalleryImage) => {
    if (!rejectReason.trim()) {
      setErrors((prev) => ({ ...prev, [item.id]: 'Enter a rejection reason.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, [item.id]: '' }));
    patchItem(item.id, (existing) => rejectGalleryItem(existing, rejectReason));
    setRejectingId(null);
    setRejectReason('');
  };

  const actionClass = 'site-touch inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.08em] transition-colors';

  return (
    <div data-testid="gallery-moderation-panel" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1a1c1c]">Gallery Approval</h3>
        <span className="text-[11px] font-semibold text-gray-500">
          {items.filter((i) => effectiveModeration(i) === 'pending').length} pending
        </span>
      </div>

      {!canModerate && (
        <div
          data-testid="gallery-moderation-locked"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
        >
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Only an authorized salon owner or admin can approve or reject gallery content.</span>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-xs text-gray-400">No gallery items to review yet.</p>
      )}

      {items.map((item) => {
        const meta = statusMeta(item);
        const serviceName = serviceNameOf(data, item);
        const theme = itemThemeOf(data, item);
        return (
          <div
            key={item.id}
            data-testid="gallery-moderation-item"
            data-item-id={item.id}
            className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <img src={item.url} alt={item.alt || item.title || 'Gallery image'} className="w-14 h-14 object-cover rounded-lg border border-gray-100 shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-900 truncate">{item.title || item.alt || 'Untitled'}</span>
                <span data-testid="gallery-moderation-status" className={`text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${meta.tone}`}>{meta.label}</span>
              </div>
              <p className="text-[11px] text-gray-500">
                <span data-testid="gallery-moderation-theme">{theme ? galleryManagementThemeLabel(theme) : 'Salon default'}</span>
                {' · '}
                <span data-testid="gallery-moderation-category">{item.category || 'General'}</span>
                {' · '}
                <span data-testid="gallery-moderation-service">{serviceName || 'No linked service'}</span>
              </p>
              {effectiveModeration(item) === 'rejected' && item.rejectionReason && (
                <p data-testid="gallery-moderation-reason" className="text-[11px] text-red-600">Reason: {item.rejectionReason}</p>
              )}
              {errors[item.id] && (
                <p data-testid="gallery-moderation-error" className="text-[11px] text-red-600">{errors[item.id]}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {canModerate && effectiveModeration(item) !== 'approved' && (
                <button
                  type="button"
                  data-testid={`gallery-moderation-approve-${item.id}`}
                  onClick={() => handleApprove(item)}
                  className={`${actionClass} bg-[#ac0053] text-white hover:bg-[#ba005b]`}
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
              )}
              {canModerate && effectiveModeration(item) !== 'rejected' && (
                <button
                  type="button"
                  data-testid={`gallery-moderation-reject-${item.id}`}
                  onClick={() => { setRejectingId(item.id); setRejectReason(''); }}
                  className={`${actionClass} bg-white border border-red-300 text-red-600 hover:bg-red-50`}
                >
                  <X className="w-3 h-3" /> Reject
                </button>
              )}
              {canModerate && meta.published && (
                <button
                  type="button"
                  data-testid={`gallery-moderation-unpublish-${item.id}`}
                  onClick={() => patchItem(item.id, (existing) => unpublishGalleryItem(existing))}
                  className={`${actionClass} bg-white border border-gray-300 text-gray-600 hover:bg-gray-50`}
                >
                  Unpublish
                </button>
              )}
              {canModerate && effectiveModeration(item) === 'approved' && item.status === 'inactive' && (
                <button
                  type="button"
                  data-testid={`gallery-moderation-reactivate-${item.id}`}
                  onClick={() => patchItem(item.id, (existing) => reactivateGalleryItem(existing))}
                  className={`${actionClass} bg-white border border-green-300 text-green-700 hover:bg-green-50`}
                >
                  Reactivate
                </button>
              )}
            </div>

            {rejectingId === item.id && canModerate && (
              <div className="w-full sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="text"
                  data-testid="gallery-moderation-reject-input"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason"
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                />
                <button
                  type="button"
                  data-testid="gallery-moderation-reject-confirm"
                  onClick={() => handleReject(item)}
                  className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setRejectingId(null)}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
