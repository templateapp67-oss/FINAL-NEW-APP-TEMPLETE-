import { authenticatedApiFetch } from '../lib/apiFetch';
import { 
  ArrowLeft, ArrowRight, Plus, Edit2, Trash2, X, Image as ImageIcon, Monitor, 
  Sparkles, Loader2, RefreshCw, Upload, Check, ChevronUp, ChevronDown, Clock, ShieldCheck, UserCheck
} from 'lucide-react';
import { SalonData, TeamMember, AppAccessRole, StaffStatus, WeeklySchedule, DEFAULT_WEEKLY_SCHEDULE } from '../types';
import PreviewPane from '../components/PreviewPane';
import { motion, AnimatePresence } from 'motion/react';
import { useState, FormEvent, useRef, DragEvent } from 'react';
import { compressImageToMaxFileSize } from '../lib/imageCompression';
import TestimonialsEditor from '../components/TestimonialsEditor';
import {
  createPreviewUrl,
  readImageAsDataUrl,
  revokePreviewUrl,
  validateImageUploadFile,
  describeUploadError,
  IMAGE_UPLOAD_ACCEPT_ATTR,
} from '../lib/mediaUpload';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (d?: SalonData) => void;
  onOpenStaffManagement?: () => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1595959183082-7b570b7e08e2?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
];

const PRIMARY_ROLE_CATEGORIES = [
  {
    category: 'BARBER / GROOMING',
    roles: ['Barber', 'Junior Barber', 'Senior Barber', 'Master Barber', 'Beard Specialist', 'Grooming Expert']
  },
  {
    category: 'HAIR',
    roles: ['Hair Dresser', 'Hair Stylist', 'Junior Stylist', 'Senior Stylist', 'Master Stylist', 'Hair Colorist', 'Color Specialist', 'Hair Treatment Specialist', 'Keratin Specialist', 'Hair Extension Specialist']
  },
  {
    category: 'BEAUTY',
    roles: ['Beautician', 'Beauty Expert', 'Beauty Therapist', 'Makeup Artist', 'Bridal Makeup Artist', 'Skin Therapist', 'Facial Specialist', 'Waxing Specialist']
  },
  {
    category: 'NAILS',
    roles: ['Nail Artist', 'Nail Technician', 'Manicure Specialist', 'Pedicure Specialist']
  },
  {
    category: 'SPA / MASSAGE',
    roles: ['Spa Therapist', 'Massage Therapist', 'Wellness Therapist', 'Deep Tissue Therapist', 'Aromatherapy Therapist']
  },
  {
    category: 'MANAGEMENT / FRONT DESK',
    roles: ['Salon Manager', 'Floor Manager', 'Receptionist', 'Front Desk Executive']
  },
  {
    category: 'OTHER',
    roles: ['Other']
  }
];

const APP_ACCESS_ROLES: { role: AppAccessRole; label: string; desc: string }[] = [
  { role: 'Owner / Admin', label: '1. Owner / Admin', desc: 'Full system access' },
  { role: 'Manager', label: '2. Manager', desc: 'Full operational access' },
  { role: 'Service Provider', label: '3. Service Provider', desc: 'Assigned services and own bookings' },
  { role: 'Receptionist / Frontdesk', label: '4. Receptionist / Frontdesk', desc: 'Customer and booking management' },
  { role: 'Limited Staff', label: '5. Limited Staff', desc: 'View only / limited assigned access' },
  { role: 'No App Access', label: '6. No App Access', desc: 'Public staff profile only' }
];

const DEFAULT_SKILL_CATEGORIES = [
  {
    category: 'HAIR',
    skills: ['Hair Coloring', 'Balayage', 'Highlights', 'Hair Cutting', 'Hair Styling', 'Blow Dry', 'Keratin Treatment', 'Hair Spa', 'Hair Extensions', 'Smoothening']
  },
  {
    category: 'BARBER',
    skills: ['Beard Styling', 'Beard Sculpting', 'Skin Fade', 'Shaving', 'Men’s Grooming']
  },
  {
    category: 'BEAUTY',
    skills: ['Bridal Makeup', 'Party Makeup', 'Facial Treatments', 'Skin Care', 'Threading', 'Waxing']
  },
  {
    category: 'NAILS',
    skills: ['Nail Art', 'Gel Nails', 'Nail Extensions', 'Manicure', 'Pedicure']
  },
  {
    category: 'SPA / MASSAGE',
    skills: ['Deep Tissue Massage', 'Swedish Massage', 'Head Massage', 'Foot Massage', 'Aromatherapy', 'Body Spa']
  }
];

export default function StepTeam({ data, setData, onNext, onPrev, onSave, onOpenStaffManagement }: Props) {
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [primaryRole, setPrimaryRole] = useState('Senior Stylist');
  const [customRole, setCustomRole] = useState('');
  const [appAccessRole, setAppAccessRole] = useState<AppAccessRole>('Service Provider');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['Balayage', 'Hair Coloring']);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [imageUrl, setImageUrl] = useState(PRESET_AVATARS[0]);
  const [bioInput, setBioInput] = useState('');
  const [phone, setPhone] = useState('');
  const [hidePhoneFromPublic, setHidePhoneFromPublic] = useState(true);
  const [commission, setCommission] = useState<number | ''>(15);
  const [status, setStatus] = useState<StaffStatus>('Available');
  const [assignedServiceIds, setAssignedServiceIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_WEEKLY_SCHEDULE);

  // Drag and drop state for photo upload
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI loading state
  const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({});
  const [isGeneratingFormBio, setIsGeneratingFormBio] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Holds the current object-URL preview so it can be revoked when it is
  // replaced by the compressed data URL (prevents a blob memory leak).
  const teamPreviewUrlRef = useRef<string | null>(null);

  // Helper to get effective role string
  const getEffectiveRole = (pRole: string, cRole: string) => {
    if (pRole === 'Other') return cRole.trim() || 'Staff Member';
    return pRole;
  };

  // Immediate sync helper to keep team state and preview in sync while typing
  const syncLiveEdit = (override?: Partial<TeamMember>) => {
    if (!editingId) return;
    const finalRole = override?.role ?? getEffectiveRole(primaryRole, customRole);
    const updatedTeam = data.team.map(m => {
      if (m.id !== editingId) return m;
      return {
        ...m,
        name: override?.name ?? name,
        role: finalRole,
        appAccessRole: override?.appAccessRole ?? appAccessRole,
        specialties: override?.specialties ?? selectedSkills,
        imageUrl: override?.imageUrl ?? imageUrl,
        bio: override?.bio ?? bioInput,
        phone: override?.phone ?? phone,
        hidePhoneFromPublic: override?.hidePhoneFromPublic ?? hidePhoneFromPublic,
        commission: typeof override?.commission !== 'undefined' ? override.commission : (commission === '' ? 0 : Number(commission)),
        status: override?.status ?? status,
        assignedServiceIds: override?.assignedServiceIds ?? assignedServiceIds,
        schedule: override?.schedule ?? schedule
      };
    });
    setData({ ...data, team: updatedTeam });
  };

  const handleUpdateImage = (newUrl: string) => {
    setImageUrl(newUrl);
    syncLiveEdit({ imageUrl: newUrl });
  };

  const handleFileUpload = async (file: File) => {
    // Shared upload contract: 5 MB max, JPG / PNG / WEBP / SVG, with a
    // specific, human-readable message instead of a silent no-op.
    const validation = validateImageUploadFile(file);
    if (!validation.ok) {
      setPhotoError(validation.error);
      return;
    }
    setPhotoError(null);

    // INSTANT PREVIEW — the photo renders before compression/reading finishes.
    const previewUrl = createPreviewUrl(file);
    if (previewUrl) {
      handleUpdateImage(previewUrl);
      // Revoked on the next upload so a long editing session cannot leak blobs.
      if (teamPreviewUrlRef.current) revokePreviewUrl(teamPreviewUrlRef.current);
      teamPreviewUrlRef.current = previewUrl;
    }

    setIsUploadingPhoto(true);
    try {
      // Compress to ~50KB and 400px max for avatars
      const compressedFile = await compressImageToMaxFileSize(file, 0.05, 400);
      const dataUrl = await readImageAsDataUrl(compressedFile);
      if (teamPreviewUrlRef.current) {
        revokePreviewUrl(teamPreviewUrlRef.current);
        teamPreviewUrlRef.current = null;
      }
      handleUpdateImage(dataUrl);
    } catch (err) {
      console.error('Image upload/compression failed:', err);
      setPhotoError(describeUploadError(err, 'Could not read that image. Try another image.'));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setPhotoError(null);
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const resetForm = () => {
    setName('');
    setPrimaryRole('Senior Stylist');
    setCustomRole('');
    setAppAccessRole('Service Provider');
    setSelectedSkills(['Balayage', 'Hair Coloring']);
    setCustomSkillInput('');
    setImageUrl(PRESET_AVATARS[0]);
    setBioInput('');
    setPhone('');
    setHidePhoneFromPublic(true);
    setCommission(15);
    setStatus('Available');
    setAssignedServiceIds(data.services.map(s => s.id));
    setSchedule(DEFAULT_WEEKLY_SCHEDULE);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setName(member.name);
    
    // Check if member.role matches standard primary roles
    const allStandardRoles = PRIMARY_ROLE_CATEGORIES.flatMap(c => c.roles);
    if (allStandardRoles.includes(member.role)) {
      setPrimaryRole(member.role);
      setCustomRole('');
    } else {
      setPrimaryRole('Other');
      setCustomRole(member.role);
    }

    setAppAccessRole(member.appAccessRole || 'Service Provider');
    setSelectedSkills(member.specialties || []);
    setImageUrl(member.imageUrl || PRESET_AVATARS[0]);
    setBioInput(member.bio || '');
    setPhone(member.phone || '');
    setHidePhoneFromPublic(typeof member.hidePhoneFromPublic === 'boolean' ? member.hidePhoneFromPublic : true);
    setCommission(typeof member.commission === 'number' ? member.commission : 15);
    setStatus(member.status || 'Available');
    setAssignedServiceIds(member.assignedServiceIds || data.services.map(s => s.id));
    setSchedule(member.schedule || DEFAULT_WEEKLY_SCHEDULE);
    setIsAdding(true);
  };

  const toggleSkill = (skill: string) => {
    const next = selectedSkills.includes(skill)
      ? selectedSkills.filter(s => s !== skill)
      : [...selectedSkills, skill];
    setSelectedSkills(next);
    syncLiveEdit({ specialties: next });
  };

  const addCustomSkill = () => {
    const trimmed = customSkillInput.trim();
    if (trimmed && !selectedSkills.includes(trimmed)) {
      const next = [...selectedSkills, trimmed];
      setSelectedSkills(next);
      setCustomSkillInput('');
      syncLiveEdit({ specialties: next });
    }
  };

  const toggleAssignedService = (serviceId: string) => {
    const next = assignedServiceIds.includes(serviceId)
      ? assignedServiceIds.filter(id => id !== serviceId)
      : [...assignedServiceIds, serviceId];
    setAssignedServiceIds(next);
    syncLiveEdit({ assignedServiceIds: next });
  };

  const handleGenerateFormBio = async () => {
    if (!name.trim()) return;
    setIsGeneratingFormBio(true);
    try {
      const effectiveRole = getEffectiveRole(primaryRole, customRole);
      const res = await authenticatedApiFetch('/api/generate-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role: effectiveRole,
          specialties: selectedSkills,
          salonName: data.salonName
        })
      });
      const result = await res.json();
      if (result.bio) {
        setBioInput(result.bio);
        syncLiveEdit({ bio: result.bio });
      }
    } catch (err) {
      console.error('Failed to generate bio in form:', err);
    } finally {
      setIsGeneratingFormBio(false);
    }
  };

  const handleGenerateBioForMember = async (member: TeamMember) => {
    setGeneratingIds(prev => ({ ...prev, [member.id]: true }));
    try {
      const res = await authenticatedApiFetch('/api/generate-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: member.name,
          role: member.role,
          specialties: member.specialties,
          salonName: data.salonName
        })
      });
      const result = await res.json();
      if (result.bio) {
        const updatedTeam = data.team.map(m =>
          m.id === member.id ? { ...m, bio: result.bio } : m
        );
        const nextData = { ...data, team: updatedTeam };
        setData(nextData);
        if (onSave) onSave(nextData);
      }
    } catch (err) {
      console.error('Failed to generate bio:', err);
    } finally {
      setGeneratingIds(prev => ({ ...prev, [member.id]: false }));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    const effectiveRole = getEffectiveRole(primaryRole, customRole);
    let nextData: SalonData;

    if (editingId) {
      const updatedTeam = data.team.map(member => 
        member.id === editingId
          ? { 
              ...member, 
              name, 
              role: effectiveRole,
              appAccessRole,
              specialties: selectedSkills.length ? selectedSkills : ['Styling'], 
              imageUrl,
              bio: bioInput,
              phone,
              hidePhoneFromPublic,
              commission: commission === '' ? 0 : Number(commission),
              status,
              assignedServiceIds,
              schedule
            }
          : member
      );
      nextData = { ...data, team: updatedTeam };
    } else {
      const newMember: TeamMember = {
        id: 'team-' + Date.now(),
        name,
        role: effectiveRole,
        appAccessRole,
        specialties: selectedSkills.length ? selectedSkills : ['Styling'],
        imageUrl: imageUrl || PRESET_AVATARS[0],
        bio: bioInput,
        phone,
        hidePhoneFromPublic,
        commission: commission === '' ? 0 : Number(commission),
        status,
        assignedServiceIds,
        schedule
      };
      nextData = { ...data, team: [...data.team, newMember] };
    }

    setData(nextData);
    resetForm();
    
    if (onSave) {
      onSave(nextData);
    }
    
    setTimeout(() => setIsSaving(false), 800);
  };

  const handleDelete = (id: string) => {
    const nextData = {
      ...data,
      team: data.team.filter(m => m.id !== id)
    };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  const moveStaff = (index: number, direction: 'up' | 'down') => {
    const newTeam = [...data.team];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTeam.length) return;
    const temp = newTeam[index];
    newTeam[index] = newTeam[targetIndex];
    newTeam[targetIndex] = temp;
    const nextData = { ...data, team: newTeam };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  // Schedule action helpers
  const handleCopyMondayToAll = () => {
    const mondayVal = schedule.monday || { working: true, startTime: '09:00 AM', endTime: '06:00 PM' };
    const days: (keyof WeeklySchedule)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const updated: WeeklySchedule = { ...schedule };
    days.forEach(d => {
      if (updated[d]?.working) {
        updated[d] = { ...mondayVal, working: true };
      }
    });
    setSchedule(updated);
    syncLiveEdit({ schedule: updated });
  };

  const handleMarkWeekdaysWorking = () => {
    const days: (keyof WeeklySchedule)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const updated: WeeklySchedule = { ...schedule };
    days.forEach(d => {
      updated[d] = {
        working: true,
        startTime: updated[d]?.startTime || '09:00 AM',
        endTime: updated[d]?.endTime || '06:00 PM'
      };
    });
    setSchedule(updated);
    syncLiveEdit({ schedule: updated });
  };

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
          <Edit2 className="w-3.5 h-3.5" /> Edit Staff Form
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

      {/* LEFT PANEL: Staff Editing (55% desktop layout) */}
      <div className={`w-full md:w-[55%] h-full flex flex-col relative bg-[#f9f9f9] border-r border-[#eeeeee] ${mobileTab === 'preview' ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-8">
          <div className="max-w-2xl mx-auto pb-32 space-y-6">
            
            <div>
              <span className="text-xs font-semibold tracking-wider text-[#ac0053] uppercase flex items-center gap-1">
                <UserCheck className="w-4 h-4" /> SCREEN 05 — STAFF / TEAM
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c] mt-1 mb-1">Manage Salon Staff</h1>
              <p className="text-[#5f5e5e] text-sm">
                Add professionals, assign roles, define weekly availability, and display them on your public website.
              </p>

              {onOpenStaffManagement && (
                <div className="mt-3 p-3.5 bg-white border border-[#eeeeee] rounded-xl flex items-center justify-between gap-4 shadow-2xs">
                  <div className="text-xs">
                    <span className="font-bold text-[#1a1c1c]">Staff Management Hub</span>
                    <p className="text-gray-500">Configure commissions, app access, schedules, and payroll.</p>
                  </div>
                  <button
                    onClick={onOpenStaffManagement}
                    className="bg-[#ffd9e1]/60 hover:bg-[#ffd9e1] text-[#ac0053] text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                  >
                    Open Hub →
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-[#eeeeee]">
              <h2 className="text-xs font-bold tracking-wider text-[#5f5e5e] uppercase">
                STAFF MEMBERS ({data.team.length})
              </h2>
              {!isAdding && (
                <button 
                  onClick={() => { resetForm(); setIsAdding(true); }}
                  className="bg-[#ac0053] text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-[#ba005b] transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Staff Member
                </button>
              )}
            </div>

            {/* ADD / EDIT STAFF MEMBER FORM */}
            <AnimatePresence>
              {isAdding && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleSubmit}
                  className="bg-white border-2 border-[#ac0053] rounded-2xl p-5 md:p-6 shadow-md space-y-6"
                >
                  <div className="flex justify-between items-center border-b border-[#eeeeee] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ac0053]"></span>
                      <h3 className="font-bold text-gray-900 text-base">
                        {editingId ? 'Edit Staff Member' : 'New Staff Member'}
                      </h3>
                    </div>
                    <button type="button" onClick={resetForm} className="text-gray-400 hover:text-black p-1">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* 1. Staff Photo Section */}
                  <div>
                    <label className="block text-xs font-bold text-[#1a1c1c] mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-[#ac0053]" /> Staff Photo *
                      </span>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => handleUpdateImage('')}
                          className="text-[11px] text-red-600 hover:underline"
                        >
                          Remove Photo
                        </button>
                      )}
                    </label>

                    {/* Drag & Drop Box */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-center gap-4 ${
                        isDragging 
                          ? 'border-[#ac0053] bg-[#ffd9e1]/20 scale-[1.01]' 
                          : 'border-gray-200 hover:border-[#ac0053] bg-[#f9f9f9] hover:bg-white'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (file) {
                            setPhotoError(null);
                            handleFileUpload(file);
                          }
                        }}
                        accept={IMAGE_UPLOAD_ACCEPT_ATTR}
                        className="hidden"
                      />

                      {photoError && (
                        <p
                          role="alert"
                          data-testid="team-photo-error"
                          className="w-full text-[12px] text-[#c0003a]"
                        >
                          {photoError}
                        </p>
                      )}

                      {imageUrl ? (
                        <div className="relative shrink-0">
                          <img 
                            src={imageUrl} 
                            alt="Staff Preview" 
                            className="w-16 h-16 rounded-full object-cover border-2 border-[#ac0053] shadow-xs" 
                          />
                          {isUploadingPhoto && (
                            <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-[#ac0053] animate-spin" />
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 bg-[#ac0053] text-white p-1 rounded-full shadow-xs">
                            <Check className="w-3 h-3" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-[#ffd9e1]/40 text-[#ac0053] flex items-center justify-center shrink-0">
                          {isUploadingPhoto ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                        </div>
                      )}

                      <div className="text-center sm:text-left">
                        <div className="text-xs font-bold text-gray-800 flex items-center justify-center sm:justify-start gap-1.5">
                          {isUploadingPhoto ? (
                            <Loader2 className="w-3.5 h-3.5 text-[#ac0053] animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-[#ac0053]" /> 
                          )}
                          <span>{isUploadingPhoto ? 'Processing Image...' : '[ + Upload Staff Photo ] or drag & drop'}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          High resolution portrait. Updates live preview immediately.
                        </p>
                      </div>
                    </div>

                    {/* Preset Avatars & Custom URL */}
                    <div className="mt-2.5 space-y-1.5">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Or select preset photo:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_AVATARS.map((url, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleUpdateImage(url)}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-105 ${
                              imageUrl === url ? 'border-[#ac0053] ring-2 ring-[#ffd9e1]' : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={url} alt="Preset" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>

                      <input 
                        type="text" 
                        value={imageUrl} 
                        onChange={e => handleUpdateImage(e.target.value)}
                        placeholder="Or enter custom photo URL" 
                        className="w-full px-3 py-1.5 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-xs outline-none focus:border-[#ac0053]"
                      />
                    </div>
                  </div>

                  {/* 2. Full Name & Primary Role */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Full Name *</label>
                      <input 
                        type="text" 
                        required 
                        value={name} 
                        onChange={e => {
                          setName(e.target.value);
                          syncLiveEdit({ name: e.target.value });
                        }}
                        placeholder="e.g. Sarah Jenkins" 
                        className="w-full px-3.5 py-2.5 bg-[#f9f9f9] border border-[#eeeeee] rounded-xl text-xs outline-none focus:border-[#ac0053] font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Primary Role *</label>
                      <select
                        value={primaryRole}
                        onChange={e => {
                          setPrimaryRole(e.target.value);
                          syncLiveEdit({ role: getEffectiveRole(e.target.value, customRole) });
                        }}
                        className="w-full px-3.5 py-2.5 bg-[#f9f9f9] border border-[#eeeeee] rounded-xl text-xs outline-none focus:border-[#ac0053] font-medium text-gray-800"
                      >
                        {PRIMARY_ROLE_CATEGORIES.map(group => (
                          <optgroup key={group.category} label={group.category}>
                            {group.roles.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Custom Role Input if 'Other' selected */}
                  {primaryRole === 'Other' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Custom Role Title *</label>
                      <input 
                        type="text" 
                        required 
                        value={customRole} 
                        onChange={e => {
                          setCustomRole(e.target.value);
                          syncLiveEdit({ role: e.target.value });
                        }}
                        placeholder="e.g. Master Lash Artist & Sculptor" 
                        className="w-full px-3.5 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-xl text-xs outline-none focus:border-[#ac0053]"
                      />
                    </motion.div>
                  )}

                  {/* 3. App Access Role Dropdown (Private internal) */}
                  <div className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#ac0053]" /> App Access Role *
                      </label>
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        Never shown on public website
                      </span>
                    </div>
                    <select
                      value={appAccessRole}
                      onChange={e => {
                        const val = e.target.value as AppAccessRole;
                        setAppAccessRole(val);
                        syncLiveEdit({ appAccessRole: val });
                      }}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#ac0053]"
                    >
                      {APP_ACCESS_ROLES.map(r => (
                        <option key={r.role} value={r.role}>
                          {r.label} — ({r.desc})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Multi-Select Specializations / Skills */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-[#1a1c1c]">
                        Specializations / Skills
                      </label>
                      <span className="text-[11px] text-[#ac0053] font-semibold">Select multiple</span>
                    </div>

                    <div className="space-y-3 bg-[#f9f9f9] border border-[#eeeeee] p-3.5 rounded-xl">
                      {DEFAULT_SKILL_CATEGORIES.map(cat => (
                        <div key={cat.category} className="space-y-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{cat.category}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {cat.skills.map(skill => {
                              const selected = selectedSkills.includes(skill);
                              return (
                                <button
                                  type="button"
                                  key={skill}
                                  onClick={() => toggleSkill(skill)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                                    selected 
                                      ? 'bg-[#ac0053] text-white border-[#ac0053] shadow-xs' 
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#ac0053]'
                                  }`}
                                >
                                  {selected && '✓ '}{skill}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Custom Skill Input */}
                      <div className="pt-2 border-t border-gray-200 flex gap-2">
                        <input 
                          type="text" 
                          value={customSkillInput} 
                          onChange={e => setCustomSkillInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); }}}
                          placeholder="Type custom skill..." 
                          className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-[#ac0053]"
                        />
                        <button
                          type="button"
                          onClick={addCustomSkill}
                          className="bg-[#ffd9e1] hover:bg-[#ffc4d2] text-[#3f001a] font-bold text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                          + Add Custom Skill
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 5. Assign Services */}
                  <div>
                    <label className="block text-xs font-bold text-[#1a1c1c] mb-1.5">
                      Assign Services (from Screen 04)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#f9f9f9] border border-[#eeeeee] p-3 rounded-xl max-h-40 overflow-y-auto">
                      {data.services.map(s => {
                        const checked = assignedServiceIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-xs font-medium text-gray-800 cursor-pointer p-1 hover:bg-white rounded">
                            <input 
                              type="checkbox" 
                              checked={checked} 
                              onChange={() => toggleAssignedService(s.id)}
                              className="accent-[#ac0053] w-4 h-4 rounded"
                            />
                            <span className="truncate">{s.name} (₹{s.price.toLocaleString('en-IN')})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 6. Bio Field with AI Generator */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-[#1a1c1c]">Professional Biography</label>
                      <button
                        type="button"
                        onClick={handleGenerateFormBio}
                        disabled={isGeneratingFormBio || !name.trim()}
                        className="text-xs font-semibold text-[#ac0053] hover:text-[#ba005b] disabled:opacity-40 flex items-center gap-1 bg-[#ffd9e1]/50 px-2.5 py-1 rounded-md transition-colors"
                      >
                        {isGeneratingFormBio ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {isGeneratingFormBio ? 'Writing...' : 'Write Bio with AI'}
                      </button>
                    </div>
                    <textarea 
                      value={bioInput}
                      onChange={e => {
                        setBioInput(e.target.value);
                        syncLiveEdit({ bio: e.target.value });
                      }}
                      placeholder="Crafted high-converting bio highlighting expertise..."
                      rows={3}
                      className="w-full px-3.5 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-xl text-xs outline-none focus:border-[#ac0053] resize-none"
                    />
                  </div>

                  {/* 7. Mobile Number, Commission, Hide Mobile Toggle */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Mobile Number</label>
                      <input 
                        type="text" 
                        value={phone} 
                        onChange={e => {
                          setPhone(e.target.value);
                          syncLiveEdit({ phone: e.target.value });
                        }}
                        placeholder="+91 98765 43210" 
                        className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-xs outline-none focus:border-[#ac0053]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Commission (%)</label>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={commission} 
                        onChange={e => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setCommission(val);
                          syncLiveEdit({ commission: val === '' ? 0 : val });
                        }}
                        placeholder="15" 
                        className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-xs outline-none focus:border-[#ac0053]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Internal Status</label>
                      <select
                        value={status}
                        onChange={e => {
                          const val = e.target.value as StaffStatus;
                          setStatus(val);
                          syncLiveEdit({ status: val });
                        }}
                        className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-xs font-semibold outline-none focus:border-[#ac0053]"
                      >
                        <option value="Available">Available</option>
                        <option value="Busy">Busy</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {/* Hide Mobile Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer bg-[#f9f9f9] border border-[#eeeeee] p-2.5 rounded-lg text-xs font-semibold text-gray-700">
                    <input 
                      type="checkbox" 
                      checked={hidePhoneFromPublic} 
                      onChange={e => {
                        setHidePhoneFromPublic(e.target.checked);
                        syncLiveEdit({ hidePhoneFromPublic: e.target.checked });
                      }}
                      className="accent-[#ac0053] w-4 h-4 rounded"
                    />
                    <span>Hide Mobile Number from Public Website (Default: ON)</span>
                  </label>

                  {/* 8. Weekly Schedule */}
                  <div className="border border-gray-200 rounded-xl p-3.5 bg-[#f9f9f9] space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-gray-200 pb-2">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#ac0053]" /> Weekly Schedule
                      </span>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={handleCopyMondayToAll}
                          className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-semibold px-2.5 py-1 rounded"
                        >
                          Copy Monday to all
                        </button>
                        <button
                          type="button"
                          onClick={handleMarkWeekdaysWorking}
                          className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-semibold px-2.5 py-1 rounded"
                        >
                          Mark weekdays working
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as (keyof WeeklySchedule)[]).map(day => {
                        const daySched = schedule[day] || { working: true, startTime: '09:00 AM', endTime: '06:00 PM' };
                        return (
                          <div key={day} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-gray-100 gap-2">
                            <label className="flex items-center gap-2 w-28 capitalize font-semibold cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={daySched.working}
                                onChange={e => {
                                  const updated: WeeklySchedule = {
                                    ...schedule,
                                    [day]: { ...daySched, working: e.target.checked }
                                  };
                                  setSchedule(updated);
                                  syncLiveEdit({ schedule: updated });
                                }}
                                className="accent-[#ac0053]"
                              />
                              <span>{day}</span>
                            </label>

                            {daySched.working ? (
                              <div className="flex items-center gap-1 font-mono text-[11px] text-gray-600">
                                <input 
                                  type="text" 
                                  value={daySched.startTime}
                                  onChange={e => {
                                    const updated: WeeklySchedule = {
                                      ...schedule,
                                      [day]: { ...daySched, startTime: e.target.value }
                                    };
                                    setSchedule(updated);
                                    syncLiveEdit({ schedule: updated });
                                  }}
                                  className="w-20 px-1.5 py-0.5 border rounded text-center"
                                />
                                <span>to</span>
                                <input 
                                  type="text" 
                                  value={daySched.endTime}
                                  onChange={e => {
                                    const updated: WeeklySchedule = {
                                      ...schedule,
                                      [day]: { ...daySched, endTime: e.target.value }
                                    };
                                    setSchedule(updated);
                                    syncLiveEdit({ schedule: updated });
                                  }}
                                  className="w-20 px-1.5 py-0.5 border rounded text-center"
                                />
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-[11px]">Off Day</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-2 pt-3 border-t border-[#eeeeee]">
                    <button 
                      type="button" 
                      onClick={resetForm} 
                      disabled={isSaving || isUploadingPhoto}
                      className="px-4 py-2 text-xs font-semibold text-[#5f5e5e] hover:bg-gray-100 rounded-xl disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSaving || isUploadingPhoto}
                      className="px-6 py-2.5 text-xs bg-[#ac0053] text-white font-bold rounded-xl hover:bg-[#ba005b] shadow-xs flex items-center justify-center gap-2 min-w-[140px] disabled:bg-gray-400"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        editingId ? 'Update Staff Member' : 'Save Staff Member'
                      )}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* TEAM MEMBERS LIST WITH REORDER, EDIT, DELETE */}
            <div className="space-y-3">
              <AnimatePresence>
                {data.team.map((member, index) => {
                  const isGenerating = !!generatingIds[member.id];
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={member.id}
                      className="bg-white border border-[#eeeeee] rounded-2xl p-4 flex flex-col gap-3 hover:border-[#ac0053]/40 transition-colors shadow-2xs group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Reorder Buttons */}
                        <div className="flex flex-col gap-1 text-gray-400 pt-1">
                          <button 
                            onClick={() => moveStaff(index, 'up')}
                            disabled={index === 0}
                            className="hover:text-[#ac0053] disabled:opacity-20"
                            title="Move Up"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => moveStaff(index, 'down')}
                            disabled={index === data.team.length - 1}
                            className="hover:text-[#ac0053] disabled:opacity-20"
                            title="Move Down"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <img 
                          src={member.imageUrl} 
                          alt={member.name} 
                          className="w-14 h-14 rounded-full object-cover border-2 border-[#ffd9e1] shrink-0" 
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-[#1a1c1c]">{member.name}</h3>
                              {member.status && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  member.status === 'Available' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {member.status}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleStartEdit(member)}
                                className="p-1.5 text-[#5f5e5e] hover:text-[#ac0053] hover:bg-[#ffd9e1]/30 rounded-full transition-colors"
                                title="Edit Staff"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(member.id)}
                                className="p-1.5 text-[#5f5e5e] hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="Delete Staff"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="text-xs font-bold text-[#ac0053] uppercase tracking-wider mb-1.5">
                            {member.role}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {member.specialties.map(spec => (
                              <span key={spec} className="bg-[#ffd9e1]/30 text-[#80003c] border border-[#ffd9e1] px-2 py-0.5 rounded-md text-[11px] font-semibold">
                                {spec}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Bio AI section */}
                      <div className="pt-2 border-t border-[#f3f3f3] flex flex-col gap-2 pl-7">
                        {member.bio ? (
                          <div className="bg-[#f9f9f9] border border-[#eeeeee] p-2.5 rounded-xl flex flex-col gap-1 relative">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#ac0053] flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Bio
                              </span>
                              <button
                                onClick={() => handleGenerateBioForMember(member)}
                                disabled={isGenerating}
                                className="text-[11px] text-[#5f5e5e] hover:text-[#ac0053] font-medium flex items-center gap-1 transition-colors"
                              >
                                {isGenerating ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-[#ac0053]" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                {isGenerating ? 'Writing...' : 'Regenerate'}
                              </button>
                            </div>
                            <p className="text-xs text-[#565755] leading-relaxed italic">
                              "{member.bio}"
                            </p>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-[#5f5e5e] italic">No bio added</span>
                            <button
                              onClick={() => handleGenerateBioForMember(member)}
                              disabled={isGenerating}
                              className="bg-[#ffd9e1] hover:bg-[#ffc4d2] text-[#3f001a] font-semibold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              {isGenerating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ac0053]" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5 text-[#ac0053]" />
                              )}
                              {isGenerating ? 'Writing...' : 'Write Bio'}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {!isAdding && (
                <button 
                  onClick={() => { resetForm(); setIsAdding(true); }}
                  className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed border-gray-300 hover:border-[#ac0053] hover:text-[#ac0053] text-[#5f5e5e] rounded-xl text-xs font-bold transition-colors bg-white mt-4 shadow-2xs"
                >
                  <Plus className="w-4 h-4" /> Add Staff Member
                </button>
              )}
            </div>

            {/* Owner-authored testimonials — part of the unified draft, so they
                persist across refresh, step navigation and publish. */}
            <TestimonialsEditor
              data={data}
              onChange={(next) => setData({ ...data, testimonials: next })}
            />

          </div>
        </div>

        {/* BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-[#eeeeee] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4">
          <div className="max-w-screen-2xl mx-auto flex justify-between items-center px-4 md:px-8">
            <button 
              onClick={onPrev}
              className="text-xs font-bold text-[#5f5e5e] hover:text-[#1a1c1c] transition-colors flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" /> ← Back
            </button>
            <button 
              onClick={onNext}
              className="bg-[#ac0053] hover:bg-[#ba005b] text-white text-xs font-bold flex items-center gap-2 px-8 py-3 rounded-xl transition-all shadow-sm"
            >
              Continue → <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Live Website Preview (45% desktop layout with sticky behavior) */}
      <div className={`w-full md:w-[45%] h-full sticky top-0 ${mobileTab === 'edit' ? 'hidden md:block' : 'block'}`}>
        <PreviewPane data={data} step={4} activeStaffId={editingId || undefined} />
      </div>
    </div>
  );
}
