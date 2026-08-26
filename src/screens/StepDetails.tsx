import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Sparkles, Mic, ImagePlus, ArrowLeft, ArrowRight, X, Eye } from 'lucide-react';
import { SalonData } from '../types';
import PreviewPane from '../components/PreviewPane';
import { motion } from 'motion/react';
import { useBrandConfig } from '../config/brandConfig';
import { listOwnerTemplates, normalizeThemeId, switchSalonTemplatePresentation } from '../lib/templateConfig';
import type { ThemeId } from '../lib/themeServices';
import TemplateQuickViewModal from '../components/TemplateQuickViewModal';
import {
  OWNER_ROLES,
  OWNER_PHOTO_ACCEPT,
  getCustomOwnerRoleText,
  getOwnerRoleSelectValue,
  readOwnerPhotoAsDataUrl,
  resolveOwnerRoleFromSelect,
  validateOwnerPhoto,
} from '../lib/ownerProfile';

interface Props {
  data: SalonData;
  setData: Dispatch<SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
  onThemeChange?: (id: ThemeId) => Promise<void> | void;
}

export default function StepDetails({ data, setData, onNext, onPrev, onSave, onThemeChange }: Props) {
  const { platform } = useBrandConfig();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [switchingTemplates, setSwitchingTemplates] = useState<Partial<Record<ThemeId, number>>>({});
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [quickViewThemeId, setQuickViewThemeId] = useState<ThemeId | null>(null);
  const latestTemplateRequest = useRef(0);
  const pendingTemplateCount = Object.values(switchingTemplates as Record<string, number | undefined>)
    .reduce<number>((total, count) => total + (count ?? 0), 0);

  const applyTemplate = async (id: ThemeId) => {
    if (pendingTemplateCount === 0 && normalizeThemeId(data.templateId) === id) return;
    const requestId = ++latestTemplateRequest.current;
    setSwitchingTemplates((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    setTemplateError(null);
    try {
      if (onThemeChange) {
        await onThemeChange(id);
      } else {
        setData((current) => switchSalonTemplatePresentation(current, id));
      }
    } catch (error) {
      if (latestTemplateRequest.current === requestId) {
        // Guarantee local UI presentation updates smoothly
        setData((current) => switchSalonTemplatePresentation(current, id));
        console.warn('Template application warning:', error);
      }
    } finally {
      setSwitchingTemplates((current) => ({
        ...current,
        [id]: Math.max(0, (current[id] ?? 1) - 1),
      }));
    }
  };

  const persist = (next: SalonData) => {
    setData(next);
    onSave?.();
  };

  const handleOwnerPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    const error = validateOwnerPhoto(file);
    if (error) {
      setPhotoError(error);
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const url = await readOwnerPhotoAsDataUrl(file);
      persist({ ...data, ownerPhotoUrl: url });
    } catch {
      setPhotoError('Could not read that photo. Try another image.');
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemoveOwnerPhoto = () => {
    persist({ ...data, ownerPhotoUrl: '' });
    setPhotoError(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleRoleSelect = (value: string) => {
    persist({ ...data, ownerRole: resolveOwnerRoleFromSelect(value, data.ownerRole) });
  };

  const roleSelectValue = getOwnerRoleSelectValue(data.ownerRole);
  const customRoleText = getCustomOwnerRoleText(data.ownerRole);

  return (
    <div className="flex-1 flex w-full h-full">
      <div className="w-full md:w-[55%] h-full flex flex-col relative bg-white">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-12 lg:p-16">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto pb-24">
            <div className="mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#ffd9e1] text-[#8f0044] rounded-full text-[10px] font-bold uppercase tracking-wider mb-6">
                Business Details
              </span>
              <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">Tell us about your salon</h1>
              <p className="text-gray-500 text-lg">Add a few basic details. {platform.name} will use them to create your website.</p>
            </div>

            <form className="space-y-12" onSubmit={e => e.preventDefault()}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Business / Salon Name <span className="text-[#ac0053]">*</span></label>
                  <input 
                    type="text" 
                    value={data.salonName}
                    onChange={e => setData({...data, salonName: e.target.value})}
                    onBlur={onSave}
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-400 mt-2">This name will appear on your website.</p>
                </div>

                <div data-testid="owner-onboarding-templates">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Choose a starting template
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    You can switch later. Business data is never deleted.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {listOwnerTemplates().map((theme) => {
                      const active = normalizeThemeId(data.templateId) === theme.id;
                      return (
                        <div
                          key={theme.id}
                          className={`rounded-xl border p-2.5 flex flex-col justify-between transition-colors ${
                            active
                              ? 'border-[#ac0053] bg-[#ffd9e1]/30'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-gray-900">
                                {theme.name}
                              </span>
                              {active && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  Active
                                </span>
                              )}
                            </div>
                            <span className="block text-[11px] text-gray-500 line-clamp-2">{theme.tagline}</span>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                            <button
                              type="button"
                              data-testid={`template-quickview-step2-${theme.id}`}
                              onClick={() => setQuickViewThemeId(theme.id)}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#ac0053] bg-pink-50 hover:bg-pink-100 transition-colors flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> Quick View
                            </button>
                            <button
                              type="button"
                              onClick={() => void applyTemplate(theme.id)}
                              disabled={active && pendingTemplateCount === 0}
                              className="flex-1 py-1 rounded-lg text-[11px] font-bold text-white transition-colors disabled:opacity-50"
                              style={{ backgroundColor: active ? theme.accent : '#ac0053' }}
                            >
                              {(switchingTemplates[theme.id] ?? 0) > 0 ? 'Applying…' : active ? 'Selected' : 'Select'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {templateError && (
                    <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {templateError}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-sm font-semibold text-gray-900">Business Tagline <span className="text-gray-400 font-normal ml-1">(Optional)</span></label>
                    <button type="button" className="text-[#ac0053] text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                      <Sparkles className="w-3.5 h-3.5" /> Suggest with AI
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={data.tagline}
                    onChange={e => setData({...data, tagline: e.target.value})}
                    onBlur={onSave}
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-8 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#ac0053]"></div>
                <h2 className="text-2xl font-bold text-gray-900">About the Owner</h2>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Owner / Founder Name <span className="text-[#ac0053]">*</span></label>
                  <input 
                    type="text" 
                    value={data.ownerName}
                    onChange={e => setData({...data, ownerName: e.target.value})}
                    onBlur={onSave}
                    className="w-full px-4 py-3.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Owner Photo <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept={OWNER_PHOTO_ACCEPT}
                      className="hidden"
                      onChange={e => handleOwnerPhotoFile(e.target.files?.[0])}
                    />
                    {data.ownerPhotoUrl ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-4 bg-gray-50">
                        <img
                          src={data.ownerPhotoUrl}
                          alt={data.ownerName ? `${data.ownerName} photo` : 'Owner photo preview'}
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">Photo added</p>
                          <p className="text-[11px] text-gray-400 mb-1.5">JPG, PNG, WEBP or GIF · max 2MB</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              disabled={photoBusy}
                              className="text-xs font-semibold text-[#ac0053] hover:opacity-80 disabled:opacity-50"
                            >
                              {photoBusy ? 'Uploading…' : 'Change'}
                            </button>
                            <button
                              type="button"
                              onClick={handleRemoveOwnerPhoto}
                              disabled={photoBusy}
                              className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <X className="w-3 h-3" /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoBusy}
                        className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors group disabled:opacity-60"
                      >
                        <span className="text-sm font-semibold text-gray-500 group-hover:text-[#ac0053] flex items-center gap-2">
                          <ImagePlus className="w-4 h-4" /> {photoBusy ? 'Uploading…' : 'Add Photo'}
                        </span>
                        <span className="text-[11px] text-gray-400 mt-1">JPG, PNG, WEBP or GIF · max 2MB</span>
                      </button>
                    )}
                    {photoError && (
                      <p className="text-xs text-red-600 mt-2 font-medium">{photoError}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Owner Role <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <select
                      value={roleSelectValue}
                      onChange={e => handleRoleSelect(e.target.value)}
                      onBlur={onSave}
                      className="w-full h-[72px] px-4 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all text-gray-800"
                    >
                      <option value="">Select role</option>
                      {OWNER_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    {roleSelectValue === 'Other' && (
                      <input
                        type="text"
                        value={customRoleText}
                        onChange={e => persist({ ...data, ownerRole: e.target.value.trim() ? e.target.value : 'Other' })}
                        onBlur={onSave}
                        placeholder="Enter your role"
                        className="w-full mt-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-900">Tell customers about your business <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <div className="flex gap-4">
                    <button type="button" className="text-gray-500 text-xs font-semibold flex items-center gap-1.5 hover:text-[#ac0053] transition-colors">
                      <Mic className="w-3.5 h-3.5" /> Speak instead
                    </button>
                    <button type="button" className="text-[#ac0053] text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                      <Sparkles className="w-3.5 h-3.5" /> Write with AI
                    </button>
                  </div>
                </div>
                <textarea 
                  rows={5}
                  value={data.about}
                  onChange={e => setData({...data, about: e.target.value})}
                  onBlur={onSave}
                  className="w-full px-4 py-4 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#d9006b] focus:ring-2 focus:ring-pink-100 outline-none transition-all resize-none"
                  placeholder="Briefly describe your services, ambiance, or specialties..."
                />
              </div>
            </form>
          </motion.div>
        </div>
        
        {/* Footer Actions */}
        <div className="absolute bottom-0 left-0 w-full p-6 bg-white border-t border-gray-200 flex justify-between items-center z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
          <button onClick={onPrev} className="px-6 py-3 rounded-lg text-gray-600 font-semibold flex items-center gap-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button onClick={onNext} className="px-8 py-3 rounded-lg bg-[#ac0053] text-white font-semibold flex items-center gap-2 hover:bg-[#8f0044] transition-colors shadow-sm">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="hidden md:block w-[45%] h-full">
        <PreviewPane data={data} step={2} />
      </div>

      {quickViewThemeId && (
        <TemplateQuickViewModal
          themeId={quickViewThemeId}
          data={data}
          onClose={() => setQuickViewThemeId(null)}
          onApply={(id) => void applyTemplate(id)}
          isActive={normalizeThemeId(data.templateId) === quickViewThemeId}
        />
      )}
    </div>
  );
}
