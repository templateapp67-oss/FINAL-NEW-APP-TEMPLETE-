import { authenticatedApiFetch } from '../lib/apiFetch';
import { useState, useMemo, FormEvent, ChangeEvent } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  UserX, 
  Plus, 
  Search, 
  Filter, 
  LayoutGrid, 
  List, 
  ShieldCheck, 
  Edit3, 
  Trash2, 
  X, 
  Check, 
  Sparkles, 
  Loader2, 
  Calendar, 
  Phone, 
  PhoneOff, 
  DollarSign, 
  Star, 
  Copy, 
  CheckCircle,
  Briefcase,
  Layers,
  ChevronRight,
  Download,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { 
  SalonData, 
  TeamMember, 
  StaffStatus, 
  AppAccessRole, 
  WeeklySchedule, 
  WeeklyScheduleDay, 
  DEFAULT_WEEKLY_SCHEDULE 
} from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { compressImageToMaxFileSize } from '../lib/imageCompression';

interface Props {
  data: SalonData;
  setData: (d: SalonData) => void;
  onSave?: (d?: SalonData) => void;
  onBackToWizard?: () => void;
}

const PRIMARY_ROLE_OPTIONS = [
  'Senior Stylist',
  'Junior Stylist',
  'Hair Dresser',
  'Makeup Artist',
  'Nail Artist',
  'Spa Therapist',
  'Salon Manager',
  'Receptionist',
  'Barber',
  'Senior Barber',
  'Color Specialist',
  'Beauty Expert',
  'Other'
];

const APP_ACCESS_ROLES: AppAccessRole[] = [
  'Manager (Full Access)',
  'Service Provider (Assigned)',
  'Receptionist (Frontdesk)'
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1595959183082-7b570b7e08e2?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
];

const SUGGESTED_SKILLS = [
  'Hair Coloring',
  'Balayage',
  'Bridal Makeup',
  'Facial Treatments',
  'Nail Art',
  'Hair Extensions',
  'Threading & Waxing',
  'Deep Tissue Massage',
  'Beard Sculpting',
  'Keratin Treatment'
];

const DAYS_OF_WEEK: (keyof WeeklySchedule)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

export default function StaffManagementModule({ data, setData, onSave, onBackToWizard }: Props) {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'directory' | 'payroll'>('directory');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | StaffStatus>('All');

  // Modals & Drawers
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [viewingScheduleMember, setViewingScheduleMember] = useState<TeamMember | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  // Form State
  const [formPhoto, setFormPhoto] = useState(PRESET_AVATARS[0]);
  const [formName, setFormName] = useState('');
  const [formPrimaryRole, setFormPrimaryRole] = useState(PRIMARY_ROLE_OPTIONS[0]);
  const [customPrimaryRole, setCustomPrimaryRole] = useState('');
  const [formAppAccessRole, setFormAppAccessRole] = useState<AppAccessRole>('Service Provider (Assigned)');
  const [formPhone, setFormPhone] = useState('');
  const [formCommission, setFormCommission] = useState<number>(15);
  const [formStatus, setFormStatus] = useState<StaffStatus>('Available');
  const [formAssignedServices, setFormAssignedServices] = useState<string[]>([]);
  const [formHidePhone, setFormHidePhone] = useState(true);
  const [formSchedule, setFormSchedule] = useState<WeeklySchedule>(DEFAULT_WEEKLY_SCHEDULE);
  const [formSkills, setFormSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [formBio, setFormBio] = useState('');
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form Errors
  const [formErrors, setFormErrors] = useState<{ name?: string; role?: string }>({});
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Summary Counts
  const stats = useMemo(() => {
    const total = data.team.length;
    const available = data.team.filter(m => (m.status || 'Available') === 'Available').length;
    const busy = data.team.filter(m => m.status === 'Busy').length;
    const onLeave = data.team.filter(m => m.status === 'On Leave').length;
    return { total, available, busy, onLeave };
  }, [data.team]);

  // Filtered Staff
  const filteredStaff = useMemo(() => {
    return data.team.filter(member => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        member.name.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q) ||
        (member.phone && member.phone.toLowerCase().includes(q)) ||
        member.specialties.some(s => s.toLowerCase().includes(q));

      const memberStatus = member.status || 'Available';
      const matchesStatus = statusFilter === 'All' || memberStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [data.team, searchQuery, statusFilter]);

  // Open Form for Adding
  const handleOpenAddForm = () => {
    setEditingMemberId(null);
    setFormPhoto(PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)]);
    setFormName('');
    setFormPrimaryRole('Senior Stylist');
    setCustomPrimaryRole('');
    setFormAppAccessRole('Service Provider (Assigned)');
    setFormPhone('');
    setFormCommission(15);
    setFormStatus('Available');
    setFormAssignedServices(data.services.map(s => s.id));
    setFormHidePhone(true);
    setFormSchedule(JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)));
    setFormSkills(['Hair Styling', 'Balayage']);
    setFormBio('');
    setFormErrors({});
    setPhotoError(null);
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEditForm = (member: TeamMember) => {
    setEditingMemberId(member.id);
    setFormPhoto(member.imageUrl || PRESET_AVATARS[0]);
    setFormName(member.name);
    
    if (PRIMARY_ROLE_OPTIONS.includes(member.role)) {
      setFormPrimaryRole(member.role);
      setCustomPrimaryRole('');
    } else {
      setFormPrimaryRole('Other');
      setCustomPrimaryRole(member.role);
    }

    setFormAppAccessRole(member.appAccessRole || 'Service Provider (Assigned)');
    setFormPhone(member.phone || '');
    setFormCommission(member.commission ?? 15);
    setFormStatus(member.status || 'Available');
    setFormAssignedServices(member.assignedServiceIds || data.services.map(s => s.id));
    setFormHidePhone(member.hidePhoneFromPublic ?? true);
    setFormSchedule(member.schedule ? JSON.parse(JSON.stringify(member.schedule)) : JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)));
    setFormSkills(member.specialties || []);
    setFormBio(member.bio || '');
    setFormErrors({});
    setPhotoError(null);
    setIsFormOpen(true);
  };

  const handlePhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Pre-check size to avoid obvious huge files if necessary, 
    // but the compression tool handles it anyway.
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('Image must be less than 10MB');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      // Compress to ~50KB and 400px max for avatars to save localStorage space
      const compressedFile = await compressImageToMaxFileSize(file, 0.05, 400);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          setFormPhoto(event.target.result);
        }
        setIsUploadingPhoto(false);
      };
      reader.onerror = () => {
        setPhotoError('Failed to read image file');
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error('Image compression failed:', err);
      setPhotoError('Failed to process image');
      setIsUploadingPhoto(false);
    }
  };

  // Copy Monday to all working days
  const handleCopyMondayToAll = () => {
    const mondayConfig = formSchedule.monday;
    setFormSchedule(prev => {
      const next = { ...prev };
      DAYS_OF_WEEK.forEach(day => {
        if (next[day].working) {
          next[day] = {
            working: true,
            startTime: mondayConfig.startTime,
            endTime: mondayConfig.endTime
          };
        }
      });
      return next;
    });
  };

  // Generate AI Bio in modal
  const handleGenerateModalBio = async () => {
    if (!formName.trim()) {
      setFormErrors(e => ({ ...e, name: 'Name is required to write a bio' }));
      return;
    }
    setIsGeneratingBio(true);
    try {
      const roleToUse = formPrimaryRole === 'Other' ? customPrimaryRole : formPrimaryRole;
      const res = await authenticatedApiFetch('/api/generate-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          role: roleToUse,
          specialties: formSkills,
          salonName: data.salonName
        })
      });
      const result = await res.json();
      if (result.bio) {
        setFormBio(result.bio);
      }
    } catch (err) {
      console.error('Bio generation failed:', err);
    } finally {
      setIsGeneratingBio(false);
    }
  };

  // Add / Remove Skill
  const handleToggleSkill = (skill: string) => {
    setFormSkills(prev => 
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const handleAddCustomSkill = () => {
    const trimmed = customSkillInput.trim();
    if (trimmed && !formSkills.includes(trimmed)) {
      setFormSkills(prev => [...prev, trimmed]);
      setCustomSkillInput('');
    }
  };

  // Toggle assigned service
  const handleToggleService = (serviceId: string) => {
    setFormAssignedServices(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    );
  };

  // Submit Form
  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    const errors: { name?: string; role?: string } = {};

    if (!formName.trim()) {
      errors.name = 'Full Name is required';
    }

    const finalRole = formPrimaryRole === 'Other' ? customPrimaryRole.trim() : formPrimaryRole;
    if (!finalRole) {
      errors.role = 'Primary Role is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    const newOrUpdatedMember: TeamMember = {
      id: editingMemberId || 'staff-' + Date.now(),
      name: formName.trim(),
      role: finalRole,
      appAccessRole: formAppAccessRole,
      phone: formPhone.trim(),
      commission: Number(formCommission) || 0,
      status: formStatus,
      assignedServiceIds: formAssignedServices,
      hidePhoneFromPublic: formHidePhone,
      schedule: formSchedule,
      specialties: formSkills.length ? formSkills : ['Hair Care'],
      imageUrl: formPhoto,
      bio: formBio.trim(),
      rating: editingMemberId 
        ? (data.team.find(m => m.id === editingMemberId)?.rating || 4.9) 
        : 5.0
    };

    let nextData: SalonData;
    if (editingMemberId) {
      const updated = data.team.map(m => m.id === editingMemberId ? newOrUpdatedMember : m);
      nextData = { ...data, team: updated };
    } else {
      nextData = { ...data, team: [...data.team, newOrUpdatedMember] };
    }

    // Force immediate global state sync and persistence call
    setData(nextData);
    setIsFormOpen(false);
    
    if (onSave) {
      onSave(nextData);
    }
    
    // Reset saving state after a delay to match toast
    setTimeout(() => setIsSaving(false), 800);
  };

  // Delete Staff Member
  const handleDeleteMember = (id: string) => {
    if (confirm('Are you sure you want to remove this staff member?')) {
      const updated = data.team.filter(m => m.id !== id);
      const nextData = { ...data, team: updated };
      setData(nextData);
      if (onSave) onSave(nextData);
    }
  };

  // Quick Status Switch
  const handleQuickStatusChange = (id: string, newStatus: StaffStatus) => {
    const updated = data.team.map(m => m.id === id ? { ...m, status: newStatus } : m);
    const nextData = { ...data, team: updated };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  // Update Commission directly in Payroll table
  const handleUpdateCommission = (id: string, newComm: number) => {
    const updated = data.team.map(m => m.id === id ? { ...m, commission: newComm } : m);
    const nextData = { ...data, team: updated };
    setData(nextData);
    if (onSave) onSave(nextData);
  };

  return (
    <div className="w-full h-full bg-[#f8f9fa] flex flex-col overflow-y-auto custom-scrollbar font-sans text-gray-900 pb-20">
      
      {/* HEADER BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-6 md:px-10 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ac0053] bg-[#ffd9e1]/50 px-2.5 py-1 rounded-md">
                MODULE
              </span>
              {onBackToWizard && (
                <button 
                  onClick={onBackToWizard} 
                  className="text-xs font-medium text-gray-500 hover:text-black transition-colors flex items-center gap-1"
                >
                  ← Back to Website Setup
                </button>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mt-1">Staff Management</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Manage team members, working availability, roles and commissions.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsRoleModalOpen(true)}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs md:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-2xs"
            >
              <ShieldCheck className="w-4 h-4 text-[#ac0053]" /> Role Permissions
            </button>
            <button
              onClick={handleOpenAddForm}
              className="bg-[#ac0053] hover:bg-[#ba005b] text-white text-xs md:text-sm font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Staff Member
            </button>
          </div>

        </div>

        {/* MODULE TABS */}
        <div className="max-w-7xl mx-auto flex gap-6 mt-6 border-b border-gray-100 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('directory')}
            className={`pb-3 relative transition-colors ${
              activeTab === 'directory' ? 'text-[#ac0053]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Staff Directory & Schedule
            {activeTab === 'directory' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ac0053] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={`pb-3 relative transition-colors ${
              activeTab === 'payroll' ? 'text-[#ac0053]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Payroll & Commissions
            {activeTab === 'payroll' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ac0053] rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* CONTENT WRAPPER */}
      <div className="max-w-7xl mx-auto w-full px-6 md:px-10 pt-6 space-y-6">

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Staff</span>
              <div className="text-2xl font-black text-gray-900">{stats.total}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Available Now</span>
              <div className="text-2xl font-black text-emerald-600">{stats.available}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Busy</span>
              <div className="text-2xl font-black text-amber-600">{stats.busy}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <UserX className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On Leave</span>
              <div className="text-2xl font-black text-purple-600">{stats.onLeave}</div>
            </div>
          </div>
        </div>

        {/* TAB 1: DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="space-y-6">
            
            {/* SEARCH & FILTER BAR */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-2xs">
              
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search staff by name, role, skill, phone..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#ac0053] focus:bg-white transition-all"
                />
              </div>

              {/* Status Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                {(['All', 'Available', 'Busy', 'On Leave', 'Inactive'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === status
                        ? 'bg-[#ac0053] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              {/* View Switcher (Desktop) */}
              <div className="hidden md:flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    viewMode === 'table' ? 'bg-white text-[#ac0053] shadow-2xs' : 'text-gray-500 hover:text-black'
                  }`}
                  title="Table View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    viewMode === 'grid' ? 'bg-white text-[#ac0053] shadow-2xs' : 'text-gray-500 hover:text-black'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* STAFF TABLE (DESKTOP) / CARDS (MOBILE OR GRID MODE) */}
            {filteredStaff.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
                <Users className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <h3 className="text-base font-bold text-gray-800">No staff members found</h3>
                <p className="text-xs text-gray-400 mt-1">Try clearing filters or search terms.</p>
              </div>
            ) : viewMode === 'table' ? (
              
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        <th className="py-3.5 px-6">Staff Member</th>
                        <th className="py-3.5 px-6">Role & Specialization</th>
                        <th className="py-3.5 px-6">Rating</th>
                        <th className="py-3.5 px-6">Commission</th>
                        <th className="py-3.5 px-6">Status</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredStaff.map(member => {
                        const status = member.status || 'Available';
                        return (
                          <tr key={member.id} className="hover:bg-gray-50/80 transition-colors group">
                            
                            {/* Member Info */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3.5">
                                <img
                                  src={member.imageUrl}
                                  alt={member.name}
                                  className="w-11 h-11 rounded-full object-cover border border-gray-200 shrink-0"
                                />
                                <div>
                                  <div className="font-bold text-gray-900 group-hover:text-[#ac0053] transition-colors">
                                    {member.name}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-semibold text-gray-600">
                                      {member.appAccessRole || 'Service Provider (Assigned)'}
                                    </span>
                                    {member.phone && !member.hidePhoneFromPublic && (
                                      <span className="flex items-center gap-1 text-gray-400">
                                        <Phone className="w-3 h-3" /> {member.phone}
                                      </span>
                                    )}
                                    {member.hidePhoneFromPublic && (
                                      <span className="flex items-center gap-1 text-gray-400" title="Private Mobile">
                                        <PhoneOff className="w-3 h-3 text-amber-500" /> Private
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role & Specialization */}
                            <td className="py-4 px-6">
                              <div className="font-semibold text-gray-900">{member.role}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {member.specialties.map(spec => (
                                  <span key={spec} className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-md">
                                    {spec}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Rating */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-1 font-bold text-gray-900">
                                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                {member.rating ? member.rating.toFixed(1) : '5.0'}
                              </div>
                            </td>

                            {/* Commission */}
                            <td className="py-4 px-6">
                              <span className="font-bold text-gray-900 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs">
                                {member.commission ?? 15}%
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-4 px-6">
                              <select
                                value={status}
                                onChange={e => handleQuickStatusChange(member.id, e.target.value as StaffStatus)}
                                className={`text-xs font-bold px-3 py-1.5 rounded-xl border outline-none cursor-pointer ${
                                  status === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  status === 'Busy' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  status === 'On Leave' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                  'bg-gray-100 text-gray-600 border-gray-200'
                                }`}
                              >
                                <option value="Available">🟢 Available</option>
                                <option value="Busy">🟠 Busy</option>
                                <option value="On Leave">🟣 On Leave</option>
                                <option value="Inactive">⚪ Inactive</option>
                              </select>
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setViewingScheduleMember(member)}
                                  className="p-2 text-gray-400 hover:text-[#ac0053] hover:bg-gray-100 rounded-lg transition-colors"
                                  title="View Schedule"
                                >
                                  <Calendar className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenEditForm(member)}
                                  className="p-2 text-gray-400 hover:text-[#ac0053] hover:bg-gray-100 rounded-lg transition-colors"
                                  title="Edit Staff Member"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMember(member.id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Staff Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            ) : null}

            {/* GRID VIEW (AND ALWAYS ON MOBILE) */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 ${viewMode === 'table' ? 'md:hidden' : 'grid'}`}>
              {filteredStaff.map(member => {
                const status = member.status || 'Available';
                return (
                  <div key={member.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs hover:border-[#ac0053]/40 transition-all flex flex-col justify-between space-y-4">
                    
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img src={member.imageUrl} alt={member.name} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                          <div>
                            <h3 className="font-bold text-gray-900 text-base">{member.name}</h3>
                            <div className="text-xs font-semibold text-gray-500">{member.role}</div>
                          </div>
                        </div>

                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          status === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          status === 'Busy' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          status === 'On Leave' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {status}
                        </span>
                      </div>

                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center text-gray-600">
                          <span className="font-semibold text-gray-400">App Access:</span>
                          <span className="font-bold text-gray-800">{member.appAccessRole || 'Service Provider'}</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-600">
                          <span className="font-semibold text-gray-400">Commission Rate:</span>
                          <span className="font-bold text-emerald-600">{member.commission ?? 15}%</span>
                        </div>
                        {member.phone && (
                          <div className="flex justify-between items-center text-gray-600">
                            <span className="font-semibold text-gray-400">Mobile Phone:</span>
                            <span className="font-medium text-gray-800">
                              {member.hidePhoneFromPublic ? '🔒 Private' : member.phone}
                            </span>
                          </div>
                        )}
                      </div>

                      {member.bio && (
                        <p className="text-xs text-gray-600 italic line-clamp-2 leading-relaxed">
                          "{member.bio}"
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1">
                        {member.specialties.map(spec => (
                          <span key={spec} className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-md">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs font-bold text-gray-900">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {member.rating ? member.rating.toFixed(1) : '5.0'}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingScheduleMember(member)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Calendar className="w-3.5 h-3.5" /> Schedule
                        </button>
                        <button
                          onClick={() => handleOpenEditForm(member)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-[#ffd9e1]/50 text-[#ac0053] hover:bg-[#ffd9e1] rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteMember(member.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* TAB 2: PAYROLL & COMMISSIONS */}
        {activeTab === 'payroll' && (
          <div className="space-y-6">
            
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs space-y-6">
              
              <div>
                <h2 className="text-lg font-bold text-gray-900">Payroll & Commission Summary</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  View estimated service payouts based on assigned service completed bookings and commission rates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase">Est. Monthly Revenue</span>
                  <div className="text-xl font-black text-gray-900 mt-1">₹1,42,500.00</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <span className="text-xs font-semibold text-emerald-600 uppercase">Total Commissions Earned</span>
                  <div className="text-xl font-black text-emerald-700 mt-1">₹25,650.00</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <span className="text-xs font-semibold text-purple-600 uppercase">Avg Commission Rate</span>
                  <div className="text-xl font-black text-purple-700 mt-1">17.6%</div>
                </div>
              </div>

              {/* Payroll Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="py-3 px-5">Staff Member</th>
                      <th className="py-3 px-5">Primary Role</th>
                      <th className="py-3 px-5">App Role</th>
                      <th className="py-3 px-5">Commission Rate %</th>
                      <th className="py-3 px-5">Est. Revenue</th>
                      <th className="py-3 px-5">Earned Payout</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {data.team.map((member, idx) => {
                      const comm = member.commission ?? 15;
                      const mockRev = (idx + 1) * 3200 + 1500;
                      const mockPayout = (mockRev * comm) / 100;

                      return (
                        <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <img src={member.imageUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                              <span className="font-bold text-gray-900">{member.name}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5 text-gray-700 font-medium">{member.role}</td>
                          <td className="py-4 px-5 text-xs text-gray-500">{member.appAccessRole || 'Service Provider'}</td>
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                value={comm}
                                onChange={e => handleUpdateCommission(member.id, Number(e.target.value))}
                                className="w-16 px-2 py-1 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-emerald-700 text-center outline-none focus:border-[#ac0053]"
                                min={0}
                                max={100}
                              />
                              <span className="text-xs text-gray-400 font-semibold">%</span>
                            </div>
                          </td>
                          <td className="py-4 px-5 font-bold text-gray-900">₹{(mockRev * 10).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-5 font-bold text-emerald-600">₹{(mockPayout * 10).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-5 text-right">
                            <button className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                              Process Payout
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ADD / EDIT STAFF MEMBER DRAWER / MODAL */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-hidden"
            >
              
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingMemberId ? 'Update Staff Member' : 'Add New Staff Member'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure staff details, access roles, assigned services, and availability.
                  </p>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <form id="staff-form" onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                
                {/* 1. Staff Photo */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Staff Photo
                  </label>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="relative">
                      <img src={formPhoto} alt="Selected" className="w-16 h-16 rounded-full object-cover border-2 border-[#ac0053] shrink-0" />
                      {isUploadingPhoto && (
                        <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-[#ac0053] animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1.5">Select Preset Avatar or Upload Photo</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESET_AVATARS.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={isUploadingPhoto}
                            onClick={() => {
                              setFormPhoto(url);
                              setPhotoError(null);
                            }}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-110 ${
                              formPhoto === url ? 'border-[#ac0053] ring-2 ring-[#ffd9e1]' : 'border-transparent opacity-60'
                            }`}
                          >
                            <img src={url} alt="Preset" className="w-full h-full object-cover" />
                          </button>
                        ))}

                        {/* File Upload Option */}
                        <label className={`cursor-pointer bg-white hover:bg-gray-50 border border-gray-200 hover:border-[#ac0053] text-gray-700 hover:text-[#ac0053] text-xs font-bold h-9 px-3 rounded-xl transition-all flex items-center gap-1.5 ${isUploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploadingPhoto ? 'Processing...' : 'Upload Photo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isUploadingPhoto}
                            onChange={handlePhotoFileChange}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  {photoError && <p className="text-xs text-red-500 mb-2 font-medium">{photoError}</p>}
                  <input
                    type="text"
                    value={formPhoto}
                    onChange={e => {
                      setFormPhoto(e.target.value);
                      setPhotoError(null);
                    }}
                    placeholder="Or enter custom image URL"
                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053]"
                  />
                </div>

                {/* 2. Full Name & 3. Primary Role */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm outline-none focus:border-[#ac0053] ${
                        formErrors.name ? 'border-red-500 bg-red-50/50' : 'border-gray-200'
                      }`}
                    />
                    {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Primary Role *
                    </label>
                    <select
                      value={formPrimaryRole}
                      onChange={e => setFormPrimaryRole(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#ac0053] cursor-pointer"
                    >
                      {PRIMARY_ROLE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {formPrimaryRole === 'Other' && (
                      <input
                        type="text"
                        value={customPrimaryRole}
                        onChange={e => setCustomPrimaryRole(e.target.value)}
                        placeholder="Enter custom role title"
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] mt-2"
                      />
                    )}
                  </div>
                </div>

                {/* 4. App Access Role */}
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                      App Access Role *
                    </label>
                    <span className="text-[11px] font-semibold text-[#ac0053]">Software Permissions</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Primary Role defines their professional title on your website. App Access Role defines their software permissions in Nexora.
                  </p>
                  <select
                    value={formAppAccessRole}
                    onChange={e => setFormAppAccessRole(e.target.value as AppAccessRole)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 outline-none focus:border-[#ac0053] cursor-pointer"
                  >
                    {APP_ACCESS_ROLES.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Mobile Number & 6. Commission & 7. Status */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#ac0053]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Commission %
                    </label>
                    <input
                      type="number"
                      value={formCommission}
                      onChange={e => setFormCommission(Number(e.target.value))}
                      placeholder="15"
                      min={0}
                      max={100}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-emerald-700 outline-none focus:border-[#ac0053]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Current Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as StaffStatus)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-[#ac0053] cursor-pointer"
                    >
                      <option value="Available">Available</option>
                      <option value="Busy">Busy</option>
                      <option value="On Leave">On Leave</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Hide Phone Setting Toggle */}
                <div className="bg-white border border-gray-200 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-gray-900">Hide Mobile Number from Public/Staff List</div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      When enabled, phone contact is kept private and hidden from customer booking views.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormHidePhone(!formHidePhone)}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                      formHidePhone ? 'bg-[#ac0053]' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform absolute top-0.5 ${
                      formHidePhone ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Assign Services */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Assigned Services
                  </label>
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                    {data.services.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No services created yet in Services module.</p>
                    ) : (
                      data.services.map(svc => {
                        const isAssigned = formAssignedServices.includes(svc.id);
                        return (
                          <div
                            key={svc.id}
                            onClick={() => handleToggleService(svc.id)}
                            className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                              isAssigned 
                                ? 'bg-[#ffd9e1]/40 border-[#ac0053] text-[#ac0053]' 
                                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span>{svc.name} <span className="text-gray-400 font-normal">({svc.category})</span></span>
                            {isAssigned && <Check className="w-4 h-4 text-[#ac0053]" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* AI Biography */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Professional Biography
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateModalBio}
                      disabled={isGeneratingBio || !formName.trim()}
                      className="text-xs font-semibold text-[#ac0053] hover:text-[#ba005b] disabled:opacity-40 flex items-center gap-1 bg-[#ffd9e1]/50 px-2.5 py-1 rounded-md transition-colors"
                    >
                      {isGeneratingBio ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {isGeneratingBio ? 'Writing...' : 'Write Bio with AI'}
                    </button>
                  </div>
                  <textarea
                    value={formBio}
                    onChange={e => setFormBio(e.target.value)}
                    placeholder="Short bio for customer booking profiles..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#ac0053] resize-none"
                  />
                </div>

                {/* Specializations / Skills */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Specializations & Skills
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {SUGGESTED_SKILLS.map(skill => {
                      const isSelected = formSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => handleToggleSkill(skill)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            isSelected
                              ? 'bg-[#ac0053] text-white border-[#ac0053]'
                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{skill}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSkillInput}
                      onChange={e => setCustomSkillInput(e.target.value)}
                      placeholder="Add custom skill..."
                      className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#ac0053]"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomSkill();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSkill}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Weekly Schedule */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Weekly Schedule & Hours
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyMondayToAll}
                      className="text-xs font-semibold text-[#ac0053] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy Monday to all working days
                    </button>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                    {DAYS_OF_WEEK.map(day => {
                      const scheduleDay = formSchedule[day];
                      return (
                        <div key={day} className="flex items-center justify-between gap-4 pb-2 border-b border-gray-200 last:border-none last:pb-0">
                          <div className="flex items-center gap-2.5 min-w-[110px]">
                            <input
                              type="checkbox"
                              checked={scheduleDay.working}
                              onChange={e => {
                                const checked = e.target.checked;
                                setFormSchedule(prev => ({
                                  ...prev,
                                  [day]: { ...prev[day], working: checked }
                                }));
                              }}
                              className="w-4 h-4 rounded text-[#ac0053] focus:ring-[#ac0053]"
                            />
                            <span className="text-xs font-bold text-gray-800 capitalize">{day}</span>
                          </div>

                          {scheduleDay.working ? (
                            <div className="flex items-center gap-2 text-xs">
                              <input
                                type="text"
                                value={scheduleDay.startTime}
                                onChange={e => {
                                  const val = e.target.value;
                                  setFormSchedule(prev => ({
                                    ...prev,
                                    [day]: { ...prev[day], startTime: val }
                                  }));
                                }}
                                placeholder="09:00 AM"
                                className="w-24 px-2 py-1 bg-white border border-gray-200 rounded text-center font-semibold text-gray-800"
                              />
                              <span className="text-gray-400">to</span>
                              <input
                                type="text"
                                value={scheduleDay.endTime}
                                onChange={e => {
                                  const val = e.target.value;
                                  setFormSchedule(prev => ({
                                    ...prev,
                                    [day]: { ...prev[day], endTime: val }
                                  }));
                                }}
                                placeholder="06:00 PM"
                                className="w-24 px-2 py-1 bg-white border border-gray-200 rounded text-center font-semibold text-gray-800"
                              />
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400 italic">Off Day</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </form>

              {/* Modal Footer Actions */}
              <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving || isUploadingPhoto}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="staff-form"
                  disabled={isSaving || isUploadingPhoto}
                  className="px-6 py-2.5 text-sm font-semibold bg-[#ac0053] text-white hover:bg-[#ba005b] rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 min-w-[140px] disabled:bg-gray-400"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingMemberId ? 'Update Staff Member' : 'Add Staff Member'
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ROLE PERMISSIONS MODAL */}
      <AnimatePresence>
        {isRoleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-[#ac0053]" />
                  <h2 className="text-xl font-bold text-gray-900">App Access Role Permissions</h2>
                </div>
                <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                
                <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-2xl">
                  <h3 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Manager (Full Access)
                  </h3>
                  <p className="text-xs text-emerald-700 mt-1">
                    Complete administrative privilege. Can view/edit salon settings, manage all staff payroll, service catalog, reports, and customer records.
                  </p>
                </div>

                <div className="bg-blue-50/50 border border-blue-200 p-4 rounded-2xl">
                  <h3 className="font-bold text-blue-900 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" /> Service Provider (Assigned)
                  </h3>
                  <p className="text-xs text-blue-700 mt-1">
                    Restricted provider access. Can manage personal schedule, view assigned client bookings, update service notes, and track earned commission.
                  </p>
                </div>

                <div className="bg-purple-50/50 border border-purple-200 p-4 rounded-2xl">
                  <h3 className="font-bold text-purple-900 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600" /> Receptionist (Frontdesk)
                  </h3>
                  <p className="text-xs text-purple-700 mt-1">
                    Front-desk access. Can manage full appointment calendar, check-in clients, process checkout & invoices, but cannot edit staff payroll or salon settings.
                  </p>
                </div>

              </div>

              <div className="pt-2 text-right">
                <button
                  onClick={() => setIsRoleModalOpen(false)}
                  className="bg-[#ac0053] text-white text-xs font-semibold px-6 py-2.5 rounded-xl hover:bg-[#ba005b]"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VIEW MEMBER SCHEDULE MODAL */}
      <AnimatePresence>
        {viewingScheduleMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <img src={viewingScheduleMember.imageUrl} alt={viewingScheduleMember.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{viewingScheduleMember.name}</h3>
                    <p className="text-xs text-gray-500">{viewingScheduleMember.role} • Schedule</p>
                  </div>
                </div>
                <button onClick={() => setViewingScheduleMember(null)} className="text-gray-400 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 bg-gray-50 border border-gray-100 p-4 rounded-2xl text-xs">
                {DAYS_OF_WEEK.map(day => {
                  const schedule = viewingScheduleMember.schedule || DEFAULT_WEEKLY_SCHEDULE;
                  const dayData = schedule[day];
                  return (
                    <div key={day} className="flex justify-between items-center py-1.5 border-b border-gray-200/60 last:border-none">
                      <span className="font-bold text-gray-700 capitalize">{day}</span>
                      {dayData.working ? (
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded">
                          {dayData.startTime} - {dayData.endTime}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 text-right">
                <button
                  onClick={() => setViewingScheduleMember(null)}
                  className="bg-gray-100 text-gray-800 text-xs font-semibold px-5 py-2 rounded-xl hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
