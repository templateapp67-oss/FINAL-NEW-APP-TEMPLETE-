import {
  ArrowLeft, ArrowRight, Plus, Trash2, X, Share2, Camera, ThumbsUp, PlayCircle,
  Video as VideoIcon, CheckCircle2, Check, Monitor, Edit2, Sparkles, Link, ExternalLink,
  Loader2, AlertCircle
} from 'lucide-react';
import { SalonData, SocialVideo } from '../types';
import PreviewPane from '../components/PreviewPane';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, FormEvent, type FC } from 'react';
import {
  derivedYoutubeMetadata,
  fetchVideoMetadata,
  mergePlatformMetadataIntoForm,
  parseVideoUrl,
  partialMetadataNotice,
  platformMetadataIsComplete,
  socialVideoFromPasteAndMetadata,
  VIDEO_METADATA_DEBOUNCE_MS,
  type VideoPlatformMetadata,
} from '../lib/videoUrlMetadata';
import { resolveVideoKind, isVideoGalleryThemeId } from '../lib/siteVideoGallery';
import {
  filterDeletableOwnerVideos,
  isDeleteBlockedForVideoId,
  isProtectedThemeMockVideo,
} from '../lib/siteVideoCatalog';
// PHASE 15.6 — owner/admin video management (existing auth + ownership only).
import VideoManagementPanel from '../components/VideoManagementPanel';
import { useAuth } from '../lib/useAuth';
import { resolveOwnerSalonId } from '../lib/ownerSalon';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  canAddVideo,
  canDeleteVideo,
  hasAdminSessionClaim,
  resolveVideoActor,
  videoEditDeniedMessage,
  type VideoActorContext,
} from '../lib/videoManagement';
import { normalizeThemeId } from '../lib/themeServices';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error' | 'partial';

/**
 * Direct regex extraction of a YouTube VIDEO_ID from the raw pasted string.
 * Works for watch, Shorts, embed, live and youtu.be URLs even when the URL
 * cannot be fully parsed — the thumbnail
 * `https://img.youtube.com/vi/{VIDEO_ID}/hqdefault.jpg` can then always be
 * derived regardless of whether platform metadata fetched successfully.
 */
const YT_RAW_ID_REGEX =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*[?&])?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

function extractYoutubeIdFromRaw(url: string): string | null {
  const match = (url || '').match(YT_RAW_ID_REGEX);
  return match ? match[1] : null;
}

/** hqdefault thumbnail straight from the VIDEO_ID — no metadata needed. */
function youtubeThumbFromId(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Notices that exist ONLY because the title is missing ("Thumbnail loaded.
 * Title and channel were not available…", "Title is required…"). They are
 * cleared automatically the moment the Title field has any text.
 */
function isTitleRequiredNotice(notice: string | null): boolean {
  if (!notice) return false;
  return /add a title|title is required|type them manually|were not available/i.test(notice);
}

/**
 * PHASE 15.4 — paste-only add flow.
 * Owner pastes a YouTube URL; Phase 15.2 `fetchVideoMetadata` auto-fills
 * thumbnail, title, description, channel and canonical URL. No second fetch
 * system. Manual edits are allowed but never overwrite platform metadata
 * unnecessarily (see `mergePlatformMetadataIntoForm`).
 */
export default function StepSocials({ data, setData, onNext, onPrev, onSave }: Props) {
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [isAddingVideo, setIsAddingVideo] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form states for adding a social video (start empty — paste fills them).
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoPlatform, setNewVideoPlatform] = useState<'instagram' | 'youtube' | 'facebook' | 'tiktok'>('youtube');
  const [newVideoThumbnail, setNewVideoThumbnail] = useState('');
  const [newVideoDescription, setNewVideoDescription] = useState('');
  const [newVideoChannel, setNewVideoChannel] = useState('');
  const [newExternalVideoId, setNewExternalVideoId] = useState<string | null>(null);
  /** Kind detected from the ORIGINAL paste (before canonical rewrite). */
  const [detectedKind, setDetectedKind] = useState<'short' | 'long' | null>(null);

  const [titleManual, setTitleManual] = useState(false);
  const [descriptionManual, setDescriptionManual] = useState(false);
  const [channelManual, setChannelManual] = useState(false);
  const [thumbnailManual, setThumbnailManual] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [fetchedMeta, setFetchedMeta] = useState<VideoPlatformMetadata | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMetaRef = useRef<VideoPlatformMetadata | null>(null);
  /** Suppresses re-fetch when we rewrite the URL to the canonical form. */
  const skipNextFetchRef = useRef(false);

  /**
   * Always-fresh snapshot of the form + manual flags. The debounced metadata
   * merge reads from this ref instead of the effect closure, so a title the
   * owner types WHILE the fetch is in flight is never wiped by stale state.
   */
  const latestFormRef = useRef({
    newVideoTitle,
    newVideoDescription,
    newVideoChannel,
    newVideoThumbnail,
    newVideoUrl,
    newVideoPlatform,
    newExternalVideoId,
    titleManual,
    descriptionManual,
    channelManual,
    thumbnailManual,
  });
  latestFormRef.current = {
    newVideoTitle,
    newVideoDescription,
    newVideoChannel,
    newVideoThumbnail,
    newVideoUrl,
    newVideoPlatform,
    newExternalVideoId,
    titleManual,
    descriptionManual,
    channelManual,
    thumbnailManual,
  };

  /**
   * PHASE 15.6 — owner/admin actor for video management. Reuses the EXISTING
   * auth + salon-ownership resolution (session → organization_members owner →
   * salons). No salon/user ids are read from the client or invented; the
   * admin tier additionally requires a server-signed admin claim.
   */
  const { user, loading: authLoading } = useAuth();
  const [videoActor, setVideoActor] = useState<VideoActorContext>(() =>
    resolveVideoActor({
      supabaseConfigured: false,
      userPresent: false,
      isAdmin: false,
      resolution: null,
    }),
  );
  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      setVideoActor(
        resolveVideoActor({ supabaseConfigured: false, userPresent: false, isAdmin: false, resolution: null }),
      );
      return;
    }
    if (authLoading) return;
    const isAdmin = hasAdminSessionClaim(user);
    let cancelled = false;
    resolveOwnerSalonId()
      .then((resolution) => {
        if (cancelled) return;
        setVideoActor(
          resolveVideoActor({ supabaseConfigured: true, userPresent: !!user, isAdmin, resolution }),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setVideoActor(
          resolveVideoActor({
            supabaseConfigured: true,
            userPresent: !!user,
            isAdmin,
            resolution: { status: 'error' },
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);
  const videoPermissionDenied = videoEditDeniedMessage(videoActor.permission) !== null;

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const resetAddForm = () => {
    setNewVideoUrl('');
    setNewVideoTitle('');
    setNewVideoPlatform('youtube');
    setNewVideoThumbnail('');
    setNewVideoDescription('');
    setNewVideoChannel('');
    setNewExternalVideoId(null);
    setDetectedKind(null);
    setTitleManual(false);
    setDescriptionManual(false);
    setChannelManual(false);
    setThumbnailManual(false);
    setThumbBroken(false);
    setFetchStatus('idle');
    setFetchError(null);
    setFetchNotice(null);
    setFetchedMeta(null);
    previousMetaRef.current = null;
    skipNextFetchRef.current = false;
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const closeAddModal = () => {
    setIsAddingVideo(false);
    resetAddForm();
  };

  const activeThemeId =
    data.templateId && data.templateId !== 'hair' && data.templateId !== 'family-salon'
      ? data.templateId
      : null;

  /** PHASE 15.6 — the salon's theme for the management panel's showcase list. */
  const panelThemeId: SiteHeaderThemeId = (() => {
    const normalised = normalizeThemeId(data.templateId);
    return isVideoGalleryThemeId(normalised) ? normalised : 'hair_studio_color_bar';
  })();

  // Social profiles handlers
  const profiles = data.socialProfiles || {
    instagram: 'https://instagram.com/aurasalon_mumbai',
    facebook: '',
    youtube: '',
    tiktok: ''
  };

  const handleProfileChange = (key: keyof typeof profiles, value: string) => {
    const updatedProfiles = { ...profiles, [key]: value };
    setData({ ...data, socialProfiles: updatedProfiles });
    if (onSave) onSave();
  };

  // Videos list
  const videoList = data.socialVideos || [];

  /**
   * PHASE 15.4 — paste URL → Phase 15.2 fetchVideoMetadata → merge into form.
   * Shorts/Long kind is captured from the original paste so a canonical
   * watch-URL rewrite never flips a Short into a Long.
   */
  useEffect(() => {
    if (!isAddingVideo) return;
    const url = newVideoUrl.trim();

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    if (!url) {
      setFetchStatus('idle');
      setFetchError(null);
      setFetchNotice(null);
      setFetchedMeta(null);
      setNewExternalVideoId(null);
      setDetectedKind(null);
      return;
    }

    // Capture kind from the paste BEFORE any canonical rewrite.
    const kindFromPaste = resolveVideoKind({ url, platform: newVideoPlatform });
    setDetectedKind(kindFromPaste);

    const parsed = parseVideoUrl(url);
    // Regex fallback — the VIDEO_ID (and therefore the thumbnail) is derived
    // straight from the URL string, independent of parse/oEmbed success.
    const regexVideoId = extractYoutubeIdFromRaw(url);

    if (parsed.ok === false) {
      if (regexVideoId) {
        // URL parsing failed but the string clearly contains a YouTube video
        // id (e.g. a Shorts link with odd formatting). Fall back to derived
        // metadata so the thumbnail auto-fills and the owner can type the
        // title/channel manually instead of being blocked.
        const derived = derivedYoutubeMetadata(regexVideoId, url);
        setNewVideoPlatform('youtube');
        setNewExternalVideoId(regexVideoId);
        if (!latestFormRef.current.thumbnailManual) {
          setNewVideoThumbnail(youtubeThumbFromId(regexVideoId));
          setThumbBroken(false);
        }
        setFetchedMeta(derived);
        previousMetaRef.current = derived;
        setFetchStatus('partial');
        setFetchError(null);
        setFetchNotice(
          latestFormRef.current.newVideoTitle.trim()
            ? null
            : 'Thumbnail loaded. Title and channel were not available — type them manually to save.',
        );
        return;
      }
      const looksComplete = /^https?:\/\//i.test(url) || (url.includes('.') && url.length > 12);
      if (looksComplete && parsed.code !== 'empty') {
        setFetchStatus('error');
        setFetchError(parsed.message);
        setFetchNotice(null);
        setFetchedMeta(null);
        setNewExternalVideoId(null);
      } else {
        setFetchStatus('idle');
        setFetchError(null);
        setFetchNotice(null);
      }
      return;
    }

    // Immediately set thumbnail based on VIDEO_ID even before oEmbed fetch
    // Ensures high-res thumbnail https://img.youtube.com/vi/{VIDEO_ID}/hqdefault.jpg is set automatically
    if (parsed.platform === 'youtube' && parsed.externalVideoId) {
      const immediateThumb = youtubeThumbFromId(parsed.externalVideoId);
      if (!thumbnailManual) {
        setNewVideoThumbnail(immediateThumb);
        setThumbBroken(false);
      }
      setNewExternalVideoId(parsed.externalVideoId);
    }

    setFetchStatus('loading');
    setFetchError(null);
    setFetchNotice(null);
    setThumbBroken(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      // Reuse Phase 15.2 — no second/fake fetching system.
      const result = await fetchVideoMetadata(url, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (result.ok === false) {
        // Read the CURRENT form values + manual flags (not the effect
        // closure) so a title typed while the fetch was in flight survives.
        const live = latestFormRef.current;
        const fallbackId =
          (parsed.ok === true && parsed.platform === 'youtube' ? parsed.externalVideoId : null) ||
          regexVideoId ||
          null;
        if (fallbackId) {
          // Metadata failed (rate limit, oEmbed outage, private video…) but
          // the YouTube id is valid: keep the derived thumbnail, keep the
          // fields editable and let the owner type title/channel manually.
          const derived = derivedYoutubeMetadata(fallbackId, url);
          previousMetaRef.current = derived;
          setFetchedMeta(derived);
          setNewVideoPlatform('youtube');
          setNewExternalVideoId(fallbackId);
          if (!live.thumbnailManual && !live.newVideoThumbnail.trim()) {
            setNewVideoThumbnail(youtubeThumbFromId(fallbackId));
            setThumbBroken(false);
          }
          setFetchStatus('partial');
          setFetchError(null);
          setFetchNotice(
            live.newVideoTitle.trim()
              ? null
              : 'Video details could not be loaded — add a title manually to save this video.',
          );
          return;
        }
        setFetchStatus('error');
        setFetchError(result.message);
        setFetchNotice(null);
        setFetchedMeta(null);
        setNewExternalVideoId(null);
        return;
      }

      // Read the CURRENT form values + manual flags (not the effect closure)
      // so a title typed while the fetch was in flight is never overwritten.
      const live = latestFormRef.current;
      const meta = result.metadata;
      const merged = mergePlatformMetadataIntoForm(
        {
          title: live.newVideoTitle,
          description: live.newVideoDescription,
          channelName: live.newVideoChannel,
          thumbnailUrl: live.newVideoThumbnail,
          url: live.newVideoUrl,
          platform: live.newVideoPlatform,
          externalVideoId: live.newExternalVideoId,
        },
        meta,
        {
          titleManual: live.titleManual,
          descriptionManual: live.descriptionManual,
          channelManual: live.channelManual,
          thumbnailManual: live.thumbnailManual,
        },
        previousMetaRef.current,
      );

      previousMetaRef.current = meta;
      setFetchedMeta(meta);
      setNewVideoPlatform(merged.platform);
      setNewExternalVideoId(merged.externalVideoId);
      setNewVideoTitle(merged.title);
      setNewVideoDescription(merged.description);
      setNewVideoChannel(merged.channelName);
      // Never end up with an empty thumbnail for a recognised YouTube id.
      setNewVideoThumbnail(
        merged.thumbnailUrl ||
          (merged.externalVideoId && merged.platform === 'youtube'
            ? youtubeThumbFromId(merged.externalVideoId)
            : merged.thumbnailUrl),
      );
      setThumbBroken(false);

      // PHASE 15.7 — do not rewrite the pasted destination. Shorts/Long is a
      // separate field and the exact platform URL is preserved on save.

      const notice = merged.title.trim() ? null : partialMetadataNotice(meta);
      setFetchNotice(notice);
      setFetchError(null);
      setFetchStatus(platformMetadataIsComplete(meta) ? 'success' : 'partial');
    }, VIDEO_METADATA_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Manual flags / form values are read at apply time inside the timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newVideoUrl, isAddingVideo]);

  const handleAddVideo = (e: FormEvent) => {
    e.preventDefault();

    // PHASE 15.6 — data-layer gate: denied sessions can never add, even if a
    // stale UI somehow shows the form.
    if (!canAddVideo(videoActor)) {
      showFeedback(videoEditDeniedMessage(videoActor.permission) || 'You are not allowed to add videos for this salon.');
      return;
    }

    const url = newVideoUrl.trim();
    if (!url) {
      setFetchError('Paste a video URL to continue.');
      setFetchStatus('error');
      return;
    }

    const regexVideoId = extractYoutubeIdFromRaw(url);

    if (fetchStatus === 'error' && !regexVideoId) {
      showFeedback(fetchError || 'Fix the video link before saving.');
      return;
    }

    if (fetchStatus === 'loading') {
      // A valid URL + manually typed title is enough to save — don't make the
      // owner wait for metadata that may never arrive. Cancel the in-flight
      // fetch and continue with the current form values.
      if (newVideoTitle.trim() && (regexVideoId || parseVideoUrl(url).ok === true)) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (fetchAbortRef.current) fetchAbortRef.current.abort();
      } else {
        showFeedback('Still loading video details…');
        return;
      }
    }

    // Prefer Phase 15.2 snapshot; otherwise re-validate the URL.
    let meta = fetchedMeta;
    if (!meta) {
      const parsed = parseVideoUrl(url);
      if (parsed.ok === false) {
        // Regex fallback: a recognisable VIDEO_ID still lets the owner save
        // with a manual title + derived hqdefault.jpg thumbnail.
        if (regexVideoId) {
          meta = derivedYoutubeMetadata(regexVideoId, url);
        } else {
          setFetchError(parsed.message);
          setFetchStatus('error');
          showFeedback(parsed.message);
          return;
        }
      }
    }

    const kind =
      detectedKind ||
      resolveVideoKind({
        videoKind: null,
        url,
        platform: newVideoPlatform,
      });

    const newVideo = socialVideoFromPasteAndMetadata({
      metadata: meta,
      form: {
        title: newVideoTitle,
        description: newVideoDescription,
        channelName: newVideoChannel,
        // Thumbnail is always derivable from the VIDEO_ID regex, even when
        // metadata fetching failed entirely (unless the image itself broke).
        thumbnailUrl: thumbBroken
          ? ''
          : newVideoThumbnail || (regexVideoId ? youtubeThumbFromId(regexVideoId) : ''),
        url,
        platform: newVideoPlatform,
        externalVideoId: newExternalVideoId,
      },
      videoKind: kind,
      themeId: activeThemeId,
      id: 'v-' + Date.now(),
    });

    if (!newVideo.title.trim()) {
      showFeedback('Title could not be loaded — add a title to save this video.');
      setFetchNotice('Title is required when platform metadata is incomplete.');
      return;
    }

    setData({
      ...data,
      socialVideos: [newVideo, ...videoList],
    });

    closeAddModal();
    showFeedback(
      platformMetadataIsComplete(meta)
        ? 'Video added with auto-filled title, thumbnail and channel.'
        : 'Video added.',
    );
    if (onSave) onSave();
  };

  const handleDeleteVideo = (id: string) => {
    // PHASE 15.5 — protected theme mock/default records cannot be permanently
    // deleted. filterDeletableOwnerVideos retains them; the public gallery
    // would re-fill them from the catalog anyway.
    if (isDeleteBlockedForVideoId(videoList, id) || isProtectedThemeMockVideo(videoList.find((v) => v.id === id))) {
      showFeedback('Theme showcase videos cannot be permanently deleted.');
      return;
    }
    // PHASE 15.6 — capability gate (owner: own rows only; admin claim for
    // protected records). Reuses the session-resolved actor, never a client id.
    if (!canDeleteVideo(videoActor, videoList.find((v) => v.id === id))) {
      showFeedback('Theme showcase videos cannot be permanently deleted.');
      return;
    }
    const updated = filterDeletableOwnerVideos(videoList, id);
    setData({ ...data, socialVideos: updated });
    showFeedback('Social video removed');
    if (onSave) onSave();
  };

  /**
   * "Add Video" enablement: a valid YouTube URL (parseable OR containing a
   * regex-extractable VIDEO_ID) plus at least 1 non-empty title character —
   * whether the title was auto-filled or typed manually.
   */
  const trimmedNewVideoUrl = newVideoUrl.trim();
  const newVideoUrlIsValid =
    !!trimmedNewVideoUrl &&
    (!!extractYoutubeIdFromRaw(trimmedNewVideoUrl) || parseVideoUrl(trimmedNewVideoUrl).ok === true);
  const canSubmitNewVideo = newVideoUrlIsValid && newVideoTitle.trim().length > 0;

  /**
   * As soon as the Title has any text — whether auto-filled by metadata or
   * typed manually — "title is required"-style warnings are stale: hide them.
   */
  useEffect(() => {
    if (!newVideoTitle.trim()) return;
    setFetchNotice((prev) => (isTitleRequiredNotice(prev) ? null : prev));
  }, [newVideoTitle]);

  return (
    <div className="flex-1 flex flex-col md:flex-row w-full h-full bg-[#f9f9f9]">
      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex bg-white border-b border-[#eeeeee] p-2 gap-2 shrink-0 z-30">
        <button
          onClick={() => setMobileTab('edit')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'edit' ? 'bg-[#ac0053] text-white' : 'bg-[#f9f9f9] text-[#5f5e5e]'
          }`}
        >
          <Edit2 className="w-3.5 h-3.5" /> Edit Socials
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'preview' ? 'bg-[#ac0053] text-white' : 'bg-[#f9f9f9] text-[#5f5e5e]'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" /> Live Preview
        </button>
      </div>

      {/* LEFT COLUMN: Management Form (55% desktop layout) */}
      <div className={`w-full md:w-[55%] h-full flex flex-col relative bg-[#f9f9f9] border-r border-[#eeeeee] ${mobileTab === 'preview' ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-8">
          <div className="max-w-2xl mx-auto pb-32 space-y-6">

            {/* Header */}
            <div>
              <span className="text-xs font-semibold tracking-wider text-[#ac0053] uppercase flex items-center gap-1">
                <Share2 className="w-4 h-4" /> STEP 06 • SOCIAL CONNECTIVITY
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c] mt-1 mb-1">
                Connect your social media
              </h1>
              <p className="text-[#5f5e5e] text-sm leading-relaxed">
                Add your profiles and short videos. They'll appear directly on your website to build social proof and showcase real client transformations.
              </p>
            </div>

            {/* Toast Feedback */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-[#ffd9e1] border border-[#ac0053]/30 text-[#ac0053] text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-between shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" /> {feedback}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SECTION 1: SOCIAL PROFILES */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-5">
              <h2 className="text-base font-bold text-[#1a1c1c] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ac0053]"></span> Social Profiles
              </h2>

              <div className="space-y-4">
                {/* Instagram Profile */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#ac0053]" /> Instagram Profile
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={profiles.instagram || ''}
                      onChange={e => handleProfileChange('instagram', e.target.value)}
                      placeholder="https://instagram.com/yourhandle"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#ac0053] focus:bg-white transition-all pr-28"
                    />
                    <div className="absolute right-3 flex items-center gap-1 text-[#ac0053]">
                      {profiles.instagram ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[11px] font-bold">Connected</span>
                        </>
                      ) : (
                        <span className="text-[11px] font-bold text-gray-400">Not connected</span>
                      )}
                    </div>
                  </div>
                  {profiles.instagram && (
                    <p className="text-[11px] text-gray-500 font-medium pl-1">
                      @{profiles.instagram.split('/').filter(Boolean).pop()}
                    </p>
                  )}
                </div>

                {/* Facebook Profile */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 text-blue-600" /> Facebook Page/Profile
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={profiles.facebook || ''}
                      onChange={e => handleProfileChange('facebook', e.target.value)}
                      placeholder="https://facebook.com/yourpage"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#ac0053] focus:bg-white transition-all pr-24"
                    />
                    <button
                      type="button"
                      onClick={() => handleProfileChange('facebook', profiles.facebook || 'https://facebook.com/royalhairstudio')}
                      className="absolute right-3 text-xs font-bold text-[#ac0053] hover:underline"
                    >
                      {profiles.facebook ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                </div>

                {/* YouTube Channel */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-red-600" /> YouTube Channel
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={profiles.youtube || ''}
                      onChange={e => handleProfileChange('youtube', e.target.value)}
                      placeholder="https://youtube.com/@yourchannel"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#ac0053] focus:bg-white transition-all pr-24"
                    />
                    <button
                      type="button"
                      onClick={() => handleProfileChange('youtube', profiles.youtube || 'https://youtube.com/@royalhairstudio')}
                      className="absolute right-3 text-xs font-bold text-[#ac0053] hover:underline"
                    >
                      {profiles.youtube ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                </div>

                {/* TikTok Profile */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                    <VideoIcon className="w-4 h-4 text-black" /> TikTok Profile
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={profiles.tiktok || ''}
                      onChange={e => handleProfileChange('tiktok', e.target.value)}
                      placeholder="https://tiktok.com/@yourhandle"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#ac0053] focus:bg-white transition-all pr-24"
                    />
                    <button
                      type="button"
                      onClick={() => handleProfileChange('tiktok', profiles.tiktok || 'https://tiktok.com/@royalhairstudio')}
                      className="absolute right-3 text-xs font-bold text-[#ac0053] hover:underline"
                    >
                      {profiles.tiktok ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: SHOW YOUR WORK (SOCIAL VIDEOS) */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#1a1c1c] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ac0053]"></span> Show your work
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Paste a YouTube URL only — thumbnail, title, description and channel fill in automatically.
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="add-social-video-open"
                  disabled={!canAddVideo(videoActor)}
                  onClick={() => {
                    if (!canAddVideo(videoActor)) return;
                    resetAddForm();
                    setIsAddingVideo(true);
                  }}
                  className="bg-[#ffd9e1] text-[#ac0053] hover:bg-[#ac0053] hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" /> Add Social Video
                </button>
              </div>

              {/* PHASE 15.6 — permission notice (helpers still hard-refuse). */}
              {videoPermissionDenied && (
                <div
                  data-testid="video-permission-denied"
                  className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{videoEditDeniedMessage(videoActor.permission)}</span>
                </div>
              )}

              {/* Video Cards List */}
              <div className="space-y-3">
                <AnimatePresence>
                  {videoList.map((video) => (
                    <OwnerVideoCard
                      key={video.id}
                      video={video}
                      onDelete={() => handleDeleteVideo(video.id)}
                    />
                  ))}
                </AnimatePresence>

                {videoList.length === 0 && (
                  <div className="p-8 border-2 border-dashed border-gray-200 rounded-2xl text-center space-y-2">
                    <VideoIcon className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-xs font-bold text-gray-600">No social videos added yet</p>
                    <p className="text-[11px] text-gray-400">Paste a YouTube link — only the URL is required.</p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2B: OWNER/ADMIN VIDEO MANAGEMENT (PHASE 15.6) */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <VideoManagementPanel
                data={data}
                setData={setData}
                onSave={onSave}
                actor={videoActor}
                themeId={panelThemeId}
                onShowFeedback={showFeedback}
              />
            </div>

            {/* FOOTER NAVIGATION */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onPrev}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                type="button"
                onClick={onNext}
                className="px-6 py-2.5 bg-[#ac0053] hover:bg-[#ba005b] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Sticky Live Preview (45% desktop layout) */}
      <div className={`w-full md:w-[45%] h-full bg-[#f3f3f4] relative overflow-hidden ${mobileTab === 'edit' ? 'hidden md:flex' : 'flex'}`}>
        <PreviewPane data={data} step={6} />
      </div>

      {/* MODAL: ADD SOCIAL VIDEO */}
      <AnimatePresence>
        {isAddingVideo && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            data-testid="add-social-video-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <VideoIcon className="w-5 h-5 text-[#ac0053]" /> Add Social Video
                </h3>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="text-gray-400 hover:text-black p-1"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddVideo} className="space-y-4" data-testid="video-paste-form">
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-url-input">
                    Paste YouTube URL
                  </label>
                  <div className="relative">
                    <input
                      id="video-url-input"
                      data-testid="video-url-input"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      value={newVideoUrl}
                      onChange={e => setNewVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=…  or  /shorts/…  or  youtu.be/…"
                      className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-xs outline-none focus:bg-white pr-10 ${
                        fetchStatus === 'error'
                          ? 'border-red-400 focus:border-red-500'
                          : fetchStatus === 'success' || fetchStatus === 'partial'
                            ? 'border-emerald-400 focus:border-emerald-500'
                            : 'border-gray-200 focus:border-[#ac0053]'
                      }`}
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {fetchStatus === 'loading' && (
                        <Loader2
                          data-testid="video-meta-loading"
                          className="w-4 h-4 text-[#ac0053] animate-spin"
                          aria-label="Fetching video details"
                        />
                      )}
                      {(fetchStatus === 'success' || fetchStatus === 'partial') && (
                        <CheckCircle2
                          data-testid="video-meta-success"
                          className="w-4 h-4 text-emerald-600"
                          aria-label="Video details loaded"
                        />
                      )}
                      {fetchStatus === 'error' && (
                        <AlertCircle
                          data-testid="video-meta-error-icon"
                          className="w-4 h-4 text-red-500"
                          aria-label="Video link error"
                        />
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Only the URL is required. Title, thumbnail, description and channel fill in automatically.
                  </p>
                  {fetchError && (
                    <p
                      data-testid="video-meta-error"
                      role="alert"
                      className="mt-1.5 text-[11px] font-semibold text-red-600 flex items-start gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{fetchError}</span>
                    </p>
                  )}
                  {fetchNotice && !fetchError && (
                    <p
                      data-testid="video-meta-notice"
                      className="mt-1.5 text-[11px] font-semibold text-amber-700 flex items-start gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{fetchNotice}</span>
                    </p>
                  )}
                </div>

                {/* Auto-filled preview — PHASE 15.4 */}
                {(fetchStatus === 'success' || fetchStatus === 'partial') && fetchedMeta && (
                  <div
                    data-testid="video-meta-preview"
                    data-meta-source={fetchedMeta.source}
                    data-video-kind={detectedKind || ''}
                    className="flex items-start gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/60"
                  >
                    {!thumbBroken && newVideoThumbnail ? (
                      <img
                        src={newVideoThumbnail}
                        alt=""
                        data-testid="video-meta-thumb"
                        className="w-20 h-14 rounded-lg object-cover border border-gray-200 shrink-0 bg-gray-100"
                        onError={() => setThumbBroken(true)}
                      />
                    ) : (
                      <div
                        data-testid="video-meta-thumb-fallback"
                        className="w-20 h-14 rounded-lg bg-gray-200 flex flex-col items-center justify-center shrink-0 gap-0.5"
                      >
                        <PlayCircle className="w-5 h-5 text-gray-400" />
                        <span className="text-[8px] font-bold text-gray-500 uppercase">No thumb</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Auto-filled from {fetchedMeta.platform}
                        {detectedKind ? ` · ${detectedKind === 'short' ? 'Short' : 'Long'}` : ''}
                      </p>
                      {newVideoTitle && (
                        <p data-testid="video-meta-title" className="text-xs font-bold text-gray-900 line-clamp-2">
                          {newVideoTitle}
                        </p>
                      )}
                      {newVideoChannel && (
                        <p data-testid="video-meta-channel" className="text-[11px] text-gray-600 truncate">
                          {newVideoChannel}
                        </p>
                      )}
                      {newExternalVideoId && (
                        <p data-testid="video-meta-id" className="text-[10px] text-gray-400 font-mono">
                          ID: {newExternalVideoId}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-title-input">
                    Title
                    {(fetchStatus === 'success' || fetchStatus === 'partial') && !titleManual && newVideoTitle ? (
                      <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 normal-case">auto-filled</span>
                    ) : null}
                  </label>
                  <input
                    id="video-title-input"
                    data-testid="video-title-input"
                    name="title"
                    type="text"
                    value={newVideoTitle}
                    disabled={false}
                    readOnly={false}
                    onChange={e => {
                      setTitleManual(true);
                      setNewVideoTitle(e.target.value);
                      // Typing a title resolves the "title is required"
                      // warning — hide it immediately.
                      if (e.target.value.trim()) {
                        setFetchNotice(prev => (isTitleRequiredNotice(prev) ? null : prev));
                      }
                    }}
                    placeholder={fetchStatus === 'loading' ? 'Loading title…' : 'Fills automatically from YouTube'}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-channel-input">
                    Channel / Source
                    {(fetchStatus === 'success' || fetchStatus === 'partial') && !channelManual && newVideoChannel ? (
                      <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 normal-case">auto-filled</span>
                    ) : null}
                  </label>
                  <input
                    id="video-channel-input"
                    data-testid="video-channel-field"
                    name="channel"
                    type="text"
                    value={newVideoChannel}
                    disabled={false}
                    readOnly={false}
                    onChange={e => {
                      setChannelManual(true);
                      setNewVideoChannel(e.target.value);
                    }}
                    placeholder="Fills automatically from YouTube"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1" htmlFor="video-description-input">
                    Description
                    {(fetchStatus === 'success' || fetchStatus === 'partial') && !descriptionManual && newVideoDescription ? (
                      <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 normal-case">auto-filled</span>
                    ) : null}
                  </label>
                  <textarea
                    id="video-description-input"
                    data-testid="video-description-field"
                    value={newVideoDescription}
                    onChange={e => {
                      setDescriptionManual(true);
                      setNewVideoDescription(e.target.value);
                    }}
                    rows={3}
                    placeholder="Fills automatically when available"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] focus:bg-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Thumbnail
                    {(fetchStatus === 'success' || fetchStatus === 'partial') && fetchedMeta?.thumbnailUrl && !thumbnailManual ? (
                      <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 normal-case">from YouTube</span>
                    ) : null}
                  </label>
                  <div className="flex items-center gap-3" data-testid="video-thumb-selected-wrap">
                    {!thumbBroken && newVideoThumbnail ? (
                      <img
                        src={newVideoThumbnail}
                        alt="Selected thumbnail"
                        data-testid="video-thumb-selected"
                        className="w-24 h-16 rounded-lg object-cover border-2 border-[#ac0053] bg-gray-100"
                        onError={() => setThumbBroken(true)}
                      />
                    ) : (
                      <div
                        data-testid="video-thumb-fallback"
                        className="w-24 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5"
                      >
                        <VideoIcon className="w-5 h-5 text-gray-400" />
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wide">Unavailable</span>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 flex-1">
                      {newVideoThumbnail && !thumbBroken
                        ? 'Pulled automatically from the video. You can still edit the title above.'
                        : 'Thumbnail will appear once the link is recognised. A placeholder is used if it cannot load.'}
                    </p>
                  </div>
                </div>

                {detectedKind && (
                  <p data-testid="video-detected-kind" className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Detected type: {detectedKind === 'short' ? 'Short' : 'Long video'}
                    {activeThemeId ? ` · theme ${activeThemeId}` : ''}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="video-add-submit"
                    disabled={!canSubmitNewVideo}
                    className="px-5 py-2 text-xs bg-[#ac0053] text-white font-bold rounded-xl hover:bg-[#ba005b] shadow-xs disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    {fetchStatus === 'loading' && !canSubmitNewVideo ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…
                      </>
                    ) : (
                      <>
                        <Link className="w-3.5 h-3.5" /> Add Video
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Owner list card with broken-thumbnail fallback (never shows a broken image). */
const OwnerVideoCard: FC<{ video: SocialVideo; onDelete: () => void }> = ({ video, onDelete }) => {
  const [broken, setBroken] = useState(false);
  const kind = video.videoKind || resolveVideoKind(video);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      data-testid="owner-social-video-card"
      data-external-id={video.externalVideoId || ''}
      data-video-kind={kind || ''}
      data-theme-id={video.themeId || ''}
      className="flex items-center gap-3.5 p-3 border border-gray-200 rounded-xl bg-[#f9f9f9] hover:bg-white hover:shadow-xs transition-all group"
    >
      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0 border border-gray-200">
        {video.thumbnailUrl && !broken ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            data-testid="owner-video-thumb"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setBroken(true)}
          />
        ) : (
          <div
            data-testid="owner-video-thumb-fallback"
            className="w-full h-full flex flex-col items-center justify-center bg-gray-100 gap-0.5"
          >
            <VideoIcon className="w-5 h-5 text-gray-400" />
            <span className="text-[7px] font-bold text-gray-500 uppercase">No image</span>
          </div>
        )}
        <div className="absolute bottom-1 right-1 bg-white/90 backdrop-blur-xs rounded-full p-1 text-[#ac0053] shadow-xs">
          {video.platform === 'youtube' ? (
            <PlayCircle className="w-3.5 h-3.5 text-red-600" />
          ) : video.platform === 'tiktok' ? (
            <VideoIcon className="w-3.5 h-3.5 text-black" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-pink-600" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 truncate">{video.title || 'Untitled video'}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 capitalize">
          {video.platform}
          {kind ? ` · ${kind === 'short' ? 'Short' : 'Long'}` : ''}
          {video.channelName ? ` · ${video.channelName}` : ''}
        </p>
        {video.description && (
          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{video.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-80 group-hover:opacity-100"
        title="Delete video"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
