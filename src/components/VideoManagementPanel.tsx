/**
 * PHASE 15.6 — OWNER/ADMIN VIDEO MANAGEMENT panel.
 *
 * One management surface for the salon's videos (no duplicate system):
 *   - Lists the salon's owner videos (any review state) PLUS the active
 *     theme's protected showcase (mock) records that are not shadowed by an
 *     owner override and not admin-disabled for this salon.
 *   - Owner: edit metadata / replace link on their own rows AND on showcase
 *     records (materialised as an owner override — the protected original is
 *     never mutated); delete their own rows. Protected records never show an
 *     owner a delete affordance (15.5 rule).
 *   - Admin: everything the owner can do, plus approve / reject (with reason)
 *     / set pending, and showcase-record remove (per-salon tombstone) /
 *     restore.
 *   - All actions re-check the capability matrix in `videoManagement.ts`;
 *     hiding buttons here is only cosmetic.
 *   - Salon isolation: the panel only ever receives the session-resolved
 *     salon payload from the screen; there is no salon-id input anywhere.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Video as VideoIcon,
  AlertCircle,
  X,
} from 'lucide-react';
import type { SalonData, SocialVideo } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { SITE_HEADER_THEME_IDS } from '../lib/siteNavigation';
import { THEME_LABELS } from '../lib/themeServices';
import {
  canApproveVideos,
  canDeleteVideo,
  canManageOwnSalonVideos,
  canManageThemeMockRecords,
  deleteManagedVideoRecord,
  disableThemeMockForSalon,
  disabledThemeMocksForSalon,
  editManagedVideoMetadata,
  managedVideoRowsForSalon,
  moderateManagedVideo,
  replaceManagedVideoUrl,
  restoreThemeMockForSalon,
  setManagedVideoActive,
  videoEditDeniedMessage,
  type ManagedVideoRow,
  type ManagedVideoTarget,
  type VideoActorContext,
} from '../lib/videoManagement';
import { fetchVideoMetadata, VIDEO_METADATA_DEBOUNCE_MS, type VideoPlatformMetadata } from '../lib/videoUrlMetadata';
import { resolveVideoKind } from '../lib/siteVideoGallery';
import type { VideoKind } from '../lib/siteVideoCatalog';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onSave?: () => void;
  actor: VideoActorContext;
  /** The salon's active theme (showcase records are listed for this theme). */
  themeId: SiteHeaderThemeId;
  onShowFeedback?: (message: string) => void;
}

const OWNER_DENY = 'You are not allowed to change videos for this salon.';

export function themeLabel(themeId: string | null | undefined): string {
  if (!themeId) return 'Salon default';
  return THEME_LABELS[themeId as keyof typeof THEME_LABELS] || themeId;
}

function targetOf(row: ManagedVideoRow): ManagedVideoTarget {
  return row.origin === 'theme'
    ? { kind: 'mock', mock: row.video }
    : { kind: 'owner', id: row.key };
}

export default function VideoManagementPanel({ data, setData, onSave, actor, themeId, onShowFeedback }: Props) {
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [managing, setManaging] = useState<ManagedVideoRow | null>(null);

  const locked = videoEditDeniedMessage(actor.permission) !== null;
  const mayManage = canManageOwnSalonVideos(actor);
  const mayApprove = canApproveVideos(actor);
  const mayManageMocks = canManageThemeMockRecords(actor);

  const videos = data.socialVideos || [];
  const rows = managedVideoRowsForSalon(data, themeId);
  const removedMocks = disabledThemeMocksForSalon(data, themeId);
  const pendingCount = rows.filter((row) => row.origin === 'owner' && row.moderation === 'pending').length;
  const showcaseCount = rows.filter((row) => row.origin === 'theme').length;

  const notify = (message: string) => onShowFeedback?.(message);
  const setRowError = (id: string, message: string) =>
    setErrorById((prev) => ({ ...prev, [id]: message }));
  const clearRowError = (id: string) =>
    setErrorById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const commit = (result: { ok: true; videos: SocialVideo[] } | { ok: false; error: string }, rowId: string, success: string): boolean => {
    if (result.ok === false) {
      setRowError(rowId, result.error);
      return false;
    }
    clearRowError(rowId);
    setData({ ...data, socialVideos: result.videos });
    if (onSave) onSave();
    if (success) notify(success);
    return true;
  };

  const handleDelete = (row: ManagedVideoRow) => {
    const result = deleteManagedVideoRecord(videos, row.key, actor);
    commit(result, row.key, 'Video removed');
  };

  const handleDisableMock = (row: ManagedVideoRow) => {
    const result = disableThemeMockForSalon(data, row.key, actor);
    if (result.ok === false) {
      setRowError(row.key, result.error);
      return;
    }
    clearRowError(row.key);
    setData(result.data);
    if (onSave) onSave();
    notify('Showcase video removed for this salon');
  };

  const handleRestoreMock = (mockId: string) => {
    const result = restoreThemeMockForSalon(data, mockId, actor);
    if (result.ok === false) {
      setRowError(mockId, result.error);
      return;
    }
    clearRowError(mockId);
    setData(result.data);
    if (onSave) onSave();
    notify('Showcase video restored');
  };

  const handleModerate = (row: ManagedVideoRow, action: 'approve' | 'reject' | 'pending') => {
    const result = moderateManagedVideo(videos, row.key, action, actor, {
      reason: action === 'reject' ? rejectReason : undefined,
    });
    if (commit(result, row.key, action === 'approve' ? 'Video approved' : action === 'reject' ? 'Video rejected' : 'Video moved to pending')) {
      if (action === 'reject') {
        setRejectingId(null);
        setRejectReason('');
      }
    }
  };

  const handleToggleActive = (row: ManagedVideoRow, active: boolean) => {
    const result = setManagedVideoActive(videos, row.key, active, actor);
    commit(result, row.key, active ? 'Video published again' : 'Video unpublished');
  };

  const actionClass =
    'site-touch inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.08em] transition-colors';

  return (
    <div data-testid="video-management-panel" className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-[#1a1c1c] flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-[#ac0053]" /> Video Management
          <span
            data-testid="video-management-actor"
            data-role={actor.role}
            className={`text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${
              actor.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {actor.role === 'admin' ? 'Admin' : 'Owner'}
          </span>
        </h3>
        <span className="text-[11px] font-semibold text-gray-500" data-testid="video-management-counts">
          {rows.filter((r) => r.origin === 'owner').length} yours · {showcaseCount} showcase
          {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
        </span>
      </div>

      {locked && (
        <div
          data-testid="video-management-locked"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
        >
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{videoEditDeniedMessage(actor.permission)} Only an authorized salon owner or admin can manage these videos.</span>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-xs text-gray-400" data-testid="video-management-empty">
          No videos to manage yet.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const rowError = errorById[row.key];
          const deletable = mayManage && canDeleteVideo(actor, row.video);
          const isShowcase = row.origin === 'theme';
          return (
            <div
              key={row.key}
              data-testid="video-management-item"
              data-item-id={row.key}
              data-origin={row.origin}
              data-moderation={row.moderation}
              data-active={row.active ? 'true' : 'false'}
              className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2"
            >
              <div className="flex items-start gap-3">
                <ManagedThumb video={row.video} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-900 truncate">{row.video.title || 'Untitled video'}</span>
                    <span
                      data-testid="video-management-origin"
                      className={`text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${
                        isShowcase ? 'bg-purple-100 text-purple-700' : row.isOverride ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isShowcase ? 'Showcase' : row.isOverride ? 'Customised showcase' : 'Owner'}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600" data-testid="video-management-kind">
                      {row.kind === 'short' ? 'Short' : 'Long'}
                    </span>
                    {row.origin === 'owner' && row.moderation !== 'approved' && (
                      <span
                        data-testid="video-management-status"
                        className={`text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${
                          row.moderation === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {row.moderation === 'pending' ? 'Pending' : 'Rejected'}
                      </span>
                    )}
                    {row.origin === 'owner' && !row.active && (
                      <span data-testid="video-management-inactive" className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                        Unpublished
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    <span data-testid="video-management-theme">{themeLabel(row.themeId)}</span>
                    {' · '}
                    <span className="capitalize">{row.video.platform}</span>
                    {row.video.channelName ? ` · ${row.video.channelName}` : ''}
                  </p>
                  {row.moderation === 'rejected' && row.video.rejectionReason && (
                    <p data-testid="video-management-reason" className="text-[11px] text-red-600">
                      Reason: {row.video.rejectionReason}
                    </p>
                  )}
                  {rowError && (
                    <p data-testid="video-management-error" role="alert" className="text-[11px] font-semibold text-red-600">
                      {rowError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {mayManage && (
                  <button
                    type="button"
                    data-testid={`video-management-manage-${row.key}`}
                    onClick={() => setManaging(row)}
                    className={`${actionClass} bg-[#ac0053] text-white hover:bg-[#ba005b]`}
                  >
                    <Pencil className="w-3 h-3" /> Manage
                  </button>
                )}

                {mayManage && row.origin === 'owner' && row.active && (
                  <button
                    type="button"
                    data-testid={`video-management-unpublish-${row.key}`}
                    onClick={() => handleToggleActive(row, false)}
                    className={`${actionClass} bg-white border border-gray-300 text-gray-600 hover:bg-gray-50`}
                  >
                    Unpublish
                  </button>
                )}
                {mayManage && row.origin === 'owner' && !row.active && row.moderation === 'approved' && (
                  <button
                    type="button"
                    data-testid={`video-management-republish-${row.key}`}
                    onClick={() => handleToggleActive(row, true)}
                    className={`${actionClass} bg-white border border-green-300 text-green-700 hover:bg-green-50`}
                  >
                    Republish
                  </button>
                )}

                {mayApprove && row.origin === 'owner' && row.moderation !== 'approved' && (
                  <button
                    type="button"
                    data-testid={`video-management-approve-${row.key}`}
                    onClick={() => handleModerate(row, 'approve')}
                    className={`${actionClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                )}
                {mayApprove && row.origin === 'owner' && row.moderation !== 'rejected' && (
                  <button
                    type="button"
                    data-testid={`video-management-reject-${row.key}`}
                    onClick={() => {
                      setRejectingId(row.key);
                      setRejectReason('');
                    }}
                    className={`${actionClass} bg-white border border-red-300 text-red-600 hover:bg-red-50`}
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                )}
                {mayApprove && row.origin === 'owner' && row.moderation === 'approved' && (
                  <button
                    type="button"
                    data-testid={`video-management-pending-${row.key}`}
                    onClick={() => handleModerate(row, 'pending')}
                    className={`${actionClass} bg-white border border-amber-300 text-amber-700 hover:bg-amber-50`}
                  >
                    Mark pending
                  </button>
                )}

                {row.origin === 'owner' && deletable && (
                  <button
                    type="button"
                    data-testid={`video-management-delete-${row.key}`}
                    onClick={() => handleDelete(row)}
                    className={`${actionClass} bg-white border border-red-300 text-red-600 hover:bg-red-50`}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}

                {isShowcase && mayManageMocks && (
                  <button
                    type="button"
                    data-testid={`video-management-disable-${row.key}`}
                    onClick={() => handleDisableMock(row)}
                    className={`${actionClass} bg-white border border-red-300 text-red-600 hover:bg-red-50`}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
                {isShowcase && !mayManageMocks && (
                  <span
                    data-testid={`video-management-protected-${row.key}`}
                    className="text-[10px] font-semibold text-gray-400 italic"
                    title="Theme showcase videos cannot be permanently deleted."
                  >
                    Protected
                  </span>
                )}
              </div>

              {rejectingId === row.key && mayApprove && (
                <div className="flex items-center gap-2 pt-1" data-testid="video-management-reject-box">
                  <input
                    type="text"
                    data-testid="video-management-reject-input"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                  />
                  <button
                    type="button"
                    data-testid="video-management-reject-confirm"
                    onClick={() => {
                      if (!rejectReason.trim()) {
                        setRowError(row.key, 'Enter a rejection reason.');
                        return;
                      }
                      handleModerate(row, 'reject');
                    }}
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

      {removedMocks.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2" data-testid="video-management-removed">
          <p className="text-[11px] font-bold text-gray-600 uppercase tracking-[0.08em]">
            Removed showcase videos (this salon only)
          </p>
          {removedMocks.map((mock) => (
            <div key={mock.id} data-testid="video-management-removed-item" data-item-id={mock.id} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-600 truncate">
                {mock.title} <span className="text-gray-400">({mock.videoKind === 'short' ? 'Short' : 'Long'})</span>
              </span>
              {mayManageMocks && (
                <button
                  type="button"
                  data-testid={`video-management-restore-${mock.id}`}
                  onClick={() => handleRestoreMock(mock.id)}
                  className={`${actionClass} bg-white border border-green-300 text-green-700 hover:bg-green-50`}
                >
                  <RotateCcw className="w-3 h-3" /> Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {managing && (
        <VideoManageModal
          row={managing}
          actor={actor}
          data={data}
          themeId={themeId}
          onClose={() => setManaging(null)}
          onDone={(message) => {
            setManaging(null);
            if (message) notify(message);
          }}
          setData={setData}
          onSave={onSave}
        />
      )}
    </div>
  );
}

/** Thumbnail with broken-image fallback (never a broken <img>). */
function ManagedThumb({ video }: { video: SocialVideo }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
      {video.thumbnailUrl && !broken ? (
        <img
          src={video.thumbnailUrl}
          alt={video.title || 'Video thumbnail'}
          data-testid="video-management-thumb"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div data-testid="video-management-thumb-fallback" className="w-full h-full flex flex-col items-center justify-center gap-0.5">
          <PlayCircle className="w-5 h-5 text-gray-400" />
          <span className="text-[7px] font-bold text-gray-500 uppercase">No image</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manage modal — edit metadata + optional link replacement            */
/* ------------------------------------------------------------------ */

function VideoManageModal({
  row,
  actor,
  data,
  themeId,
  setData,
  onSave,
  onClose,
  onDone,
}: {
  row: ManagedVideoRow;
  actor: VideoActorContext;
  data: SalonData;
  themeId: SiteHeaderThemeId;
  setData: (d: SalonData) => void;
  onSave?: () => void;
  onClose: () => void;
  onDone: (message: string | null) => void;
}) {
  const video = row.video;
  const isMock = row.origin === 'theme';

  const [replaceUrl, setReplaceUrl] = useState('');
  const [title, setTitle] = useState(video.title || '');
  const [description, setDescription] = useState(video.description || '');
  const [channel, setChannel] = useState(video.channelName || '');
  const [thumbnail, setThumbnail] = useState(video.thumbnailUrl || '');
  const [kind, setKind] = useState<VideoKind>(row.kind);
  // '' = keep the grandfathered "no theme scope" (visible on every theme).
  const [theme, setTheme] = useState<string>(row.themeId || '');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'partial' | 'error'>('idle');
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoPlatformMetadata | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);

  const manualRef = useRef({ title: false, description: false, channel: false, thumbnail: false, kind: false });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previousMetaRef = useRef<VideoPlatformMetadata | null>(null);

  // Debounced replace-link auto-fetch — reuses the Phase 15.2 route (no
  // second fetch system). Manual edits win over auto-filled values.
  useEffect(() => {
    const url = replaceUrl.trim();
    if (!url) {
      setFetchStatus('idle');
      setFetchMessage(null);
      setMeta(null);
      return;
    }
    // Kind follows the pasted URL (shorts → short) unless the owner picked one.
    if (!manualRef.current.kind) {
      const detected = resolveVideoKind({ url, platform: 'youtube' });
      setKind(detected);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFetchStatus('loading');
      setFetchMessage(null);
      const result = await fetchVideoMetadata(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.ok === false) {
        setFetchStatus('error');
        setFetchMessage(result.message);
        setMeta(null);
        return;
      }
      const incoming = result.metadata;
      const prev = previousMetaRef.current;
      previousMetaRef.current = incoming;
      setMeta(incoming);
      const manual = manualRef.current;
      // Fill fields the owner has not manually touched (previous snapshot
      // values are refreshed — derived thumb → oEmbed thumb etc.).
      if (!manual.title && (!title.trim() || title === video.title || (prev && title === prev.title))) {
        if (incoming.title) setTitle(incoming.title);
      }
      if (!manual.description && (!description.trim() || description === (video.description || '') || (prev && description === prev.description))) {
        if (incoming.description) setDescription(incoming.description);
      }
      if (!manual.channel && (!channel.trim() || channel === (video.channelName || '') || (prev && channel === prev.channelName))) {
        if (incoming.channelName) setChannel(incoming.channelName);
      }
      if (!manual.thumbnail && incoming.thumbnailUrl) {
        setThumbnail(incoming.thumbnailUrl);
        setThumbBroken(false);
      }
      setFetchStatus(incoming.title ? 'success' : 'partial');
      if (!incoming.title) {
        setFetchMessage('Thumbnail loaded. Title was not available — keep or edit the current title.');
      }
    }, VIDEO_METADATA_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Field values are read from state at apply time; only the URL drives the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceUrl]);

  const handleSave = () => {
    setFormError(null);
    if (!canManageOwnSalonVideos(actor)) {
      setFormError(OWNER_DENY);
      return;
    }
    const target = targetOf(row);
    const list = data.socialVideos || [];
    const newId = `v-over-${Date.now()}`;
    const now = new Date().toISOString();

    const urlChanged = replaceUrl.trim() && replaceUrl.trim() !== video.url;
    let working: SocialVideo[];
    if (urlChanged) {
      if (fetchStatus === 'error') {
        setFormError(fetchMessage || 'Fix the video link before saving.');
        return;
      }
      const replaced = replaceManagedVideoUrl(list, target, replaceUrl, meta, actor, {
        newId,
        now,
        // Manual fields are applied in the metadata step below; only adopt
        // platform values for untouched fields.
        keepMetadata: true,
      });
      if (replaced.ok === false) {
        setFormError(replaced.error);
        return;
      }
      working = replaced.videos;
      const savedId = replaced.video?.id || (target.kind === 'owner' ? target.id : newId);
      const edited = editManagedVideoMetadata(
        working,
        { kind: 'owner', id: savedId },
        {
          title,
          description,
          channelName: channel,
          thumbnailUrl: thumbnail,
          videoKind: kind,
          ...(isMock ? {} : { themeId: theme }),
        },
        actor,
        { newId, now },
      );
      if (edited.ok === false) {
        setFormError(edited.error);
        return;
      }
      working = edited.videos;
      setData({ ...data, socialVideos: working });
      if (onSave) onSave();
      onDone(replaced.materializedOverride ? 'Your version of the showcase video was saved' : 'Video link replaced');
      return;
    }

    const edited = editManagedVideoMetadata(
      list,
      target,
      {
        title,
        description,
        channelName: channel,
        thumbnailUrl: thumbnail,
        videoKind: kind,
        ...(isMock ? {} : { themeId: theme }),
      },
      actor,
      { newId, now },
    );
    if (edited.ok === false) {
      setFormError(edited.error);
      return;
    }
    setData({ ...data, socialVideos: edited.videos });
    if (onSave) onSave();
    onDone(edited.materializedOverride ? 'Your version of the showcase video was saved' : 'Video updated');
  };

  const inputClass =
    'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] focus:bg-white';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" data-testid="video-manage-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#ac0053]" /> Manage video
            {isMock && (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                Showcase
              </span>
            )}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-black p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isMock && (
          <p data-testid="video-manage-mock-note" className="text-[11px] text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
            This is a protected theme showcase video. Saving creates your own version — the default record is kept safe.
          </p>
        )}

        {formError && (
          <p data-testid="video-manage-error" role="alert" className="text-[11px] font-semibold text-red-600 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {formError}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-manage-replace-url">
            Replace video link <span className="font-semibold text-gray-400">(optional — paste a new YouTube URL)</span>
          </label>
          <div className="relative">
            <input
              id="video-manage-replace-url"
              data-testid="video-replace-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={replaceUrl}
              onChange={(e) => setReplaceUrl(e.target.value)}
              placeholder={video.url}
              className={`${inputClass} pr-10 ${
                fetchStatus === 'error' ? 'border-red-400' : ''
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {fetchStatus === 'loading' && <Loader2 data-testid="video-replace-loading" className="w-4 h-4 text-[#ac0053] animate-spin" />}
              {(fetchStatus === 'success' || fetchStatus === 'partial') && (
                <CheckCircle2 data-testid="video-replace-success" className="w-4 h-4 text-emerald-600" />
              )}
              {fetchStatus === 'error' && <AlertCircle data-testid="video-replace-error-icon" className="w-4 h-4 text-red-500" />}
            </span>
          </div>
          {fetchMessage && fetchStatus !== 'error' && (
            <p data-testid="video-replace-notice" className="mt-1.5 text-[11px] font-semibold text-amber-700">
              {fetchMessage}
            </p>
          )}
          {fetchMessage && fetchStatus === 'error' && (
            <p data-testid="video-replace-error" className="mt-1.5 text-[11px] font-semibold text-red-600">
              {fetchMessage}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-title">Title</label>
          <input
            id="video-edit-title"
            data-testid="video-edit-title"
            type="text"
            value={title}
            onChange={(e) => {
              manualRef.current.title = true;
              setTitle(e.target.value);
            }}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-channel">Channel / Source</label>
            <input
              id="video-edit-channel"
              data-testid="video-edit-channel"
              type="text"
              value={channel}
              onChange={(e) => {
                manualRef.current.channel = true;
                setChannel(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-kind">Type</label>
            <select
              id="video-edit-kind"
              data-testid="video-edit-kind"
              value={kind}
              onChange={(e) => {
                manualRef.current.kind = true;
                setKind(e.target.value === 'short' ? 'short' : 'long');
              }}
              className={inputClass}
            >
              <option value="short">Short</option>
              <option value="long">Long video</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-theme">Theme</label>
          {isMock ? (
            <p data-testid="video-edit-theme-locked" className="px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-600">
              {themeLabel(video.themeId || themeId)} — showcase videos stay on their own theme
            </p>
          ) : (
            <select
              id="video-edit-theme"
              data-testid="video-edit-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className={inputClass}
            >
              <option value="">All themes (no theme lock)</option>
              {SITE_HEADER_THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {themeLabel(id)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-description">Description</label>
          <textarea
            id="video-edit-description"
            data-testid="video-edit-description"
            value={description}
            onChange={(e) => {
              manualRef.current.description = true;
              setDescription(e.target.value);
            }}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-edit-thumbnail">Thumbnail URL</label>
          <div className="flex items-start gap-3">
            <input
              id="video-edit-thumbnail"
              data-testid="video-edit-thumbnail"
              type="url"
              value={thumbnail}
              onChange={(e) => {
                manualRef.current.thumbnail = true;
                setThumbnail(e.target.value);
                setThumbBroken(false);
              }}
              className={`${inputClass} flex-1`}
            />
            {thumbnail && !thumbBroken ? (
              <img
                src={thumbnail}
                alt="Thumbnail preview"
                data-testid="video-edit-thumbnail-preview"
                className="w-16 h-12 rounded-lg object-cover border border-gray-200 bg-gray-100 shrink-0"
                onError={() => setThumbBroken(true)}
              />
            ) : (
              <div data-testid="video-edit-thumbnail-fallback" className="w-16 h-12 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center shrink-0">
                <VideoIcon className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            type="button"
            data-testid="video-manage-save"
            disabled={fetchStatus === 'loading'}
            onClick={handleSave}
            className="px-5 py-2 text-xs bg-[#ac0053] text-white font-bold rounded-xl hover:bg-[#ba005b] shadow-xs disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
