import { 
  ArrowLeft, ArrowRight, Plus, Edit2, Trash2, X, Image as ImageIcon, Monitor, 
  Sparkles, Upload, Check, ChevronLeft, ChevronRight, Wand2, Eye, RefreshCw,
  ArrowLeftRight, ShieldAlert, Loader2
} from 'lucide-react';
import { SalonData, GalleryImage } from '../types';
import PreviewPane from '../components/PreviewPane';
import GalleryModerationPanel from '../components/GalleryModerationPanel';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, DragEvent, useEffect } from 'react';
import {
  GALLERY_MANAGEMENT_THEMES,
  GALLERY_OWNER_CATEGORIES,
  galleryManagementThemeLabel,
  galleryServicesForTheme,
  galleryEditPermission,
  galleryEditDeniedMessage,
  normalizeGalleryCategory,
  nextGalleryDisplayOrder,
  applyGalleryDisplayOrder,
  readGalleryFileAsDataUrl,
  validateGalleryImageFile,
  type GalleryStatus,
} from '../lib/galleryManagement';
import { isSiteHeaderTheme, type SiteHeaderThemeId } from '../lib/siteNavigation';
import { useAuth } from '../lib/useAuth';
import { resolveOwnerSalonId } from '../lib/ownerSalon';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { deleteSalonMedia, uploadSalonMedia } from '../lib/salonMediaService';
import { compressImageToMaxFileSize, formatFileSize } from '../lib/imageCompression';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (d?: SalonData) => void;
}

const DEMO_GALLERY_PRESETS: GalleryImage[] = [
  {
    id: 'demo-1',
    url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=800&auto=format&fit=crop',
    alt: 'High-end minimalist salon interior with natural sunlight',
    category: 'Interior'
  },
  {
    id: 'demo-2',
    url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop',
    alt: 'Precision salon shears and styling tools on marble tabletop',
    category: 'Details'
  },
  {
    id: 'demo-3',
    url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=800&auto=format&fit=crop',
    alt: 'Hand-painted dimensional balayage highlights and styling',
    category: 'Hair'
  },
  {
    id: 'demo-4',
    url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=800&auto=format&fit=crop',
    alt: 'Hot towel barber grooming and beard sculpting station',
    category: 'Barber'
  },
  {
    id: 'demo-5',
    url: 'https://images.unsplash.com/photo-1512290900673-700200832363?q=80&w=800&auto=format&fit=crop',
    alt: 'Serene spa facial treatment setup with soothing ambient light',
    category: 'Beauty'
  }
];

export default function StepPhotos({ data, setData, onNext, onPrev, onSave }: Props) {
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  
  // Drag & drop state
  const [dragActiveField, setDragActiveField] = useState<'logo' | 'hero' | 'gallery' | null>(null);

  // File input refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Editing state for gallery image
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('Interior');
  const [editAlt, setEditAlt] = useState<string>('');
  // PHASE 14.6 — extended gallery management fields
  const [editTheme, setEditTheme] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editServiceId, setEditServiceId] = useState<string>('');
  const [editBeforeUrl, setEditBeforeUrl] = useState<string>('');
  const [editStatus, setEditStatus] = useState<GalleryStatus>('active');

  // PHASE 14.6 — upload progress + error (with retry)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [beforeUploadProgress, setBeforeUploadProgress] = useState<number | null>(null);
  const beforeInputRef = useRef<HTMLInputElement>(null);

  // PHASE 14.6 — authorization (existing auth + ownership logic)
  const { user, loading: authLoading } = useAuth();
  const [editPermission, setEditPermission] = useState<'authorized' | 'not-configured' | 'not-authenticated' | 'no-ownership' | 'ambiguous' | 'permission-denied' | 'error'>(isSupabaseConfigured ? 'not-authenticated' : 'not-configured');
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEditPermission('not-configured');
      return;
    }
    if (authLoading) return;
    let cancelled = false;
    resolveOwnerSalonId()
      .then((resolution) => {
        if (cancelled) return;
        setEditPermission(galleryEditPermission(!!user, resolution));
      })
      .catch(() => {
        if (cancelled) return;
        setEditPermission('error');
      });
    return () => { cancelled = true; };
  }, [user, authLoading]);
  const permissionDenied = galleryEditDeniedMessage(editPermission) !== null;

  // Toast feedback
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const persistSinglePhoto = async (rawFile: File, mediaType: 'logo' | 'hero') => {
    if (!rawFile || !rawFile.type.startsWith('image/')) return;
    setIsProcessing(true);
    try {
      // Auto-resize to 0.25MB max for localStorage friendliness
      const file = await compressImageToMaxFileSize(rawFile, 0.25);
      if (file.size < rawFile.size) {
        showFeedback(`Resized to ${formatFileSize(file.size)}`);
      } else {
        showFeedback(`Uploading ${formatFileSize(file.size)}...`);
      }

      if (isSupabaseConfigured) {
        setUploadError(null);
        setUploadProgress(20);
        try {
          const resolution = await resolveOwnerSalonId();
          if (resolution.status !== 'resolved') throw new Error('A single owned salon is required to upload media.');
          const media = await uploadSalonMedia({
            salonId: resolution.salonId,
            file,
            mediaType,
            title: file.name.replace(/\.[^/.]+$/, ''),
            status: 'active',
          });
          if (!media.signedUrl) throw new Error('The uploaded image preview could not be created.');
          const nextData = mediaType === 'logo'
            ? { ...data, logoUrl: media.signedUrl }
            : { ...data, heroImageUrl: media.signedUrl };
          setData(nextData);
          setUploadProgress(100);
          showFeedback(mediaType === 'logo' ? 'Logo uploaded securely' : 'Main photo uploaded securely');
          if (onSave) onSave(nextData);
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : 'Unable to upload this image.');
        } finally {
          setUploadProgress(null);
        }
        return;
      }

      // Explicit offline/demo fallback only. Configured deployments use Storage.
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        if (!url) return;
        const nextData = mediaType === 'logo' ? { ...data, logoUrl: url } : { ...data, heroImageUrl: url };
        setData(nextData);
        showFeedback(mediaType === 'logo' ? 'Logo updated successfully' : 'Main photo updated successfully');
        if (onSave) onSave(nextData);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Photo persistence failed:', err);
      showFeedback('Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogoFile = (file: File) => { void persistSinglePhoto(file, 'logo'); };
  const handleHeroFile = (file: File) => { void persistSinglePhoto(file, 'hero'); };

  // Helper for gallery upload (validated, with progress + error + retry)
  const handleGalleryFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setIsProcessing(true);
    try {
      setUploadError(null);
      setUploadProgress(0);

      if (isSupabaseConfigured) {
      const uploaded: Awaited<ReturnType<typeof uploadSalonMedia>>[] = [];
      try {
        const resolution = await resolveOwnerSalonId();
        if (resolution.status !== 'resolved') throw new Error('A single owned salon is required to upload media.');
        for (let index = 0; index < list.length; index += 1) {
          const file = list[index];
          const problem = validateGalleryImageFile(file);
          if (problem) throw new Error(problem);
          const media = await uploadSalonMedia({
            salonId: resolution.salonId,
            file,
            mediaType: 'gallery',
            title: file.name.replace(/\.[^/.]+$/, ''),
            status: 'pending',
            displayOrder: nextGalleryDisplayOrder(data.gallery || []) + index,
          });
          uploaded.push(media);
          setUploadProgress(Math.round(((index + 1) / list.length) * 100));
        }
        const currentGallery = data.gallery || [];
        const newItems: GalleryImage[] = uploaded.map((media) => ({
          id: media.id,
          storagePath: media.storagePath || undefined,
          url: media.signedUrl || '',
          alt: media.title || 'Salon gallery image',
          category: 'General',
          title: media.title || undefined,
          displayOrder: media.displayOrder,
          status: 'active',
          moderation: 'pending',
        }));
        const nextData = { ...data, gallery: [...currentGallery, ...newItems] };
        setData(nextData);
        showFeedback(`Uploaded ${newItems.length} photo(s) for moderation`);
        if (onSave) onSave(nextData);
      } catch (error) {
        // Preserve all-or-nothing UI semantics. Best-effort delete any objects
        // persisted earlier in this batch when a later upload fails.
        await Promise.all(uploaded.map((media) => deleteSalonMedia(media).catch(() => undefined)));
        setUploadError(error instanceof Error ? error.message : 'Unable to upload these images.');
      } finally {
        setUploadProgress(null);
      }
      return;
    }

    const valid: { file: File; url: string }[] = [];
    for (const rawFile of list) {
      const file = await compressImageToMaxFileSize(rawFile, 0.2);
      if (file.size < rawFile.size) {
        showFeedback(`Resized ${formatFileSize(rawFile.size)} to ${formatFileSize(file.size)}`);
      } else {
        showFeedback(`Uploading ${formatFileSize(file.size)}...`);
      }

      const problem = validateGalleryImageFile(file);
      if (problem) {
        setUploadError(problem);
        setUploadProgress(null);
        return;
      }
      try {
        const url = await readGalleryFileAsDataUrl(file, (percent) => setUploadProgress(percent));
        valid.push({ file, url });
      } catch {
        setUploadError('Could not read that image. Try another image.');
        setUploadProgress(null);
        return;
      }
    }

    if (valid.length > 0) {
      const currentGallery = data.gallery || [];
      const start = nextGalleryDisplayOrder(currentGallery);
      const newItems: GalleryImage[] = valid.map((entry, idx) => ({
        id: 'g-' + Date.now() + '-' + idx,
        url: entry.url,
        alt: entry.file.name.replace(/\.[^/.]+$/, ''),
        category: 'General',
        title: entry.file.name.replace(/\.[^/.]+$/, ''),
        displayOrder: start + idx,
        status: 'active',
        // PHASE 14.7 — new uploads enter moderation as pending.
        moderation: 'pending',
      }));
      const nextData = { ...data, gallery: [...currentGallery, ...newItems] };
      setData(nextData);
      showFeedback(`Added ${newItems.length} photo(s) to gallery`);
      if (onSave) onSave(nextData);
    }
    } catch (err) {
      console.error('Gallery files processing failed:', err);
      showFeedback('Failed to process gallery images');
    } finally {
      setUploadProgress(null);
      setIsProcessing(false);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: DragEvent, field: 'logo' | 'hero' | 'gallery') => {
    e.preventDefault();
    setDragActiveField(field);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragActiveField(null);
  };

  const handleDrop = (e: DragEvent, field: 'logo' | 'hero' | 'gallery') => {
    e.preventDefault();
    setDragActiveField(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (field === 'logo') {
        handleLogoFile(e.dataTransfer.files[0]);
      } else if (field === 'hero') {
        handleHeroFile(e.dataTransfer.files[0]);
      } else if (field === 'gallery') {
        handleGalleryFiles(e.dataTransfer.files);
      }
    }
  };

  // Use Demo Photos Action
  const handleUseDemoPhotos = () => {
    const nextData = {
      ...data,
      heroImageUrl: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=1000&auto=format&fit=crop',
      heroPosition: 'Center' as const,
      gallery: DEMO_GALLERY_PRESETS
    };
    setData(nextData);
    showFeedback('Applied demo stock photo gallery!');
    if (onSave) onSave(nextData);
  };

  // Remove gallery image
  const handleDeleteGalleryImage = async (id: string) => {
    const current = data.gallery || [];
    const image = current.find((item) => item.id === id);
    if (isSupabaseConfigured && image?.storagePath) {
      try {
        await deleteSalonMedia({ id: image.id, storagePath: image.storagePath });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Unable to delete this image.');
        return;
      }
    }
    const updated = current.filter(img => img.id !== id);
    const nextData = { ...data, gallery: updated };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  // Reorder gallery images (persists displayOrder)
  const moveGalleryImage = (index: number, direction: 'left' | 'right') => {
    const current = [...(data.gallery || [])];
    const target = direction === 'left' ? index - 1 : index + 1;
    if (target < 0 || target >= current.length) return;
    const temp = current[index];
    current[index] = current[target];
    current[target] = temp;
    const ordered = applyGalleryDisplayOrder(current, current.map((img) => img.id));
    const nextData = { ...data, gallery: ordered };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  // Open the extended edit modal for an image
  const openImageEditor = (img: GalleryImage) => {
    setEditingImageId(img.id);
    setEditCategory(normalizeGalleryCategory(img.category));
    setEditAlt(img.alt || '');
    setEditTheme(img.themeId || '');
    setEditTitle(img.title || '');
    setEditDescription(img.description || '');
    setEditServiceId(img.serviceId || '');
    setEditBeforeUrl(img.beforeUrl || '');
    setEditStatus(img.status === 'inactive' ? 'inactive' : 'active');
  };

  // Before image upload (Before/After pair — inherits the item's theme scope)
  const handleBeforeFile = async (file: File) => {
    setUploadError(null);
    setBeforeUploadProgress(0);
    const problem = validateGalleryImageFile(file);
    if (problem) {
      setUploadError(problem);
      setBeforeUploadProgress(null);
      return;
    }
    try {
      const url = await readGalleryFileAsDataUrl(file, (percent) => setBeforeUploadProgress(percent));
      setEditBeforeUrl(url);
    } catch {
      setUploadError('Could not read that before image. Try another image.');
    }
    setBeforeUploadProgress(null);
  };

  // Edit image modal / popup submit (extended for gallery management)
  const handleSaveImageEdit = (id: string) => {
    const current = (data.gallery || []).map(img => {
      if (img.id === id) {
        return {
          ...img,
          category: normalizeGalleryCategory(editCategory),
          alt: editAlt,
          themeId: editTheme || null,
          title: editTitle || undefined,
          description: editDescription || undefined,
          serviceId: editServiceId || null,
          beforeUrl: editBeforeUrl || undefined,
          beforeAlt: editBeforeUrl ? (editAlt || 'Before image') : img.beforeAlt,
          status: editStatus,
        };
      }
      return img;
    });
    const nextData = { ...data, gallery: current };
    setData(nextData);
    setEditingImageId(null);
    showFeedback('Photo details saved');
    if (onSave) onSave(nextData);
  };

  const galleryList = data.gallery || [];

  // PHASE 14.6 — service list is scoped to the selected theme (never cross-theme).
  const effectiveServiceTheme: SiteHeaderThemeId | null = isSiteHeaderTheme(editTheme)
    ? editTheme
    : isSiteHeaderTheme(data.templateId || '')
      ? (data.templateId as SiteHeaderThemeId)
      : null;
  const themeServices = effectiveServiceTheme ? galleryServicesForTheme(data, effectiveServiceTheme) : [];

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
          <Edit2 className="w-3.5 h-3.5" /> Edit Photos
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

      {/* LEFT COLUMN: Media Management (55% desktop layout) */}
      <div className={`w-full md:w-[55%] h-full flex flex-col relative bg-[#f9f9f9] border-r border-[#eeeeee] ${mobileTab === 'preview' ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-8">
          <div className="max-w-2xl mx-auto pb-32 space-y-6">

            {/* Header */}
            <div>
              <span className="text-xs font-semibold tracking-wider text-[#ac0053] uppercase flex items-center gap-1">
                <ImageIcon className="w-4 h-4" /> STEP 05 • PHOTOS + GALLERY
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c] mt-1 mb-1">
                Add your salon photos
              </h1>
              <p className="text-[#5f5e5e] text-sm leading-relaxed">
                Bring your Lumina template to life. Upload your logo and high-quality images to showcase your space, tools, and results.
              </p>
            </div>

            {/* PHASE 14.6 — authorization notice (existing auth + ownership) */}
            {permissionDenied && (
              <div
                data-testid="gallery-auth-notice"
                className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{galleryEditDeniedMessage(editPermission)}</span>
              </div>
            )}

            {/* Feedback toast */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-[#ffd9e1] border border-[#ac0053]/30 text-[#ac0053] text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" /> {feedback}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SECTION 1: SALON LOGO */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-[#1a1c1c] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ac0053]"></span> Salon Logo
                </h2>
                <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                  PNG or SVG, max 5MB
                </span>
              </div>

              {/* Upload Dashed Box / Preview */}
              <div
                onDragOver={e => handleDragOver(e, 'logo')}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, 'logo')}
                onClick={() => logoInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-center gap-4 ${
                  dragActiveField === 'logo'
                    ? 'border-[#ac0053] bg-[#ffd9e1]/20 scale-[1.01]'
                    : 'border-gray-200 hover:border-[#ac0053] bg-[#f9f9f9] hover:bg-white'
                }`}
              >
                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={e => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                />

                {data.logoUrl ? (
                  <div className="relative shrink-0">
                    <img
                      src={data.logoUrl}
                      alt="Salon Logo"
                      className="w-20 h-20 object-contain rounded-lg border border-gray-200 p-2 bg-white shadow-xs"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/60 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-[#ac0053] animate-spin" />
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-[#ac0053] text-white p-1 rounded-full shadow-xs">
                      <Check className="w-3 h-3" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#ffd9e1]/50 text-[#ac0053] flex items-center justify-center shrink-0">
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                  </div>
                )}

                <div className="text-center sm:text-left">
                  <div className="text-xs font-bold text-gray-900 flex items-center justify-center sm:justify-start gap-1.5">
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#ac0053] animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#ac0053]" />
                    )}
                    <span>{isProcessing ? 'Processing Image...' : (data.logoUrl ? 'Change Salon Logo' : '+ Add Logo')}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Click to browse or drag & drop transparent logo. Displays in header.
                  </p>
                  {data.logoUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setData({ ...data, logoUrl: '' });
                        showFeedback('Logo removed');
                        if (onSave) onSave();
                      }}
                      className="text-[11px] text-red-600 font-semibold hover:underline mt-1 inline-block"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: MAIN SALON PHOTO (HERO) */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-[#1a1c1c] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ac0053]"></span> Main Salon Photo
                </h2>
                <span className="text-[11px] font-semibold text-[#ac0053] bg-[#ffd9e1]/40 px-2.5 py-1 rounded-md">
                  Hero Image
                </span>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                This is the first image clients will see. Choose a wide shot of your interior or a stunning portrait. Files auto-resized to 5MB max.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                {/* Upload Hero Photo Button / Drop Box */}
                <div
                  onDragOver={e => handleDragOver(e, 'hero')}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, 'hero')}
                  onClick={() => heroInputRef.current?.click()}
                  className={`flex-1 border-2 border-dashed rounded-xl h-44 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all relative overflow-hidden group ${
                    dragActiveField === 'hero'
                      ? 'border-[#ac0053] bg-[#ffd9e1]/20'
                      : 'border-gray-200 hover:border-[#ac0053] bg-[#f9f9f9] hover:bg-white'
                  }`}
                >
                  <input
                    type="file"
                    ref={heroInputRef}
                    onChange={e => e.target.files?.[0] && handleHeroFile(e.target.files[0])}
                    accept="image/*"
                    className="hidden"
                  />

                  {data.heroImageUrl ? (
                    <>
                      <img
                        src={data.heroImageUrl}
                        alt="Hero Main"
                        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                          data.heroPosition === 'Top' ? 'object-top' : data.heroPosition === 'Bottom' ? 'object-bottom' : 'object-center'
                        }`}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-2">
                        <Upload className="w-4 h-4" /> Change Main Photo
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-[#ffd9e1]/50 text-[#ac0053] flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-gray-800">+ Add Main Photo</span>
                      <span className="text-[11px] text-gray-400">Drag & drop or click</span>
                    </>
                  )}
                </div>

                {/* Hero Alignment / Position Buttons */}
                <div className="w-full sm:w-28 flex sm:flex-col justify-between sm:justify-start gap-2 shrink-0">
                  <span className="text-xs font-bold text-gray-600 block sm:mb-1">Position</span>
                  {(['Top', 'Center', 'Bottom'] as const).map(pos => {
                    const active = (data.heroPosition || 'Center') === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => {
                          setData({ ...data, heroPosition: pos });
                          showFeedback(`Main photo position set to ${pos}`);
                          if (onSave) onSave();
                        }}
                        className={`flex-1 sm:flex-none py-2 px-3 border rounded-xl text-center text-xs font-semibold transition-all ${
                          active
                            ? 'bg-[#ac0053] text-white border-[#ac0053] shadow-xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-[#ac0053]'
                        }`}
                      >
                        {pos}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SECTION 3: GALLERY GRID */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-base font-bold text-[#1a1c1c] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ac0053]"></span> Gallery
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">3–10 photos recommended. Files auto-resized to 5MB max.</p>
                </div>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="bg-[#ac0053] text-white px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-[#ba005b] transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Photos
                </button>
                <input
                  type="file"
                  ref={galleryInputRef}
                  data-testid="gallery-file-input"
                  multiple
                  onChange={e => e.target.files && handleGalleryFiles(e.target.files)}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* PHASE 14.6 — upload progress + error with retry */}
              {uploadProgress !== null && (
                <div data-testid="gallery-upload-progress" className="flex items-center gap-2 text-xs text-[#5f5e5e]">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ac0053] transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="font-semibold tabular-nums">{uploadProgress}%</span>
                </div>
              )}
              {uploadError && (
                <div data-testid="gallery-upload-error" className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> {uploadError}
                  </span>
                  <button
                    type="button"
                    data-testid="gallery-upload-retry"
                    onClick={() => galleryInputRef.current?.click()}
                    className="shrink-0 text-red-700 font-bold underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Thumbnails Grid */}
              <div 
                onDragOver={e => handleDragOver(e, 'gallery')}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, 'gallery')}
                className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-1 rounded-2xl transition-all ${
                  dragActiveField === 'gallery' ? 'bg-[#ffd9e1]/20 ring-2 ring-[#ac0053] ring-dashed' : ''
                }`}
              >
                <AnimatePresence>
                  {galleryList.map((img, index) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-2xs hover:shadow-md transition-all cursor-pointer"
                    >
                      <img
                        src={img.url}
                        alt={img.alt || 'Gallery image'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />

                      {/* Overlay controls */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 text-white">
                        <div className="flex justify-between items-center">
                          {/* Reorder left/right */}
                          <div className="flex gap-1 bg-black/60 backdrop-blur-xs rounded-md p-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveGalleryImage(index, 'left');
                              }}
                              disabled={index === 0}
                              className="p-1 hover:text-[#ffd9e1] disabled:opacity-20"
                              title="Move Left"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveGalleryImage(index, 'right');
                              }}
                              disabled={index === galleryList.length - 1}
                              className="p-1 hover:text-[#ffd9e1] disabled:opacity-20"
                              title="Move Right"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              data-testid="gallery-edit-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                openImageEditor(img);
                              }}
                              className="w-7 h-7 bg-white text-gray-800 rounded-md flex items-center justify-center hover:bg-gray-100 shadow-xs"
                              title="Edit Image Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGalleryImage(img.id);
                              }}
                              className="w-7 h-7 bg-white text-red-600 rounded-md flex items-center justify-center hover:bg-red-50 shadow-xs"
                              title="Delete Image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Category / theme / status badges */}
                        <div className="mt-auto flex flex-wrap items-center gap-1">
                          <span className="bg-white/90 backdrop-blur-xs text-[#1a1c1c] text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs inline-block">
                            {img.category || 'General'}
                          </span>
                          {img.themeId && (
                            <span className="bg-white/90 backdrop-blur-xs text-[#ac0053] text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs inline-block">
                              {galleryManagementThemeLabel(img.themeId)}
                            </span>
                          )}
                          {img.beforeUrl && (
                            <span className="bg-white/90 backdrop-blur-xs text-[#1a1c1c] text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs inline-flex items-center gap-1">
                              <ArrowLeftRight className="w-3 h-3" /> Before/After
                            </span>
                          )}
                          {img.status === 'inactive' && (
                            <span className="bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-block">
                              Inactive
                            </span>
                          )}
                          {img.moderation === 'pending' && (
                            <span data-testid="gallery-thumb-pending" className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-block">
                              Pending
                            </span>
                          )}
                          {img.moderation === 'rejected' && (
                            <span data-testid="gallery-thumb-rejected" className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-block">
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Empty Slot for Drag & Drop / Click */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-[#ac0053] bg-[#f9f9f9] hover:bg-white flex flex-col items-center justify-center gap-1.5 transition-all text-gray-500 hover:text-[#ac0053] group"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-[#ffd9e1]/40 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-gray-600 group-hover:text-[#ac0053]" />
                  </div>
                  <span className="text-[11px] font-bold">Add Photo</span>
                </button>
              </div>
            </div>

            {/* SECTION 3B: GALLERY APPROVAL (PHASE 14.7 moderation) */}
            <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#eeeeee] shadow-2xs space-y-4">
              <GalleryModerationPanel
                data={data}
                setData={setData}
                onSave={onSave}
                canModerate={!permissionDenied}
              />
            </div>

            {/* SECTION 4: DEMO STOCK PHOTOS OPTION */}
            <div className="bg-[#ffd9e1]/20 rounded-2xl p-5 md:p-6 border border-[#ac0053]/20 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-sm font-bold text-[#3f001a] flex items-center justify-center sm:justify-start gap-1.5">
                  <Wand2 className="w-4 h-4 text-[#ac0053]" /> Don't have photos yet?
                </h3>
                <p className="text-xs text-[#80003c]">
                  We can provide high-quality stock imagery tailored to your salon style.
                </p>
              </div>

              <button
                type="button"
                onClick={handleUseDemoPhotos}
                className="whitespace-nowrap px-4 py-2.5 bg-white border border-[#ac0053] text-[#ac0053] hover:bg-[#ac0053] hover:text-white rounded-xl font-bold text-xs transition-all shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Use Demo Photos
              </button>
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
        <PreviewPane data={data} step={5} />
      </div>

      {/* MODAL: EDIT IMAGE DETAILS (PHASE 14.6 gallery management) */}
      <AnimatePresence>
        {editingImageId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              data-testid="gallery-edit-modal"
              className="bg-white rounded-2xl p-6 w-full max-w-lg border border-gray-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="font-bold text-gray-900 text-base">Manage Gallery Image</h3>
                <button
                  onClick={() => setEditingImageId(null)}
                  className="text-gray-400 hover:text-black p-1"
                  aria-label="Close editor"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Theme (isolation) */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Theme</label>
                <select
                  data-testid="gallery-theme-select"
                  value={editTheme}
                  onChange={e => {
                    setEditTheme(e.target.value);
                    // Cross-theme service link is dropped when the theme changes.
                    setEditServiceId('');
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                >
                  <option value="">Salon default (appears on your theme)</option>
                  {GALLERY_MANAGEMENT_THEMES.map(themeId => (
                    <option key={themeId} value={themeId}>{galleryManagementThemeLabel(themeId)}</option>
                  ))}
                </select>
              </div>

              {/* Category (theme-scoped generic tags) */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Gallery Category</label>
                <select
                  data-testid="gallery-category-select"
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                >
                  {GALLERY_OWNER_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Title + Description */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Title</label>
                <input
                  type="text"
                  data-testid="gallery-title-input"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="e.g. Signature fade"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Description / Alt Text</label>
                <input
                  type="text"
                  data-testid="gallery-description-input"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="e.g. Modern salon interior with bright lighting"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                />
              </div>

              {/* Link Service (optional, theme-scoped) */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Link Service (optional)</label>
                <select
                  data-testid="gallery-service-select"
                  value={editServiceId}
                  onChange={e => setEditServiceId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                >
                  <option value="">No linked service</option>
                  {themeServices.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
                {!effectiveServiceTheme && (
                  <p className="text-[11px] text-gray-400 mt-1">Select a theme to link a service.</p>
                )}
              </div>

              {/* Before/After pair */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Before Image (Before/After pair)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="gallery-before-upload"
                    onClick={() => beforeInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-semibold border border-[#ac0053] text-[#ac0053] rounded-xl hover:bg-[#ffd9e1]/40 flex items-center gap-1.5"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    {editBeforeUrl ? 'Change Before Image' : 'Add Before Image'}
                  </button>
                  {editBeforeUrl && (
                    <button
                      type="button"
                      data-testid="gallery-before-remove"
                      onClick={() => setEditBeforeUrl('')}
                      className="text-[11px] text-red-600 font-semibold hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={beforeInputRef}
                  data-testid="gallery-before-input"
                  onChange={e => e.target.files?.[0] && handleBeforeFile(e.target.files[0])}
                  accept="image/*"
                  className="hidden"
                />
                {beforeUploadProgress !== null && (
                  <div data-testid="gallery-before-progress" className="mt-2 text-xs text-[#5f5e5e] flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#ac0053]" style={{ width: `${beforeUploadProgress}%` }} />
                    </div>
                    <span className="font-semibold tabular-nums">{beforeUploadProgress}%</span>
                  </div>
                )}
                {editBeforeUrl && (
                  <div className="mt-2 flex gap-2">
                    <img src={editBeforeUrl} alt="Before" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <img src={galleryList.find(g => g.id === editingImageId)?.url || ''} alt="After" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                  </div>
                )}
                {editBeforeUrl && (
                  <p data-testid="gallery-before-theme-note" className="text-[11px] text-gray-400 mt-1">
                    Before/After shares the same theme: {editTheme ? galleryManagementThemeLabel(editTheme) : 'Salon default'}.
                  </p>
                )}
              </div>

              {/* Activate / Deactivate */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs font-bold text-gray-800">Visible in customer gallery</span>
                <button
                  type="button"
                  data-testid="gallery-status-toggle"
                  aria-pressed={editStatus === 'active'}
                  onClick={() => setEditStatus(prev => (prev === 'active' ? 'inactive' : 'active'))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    editStatus === 'active' ? 'bg-[#ac0053] text-white' : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {editStatus === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingImageId(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="gallery-save-details"
                  onClick={() => handleSaveImageEdit(editingImageId)}
                  className="px-5 py-2 text-xs bg-[#ac0053] text-white font-bold rounded-xl hover:bg-[#ba005b]"
                >
                  Save Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
