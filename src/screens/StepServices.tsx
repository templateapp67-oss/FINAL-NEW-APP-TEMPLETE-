import { Sparkles, Mic, ArrowLeft, ArrowRight, Plus, Check, Copy, Trash2, GripVertical, Info, Volume2, X, Search, ChevronDown, List, Pencil, Power } from 'lucide-react';
import CommerceManager from '../components/CommerceManager';
import ServiceDiscoveryBar from '../components/ServiceDiscoveryBar';
import ServiceMediaEditor from '../components/ServiceMediaEditor';
import { ServiceAuditLog, ServiceDeleteGuard } from '../components/ServiceSafetyPanel';
import { SalonData, Service, Package } from '../types';
import PreviewPane from '../components/PreviewPane';
import { motion, AnimatePresence } from 'motion/react';
import { useState, FormEvent, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  THEME_LABELS,
  getThemeCategories as getStaticThemeCategories,
  getSuggestedServices as getStaticSuggestedServices,
  getServicesForThemeCategory as getStaticServicesForThemeCategory,
  findPredefinedService as findStaticPredefinedService,
  AI_SUGGESTION_NAMES,
  VOICE_SERVICE_BY_THEME,
  normalizeThemeId,
  type PredefinedService,
} from '../lib/themeServices';
import {
  isDatabaseCatalogTheme,
  loadThemeServiceCatalog,
  type ThemeServiceCatalog,
} from '../lib/themeCatalogService';
import {
  createSavedService,
  deleteSavedService,
  loadSavedServicesForTheme,
  savePredefinedServices,
  savedServiceToSalonService,
  setSavedServiceStatus,
  updateSavedService,
  type SavedServiceStatus,
} from '../lib/savedServiceService';
import {
  loadThemeCommerce,
  mergeCommerceIntoServices,
} from '../lib/pricingPromotionService';
import {
  DEFAULT_LOCALE,
  localizedName,
  persistLocale,
  readStoredLocale,
  type AppLocale,
} from '../lib/locale';
import {
  DEFAULT_DISCOVERY,
  filterAndSortServices,
  type ServiceDiscoveryQuery,
} from '../lib/serviceSearch';
import {
  deleteSavedServiceMedia,
  upsertSavedServiceMedia,
  upsertSavedServiceTranslation,
  type ServiceMediaKind,
} from '../lib/serviceContentService';
import {
  clearServiceFormDraft,
  clearServiceFormDraftIfMatches,
  isBrowserOffline,
  isStaleConnectivityState,
  networkErrorMessage,
  persistServiceFormDraft,
  readServiceFormDraft,
} from '../lib/offlineSync';
import { useAutoSaveService } from '../hooks/useAutoSaveService';

// Generates a professional, customer-friendly, category-specific service description.
// Kept offline (rule-based) so it works without any API key, consistent with the app's
// convention that all AI/copy features keep their offline fallbacks. Used for custom
// (non-predefined) services where we don't already have a curated description.
function suggestServiceDescription(category: string, serviceName: string): string {
  const name = serviceName.trim();
  const withName = (base: string) => (name ? `${name} — ${base}` : base);

  switch (category) {
    case 'Haircut':
      return withName('Precision cut tailored to your face shape and hair type for a fresh, polished look.');
    case 'Styling':
      return withName('Professional blow-dry, setting and styling with long-lasting hold for a flawless finish.');
    case 'Color':
      return withName('Vibrant, long-lasting color with even application for rich, healthy-looking shine.');
    case 'Treatment':
      return withName('Deep-nourishing treatment that repairs, hydrates and restores your hair and scalp.');
    case 'Barbering':
      return withName('Precision men’s grooming with clean lines and a sharp, confident finish.');
    case 'Makeup & Beauty':
      return withName('Professional beauty service delivered by our experienced artists.');
    case 'Beard & Shave':
      return withName('Precision beard and shave work for a clean, confident finish.');
    case 'Grooming':
      return withName('Complete men’s grooming for a sharp, well-kept look.');
    case 'Massage':
      return withName('Therapeutic massage to release tension and restore balance.');
    case 'Facials':
      return withName('Reviving facial treatment for healthy, glowing skin.');
    case 'Nails':
      return withName('Expert nail care and finishing for hands and feet.');
    case 'Hair Removal':
      return withName('Hygienic, comfortable hair removal with soothing aftercare.');
    case 'Spa Packages':
      return withName('Curated spa experience combining our most-loved treatments.');
    case 'Haircuts':
      return withName('Precision barbering with clean lines and a sharp, confident finish.');
    case 'Grooming & Treatments':
      return withName('Deep-cleansing grooming and scalp treatments to refresh and revitalise.');
    case 'Styling & Cuts':
      return withName('Editorial precision cutting and styling shaped to your hair type and face.');
    case 'Hair Color':
      return withName('Artistic color with expert placement for a natural, dimensional, glossy finish.');
    case 'Treatments':
      return withName('Advanced repair and gloss treatment to restore strength, shine and vitality.');
    case 'Facial & Skincare':
      return withName('Nourishing facial and skincare treatment for healthy, glowing skin.');
    case 'Spa & Body':
      return withName('Relaxing body massage and spa therapy to melt away tension.');
    case 'Waxing & Threading':
      return withName('Hygienic, comfortable waxing and threading with soothing aftercare.');
    case 'Makeup':
      return withName('Professional makeup artistry for a flawless, long-lasting finish.');
    case 'Hair':
      return withName('Cut, style and colour services for every member of the family.');
    case 'Beauty':
      return withName('Makeup and beauty care delivered by our friendly, experienced artists.');
    case 'Skin':
      return withName('Facials and skin care for a healthy, glowing complexion.');
    case 'Spa':
      return withName('Relaxing massage and spa therapy to melt away stress and tension.');
    case 'Kids':
      return withName('Gentle, fun salon care designed especially for children.');
    case 'Nail Art & Gel':
      return withName('Precision nail shaping, colour and art with a glossy, long-lasting finish.');
    case 'Pedicure & Manicure':
      return withName('Restorative hand and foot care with meticulous prep and a polished finish.');
    case 'Lash & Brow':
      return withName('Beauty-focused lash and brow artistry shaped to complement your features.');
    default:
      return withName('Professional salon service delivered by our experienced team.');
  }
}

interface Props {
  data: SalonData;
  setData: Dispatch<SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
}

export default function StepServices({ data, setData, onNext, onPrev, onSave }: Props) {
  const theme = normalizeThemeId(data.templateId);
  const usesDatabaseCatalog = isDatabaseCatalogTheme(theme);
  const isFamilyFullService = theme === 'family_full_service';
  const isNailLashStudio = theme === 'nail_lash_studio';

  const [loadedCatalog, setLoadedCatalog] = useState<ThemeServiceCatalog | null>(null);
  const [commerceLoading, setCommerceLoading] = useState(usesDatabaseCatalog);
  const [commerceError, setCommerceError] = useState('');
  const [catalogStatusTheme, setCatalogStatusTheme] = useState<string | null>(
    usesDatabaseCatalog ? theme : null,
  );
  const [catalogLoading, setCatalogLoading] = useState(usesDatabaseCatalog);
  const [catalogError, setCatalogError] = useState('');
  const catalogRequestRef = useRef(0);
  const savedLoadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);

  // Never derive a new theme from the previous response: until the current
  // database request resolves, all five-theme arrays stay empty. The original
  // preserved `hair` theme keeps its pre-existing local catalog unchanged.
  const activeCatalog = usesDatabaseCatalog && loadedCatalog?.theme.themeId === theme
    ? loadedCatalog
    : null;
  const categories = usesDatabaseCatalog
    ? (activeCatalog?.categories.map((category) => category.name) ?? [])
    : getStaticThemeCategories(theme);
  const suggestedList = usesDatabaseCatalog
    ? (activeCatalog?.suggestedServices ?? [])
    : getStaticSuggestedServices(theme);
  const currentCatalogLoading = usesDatabaseCatalog
    && (catalogStatusTheme !== theme || catalogLoading);
  const currentCatalogError = usesDatabaseCatalog && catalogStatusTheme === theme
    ? catalogError
    : '';
  const themeDisplayName = activeCatalog?.theme.name ?? THEME_LABELS[theme];

  const [selectedSuggested, setSelectedSuggested] = useState<string[]>([]);
  const [suggestedFilter, setSuggestedFilter] = useState<'All' | string>('All');
  const [isSavingSelected, setIsSavingSelected] = useState(false);
  const [saveSelectedError, setSaveSelectedError] = useState('');
  const [saveSelectedNotice, setSaveSelectedNotice] = useState('');
  const [savedServicesLoading, setSavedServicesLoading] = useState(usesDatabaseCatalog);
  const [savedServicesError, setSavedServicesError] = useState('');
  // Which theme the currently held saved-service list belongs to. Null while a
  // load is in flight or after a failed load.
  const [savedStatusTheme, setSavedStatusTheme] = useState<string | null>(
    usesDatabaseCatalog ? null : theme,
  );
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceDescription, setEditServiceDescription] = useState('');
  const [editServicePrice, setEditServicePrice] = useState(0);
  const [editServiceDuration, setEditServiceDuration] = useState(30);
  const [editServiceStatus, setEditServiceStatus] = useState<SavedServiceStatus>('active');
  const [managingServiceId, setManagingServiceId] = useState<string | null>(null);
  const [pendingDeleteServiceId, setPendingDeleteServiceId] = useState<string | null>(null);
  const [isAddingService, setIsAddingService] = useState(false);
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);
  const [discovery, setDiscovery] = useState<ServiceDiscoveryQuery>(DEFAULT_DISCOVERY);
  const [editHindiName, setEditHindiName] = useState('');
  const [editHindiDescription, setEditHindiDescription] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');

  // New Service Form state
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(50);
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServiceCategory, setNewServiceCategory] = useState(categories[0] || 'General');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  // Tracks whether the user hand-wrote the description, so we never silently
  // overwrite their work when the category (or service name) changes.
  const [newServiceDescTouched, setNewServiceDescTouched] = useState(false);
  const [pendingDescSuggestion, setPendingDescSuggestion] = useState('');
  const [showDescConfirm, setShowDescConfirm] = useState(false);
  // Provenance of the Add Service form. It is set ONLY when the owner picks a
  // row from the current theme's predefined list, and stays null for
  // Custom / "Other" services so they are never converted into predefined ones.
  const [newServicePredefinedId, setNewServicePredefinedId] = useState<string | null>(null);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [addServiceError, setAddServiceError] = useState('');

  // Service Name combobox state
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [customService, setCustomService] = useState(false);
  const serviceComboRef = useRef<HTMLDivElement>(null);
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New Package Form state
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackagePrice, setNewPackagePrice] = useState(95);
  const [newPackageDuration, setNewPackageDuration] = useState(60);
  const [newPackageDesc, setNewPackageDesc] = useState('');

  // Load exactly one of the five seeded catalogs through the M19 RPC. The RPC
  // applies themes.theme_id filtering in SQL; this component never downloads a
  // global catalog for client-only filtering.
  useEffect(() => {
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    let cancelled = false;

    // Clear first so a theme switch cannot paint a previous theme for one frame.
    setLoadedCatalog(null);
    setCatalogStatusTheme(usesDatabaseCatalog ? theme : null);
    setCatalogError('');

    if (!usesDatabaseCatalog) {
      setCatalogLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setCatalogLoading(true);
    loadThemeServiceCatalog(theme)
      .then((catalog) => {
        if (cancelled || catalogRequestRef.current !== requestId) return;
        setLoadedCatalog(catalog);
        setCatalogLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled || catalogRequestRef.current !== requestId) return;
        setLoadedCatalog(null);
        setCatalogLoading(false);
        setCatalogError(error instanceof Error ? error.message : 'Unable to load this theme’s service catalog.');
      });

    return () => {
      cancelled = true;
    };
  }, [theme, usesDatabaseCatalog]);

  // Database themes always hydrate saved salon services from the authenticated
  // tenant after mount/refresh. Clear localStorage/snapshot rows immediately so
  // they cannot flash while the current theme-scoped request is in flight.
  //
  // `savedStatusTheme` records which theme the CURRENT saved-service state
  // belongs to. Until it equals the active theme, the list renders nothing —
  // that is what guarantees a previous theme's services can never be shown
  // while a new theme is loading (or after its load failed).
  const runSavedServicesLoad = useCallback((targetTheme: typeof theme) => {
    const requestId = savedLoadRequestRef.current + 1;
    savedLoadRequestRef.current = requestId;

    setSavedServicesError('');
    setEditingServiceId(null);
    setManagingServiceId(null);
    setPendingDeleteServiceId(null);

    if (!isDatabaseCatalogTheme(targetTheme)) {
      setCommerceLoading(false);
      setCommerceError('');
      setSavedServicesLoading(false);
      setSavedStatusTheme(targetTheme);
      return;
    }

    setSavedStatusTheme(null);
    setCommerceLoading(true);
    setCommerceError('');
    setSavedServicesLoading(true);
    // Drop any previous-theme/localStorage rows before the requests start.
    setData((previous) => normalizeThemeId(previous.templateId) === targetTheme
      ? { ...previous, services: [], packages: [], offers: [] }
      : previous
    );

    // Services and their Phase 9.1 commerce metadata are one theme-scoped
    // hydration boundary. Nothing renders until BOTH responses identify the
    // same active theme, so previous-theme offers/variants/bundles cannot leak.
    Promise.all([
      loadSavedServicesForTheme(targetTheme),
      loadThemeCommerce(targetTheme),
    ])
      .then(([services, commerce]) => {
        if (savedLoadRequestRef.current !== requestId) return;
        const uiServices = mergeCommerceIntoServices(
          services.map(savedServiceToSalonService),
          commerce,
        );
        setData((previous) => normalizeThemeId(previous.templateId) === targetTheme
          ? {
              ...previous,
              services: uiServices,
              packages: commerce.bundles,
              offers: commerce.offers,
            }
          : previous
        );
        setCommerceLoading(false);
        setSavedServicesLoading(false);
        setSavedStatusTheme(targetTheme);
      })
      .catch((error: unknown) => {
        if (savedLoadRequestRef.current !== requestId) return;
        setCommerceLoading(false);
        setSavedServicesLoading(false);
        const message = error instanceof Error ? error.message : 'Unable to load saved services.';
        setCommerceError(message);
        // Deliberately leave savedStatusTheme null: a failed load must not
        // render a partial or stale list.
        setSavedServicesError(message);
      });
  }, [setData]);

  useEffect(() => {
    setLocale(readStoredLocale());
    const sync = () => {
      const offline = isBrowserOffline();
      setIsOffline(offline);
      // Drop the restored-form banner as soon as connectivity is confirmed;
      // the draft itself is preserved in session storage for the next visit.
      if (!offline) setSyncNotice('');
    };
    // Initial state reflects the real navigator.onLine value immediately.
    sync();
    // Dynamic listeners keep the state in sync across connection flaps —
    // navigator.onLine alone can be stale for the whole session otherwise.
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const handleLocaleChange = (next: AppLocale) => {
    setLocale(next);
    persistLocale(next);
  };

  useEffect(() => {
    runSavedServicesLoad(theme);
    return () => {
      // Invalidate the in-flight request so a late response cannot paint.
      savedLoadRequestRef.current += 1;
    };
  }, [theme, runSavedServicesLoad]);

  /** Retry handler for the saved-service error state. */
  const reloadSavedServices = () => runSavedServicesLoad(theme);

  /** Refreshes Phase 9.1 metadata after a variant/badge/offer/bundle write. */
  const reloadCommerce = useCallback(async () => {
    if (!isDatabaseCatalogTheme(theme)) return;
    setCommerceLoading(true);
    setCommerceError('');
    try {
      const commerce = await loadThemeCommerce(theme);
      setData((previous) => normalizeThemeId(previous.templateId) === theme
        ? {
            ...previous,
            services: mergeCommerceIntoServices(previous.services, commerce),
            packages: commerce.bundles,
            offers: commerce.offers,
          }
        : previous
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh pricing and promotions.';
      setCommerceError(message);
      throw error;
    } finally {
      setCommerceLoading(false);
    }
  }, [setData, theme]);

  // The saved list renders ONLY when the held state provably belongs to the
  // active theme. This is the single guard that prevents a previous theme's
  // services from appearing while a new theme loads or after a load error.
  const showSavedServices = savedStatusTheme === theme;

  // When the theme changes, clear ALL theme-specific selections and temporary
  // buffers so nothing from a previous theme leaks into the current one:
  //   - selected suggested services
  //   - the suggested category filter
  //   - the add-service category / predefined service selection
  //   - temporary service + package form buffers
  //   - any open form/action state
  useEffect(() => {
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }

    // Suggested-services selection/save buffers
    saveRequestRef.current += 1;
    setSelectedSuggested([]);
    setSuggestedFilter('All');
    setIsSavingSelected(false);
    setSaveSelectedError('');
    setSaveSelectedNotice('');
    setEditingServiceId(null);
    setEditServiceName('');
    setEditServiceDescription('');
    setEditServicePrice(0);
    setEditServiceDuration(30);
    setEditServiceStatus('active');
    setManagingServiceId(null);
    setPendingDeleteServiceId(null);
    setNewServicePredefinedId(null);
    setIsCreatingService(false);
    setAddServiceError('');

    // Add-service form: database themes intentionally start empty until their
    // current theme-scoped response arrives; the original theme stays unchanged.
    const firstCategory = usesDatabaseCatalog
      ? ''
      : (getStaticThemeCategories(theme)[0] || 'General');
    setNewServiceCategory(firstCategory);
    setNewServiceName('');
    setNewServicePrice(50);
    setNewServiceDuration(30);
    setNewServiceDesc(suggestServiceDescription(firstCategory, ''));
    setNewServiceDescTouched(false);
    setCustomService(false);
    setServiceDropdownOpen(false);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');

    // Close any open add-forms and reset fast-action state
    setIsAddingService(false);
    setIsAddingPackage(false);
    setIsSpeaking(false);

    // Package form buffers
    setNewPackageName('');
    setNewPackagePrice(95);
    setNewPackageDuration(60);
    setNewPackageDesc('');
    setDiscovery(DEFAULT_DISCOVERY);
    setEditHindiName('');
    setEditHindiDescription('');
    // Intentionally only depends on [theme]; the individual setState calls above
    // cover every piece of theme-scoped state, so no other deps are needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      if (speechTimerRef.current) {
        clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
      }
    };
  }, [theme]);

  // Initialise category/form copy only after the current database theme arrives.
  // activeCatalog is identity-checked above, so a late previous-theme response
  // can never initialise this form.
  //
  // Draft restoration is conditional: a draft is only restored (and the
  // "Unsaved service form restored" banner only shown) when the connection is
  // currently offline OR the browser's online state is stale (no 'online'
  // event has been observed this session). When the connection is healthy the
  // stale draft is discarded — the root cause of the false "restored" banner
  // firing while the user was online was an auto-saved draft that was never
  // cleared after a successful submit.
  useEffect(() => {
    if (!usesDatabaseCatalog || !activeCatalog) return;
    const draft = readServiceFormDraft(theme);
    if (draft && (isBrowserOffline() || isStaleConnectivityState())) {
      setNewServiceCategory(draft.category || activeCatalog.categories[0]?.name || '');
      setNewServiceName(draft.name);
      setNewServicePrice(draft.price);
      setNewServiceDuration(draft.duration);
      setNewServiceDesc(draft.description);
      setNewServiceDescTouched(true);
      setIsAddingService(true);
      setSyncNotice('Unsaved service form restored. Review and save when you are online.');
      return;
    }
    // Online (or stale-state cleared): the draft is stale — the saved payload
    // is the source of truth, so drop the auto-saved copy instead of restoring
    // it and blocking the form.
    if (draft) clearServiceFormDraft();
    const firstCategory = activeCatalog.categories[0]?.name || '';
    setNewServiceCategory(firstCategory);
    setNewServiceDesc(suggestServiceDescription(firstCategory || 'General', ''));
    setNewServiceDescTouched(false);
  }, [activeCatalog, usesDatabaseCatalog, theme]);

  // Close the service combobox when clicking outside it.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (serviceComboRef.current && !serviceComboRef.current.contains(e.target as Node)) {
        setServiceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  /** Only database catalog rows carry a real predefined UUID; static theme rows
   * (the preserved `hair` theme) never produce a predefined link. */
  const predefinedIdOf = (service: PredefinedService): string | null => {
    if (!usesDatabaseCatalog) return null;
    const id = (service as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  };

  /** The current theme's category UUID for a category display name. */
  const categoryIdOf = (categoryName: string): string | null =>
    activeCatalog?.categories.find((category) => category.name === categoryName)?.id ?? null;

  const findCurrentPredefinedService = (value: string): PredefinedService | undefined => {
    if (!usesDatabaseCatalog) return findStaticPredefinedService(theme, value);
    const query = value.trim().toLowerCase();
    if (!query || !activeCatalog) return undefined;
    return activeCatalog.predefinedServices.find((service) =>
      service.name.toLowerCase() === query
      || service.suggestedLabel?.toLowerCase() === query
    );
  };

  const visibleSuggested =
    suggestedFilter === 'All'
      ? suggestedList
      : suggestedList.filter((s) => s.category === suggestedFilter);

  const allVisibleSelected =
    visibleSuggested.length > 0 && visibleSuggested.every((s) => selectedSuggested.includes(s.name));

  const toggleSuggested = (name: string) => {
    setSelectedSuggested((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const selectAllSuggested = () => {
    if (allVisibleSelected) {
      setSelectedSuggested((prev) => prev.filter((n) => !visibleSuggested.some((s) => s.name === n)));
    } else {
      setSelectedSuggested((prev) =>
        Array.from(new Set([...prev, ...visibleSuggested.map((s) => s.name)]))
      );
    }
  };

  const handleAddSelected = async () => {
    if (selectedSuggested.length === 0 || isSavingSelected) return;
    if (isOffline || isBrowserOffline()) {
      setSaveSelectedError('You are offline. Selection is kept — tap Add Selected again when you reconnect. Nothing will be duplicated.');
      return;
    }

    // Preserve the original Existing Theme behavior. Session 2 database saving
    // applies only to the five M18/M19 database catalogs.
    if (!isDatabaseCatalogTheme(theme)) {
      const newServices: Service[] = selectedSuggested.map((sName) => {
        const found = suggestedList.find((service) => service.name === sName);
        return {
          id: 's-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: found ? found.name : sName,
          category: found ? found.category : 'General',
          description: found ? found.description : 'Professional service provided by experienced stylists.',
          price: found ? found.price : 50,
          duration: found ? found.duration : 30,
        };
      });
      setData({ ...data, services: [...data.services, ...newServices] });
      setSelectedSuggested([]);
      if (onSave) onSave();
      return;
    }

    if (!activeCatalog) {
      setSaveSelectedError('Wait for this theme’s services to finish loading.');
      return;
    }

    // Resolve selected chips only through the current RPC response. No name-only
    // or cross-theme predefined relationship is sent to the database.
    const selectedRows = activeCatalog.suggestedServices.filter((service) =>
      selectedSuggested.includes(service.name)
    );
    if (selectedRows.length !== selectedSuggested.length) {
      setSaveSelectedError('The selected services are no longer available for this theme.');
      return;
    }

    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setIsSavingSelected(true);
    setSaveSelectedError('');
    setSaveSelectedNotice('');

    try {
      const result = await savePredefinedServices(
        theme,
        selectedRows.map((service) => service.id),
      );
      if (saveRequestRef.current !== requestId) return;

      // Keep local preview state aligned with returned canonical saved rows:
      // revived archived rows (same predefined id, possibly same row id) are
      // replaced in place so the retired copy becomes active again, and brand
      // new rows are appended. Nothing is ever added twice.
      setData((previous) => {
        if (normalizeThemeId(previous.templateId) !== theme) return previous;
        const revivedByPredefinedId = new Map(
          result.services
            .filter((service) => Boolean(service.predefinedServiceId))
            .map((service) => [service.predefinedServiceId as string, service]),
        );
        const services = previous.services.map((service) => {
          const revived = service.predefinedServiceId
            ? revivedByPredefinedId.get(service.predefinedServiceId)
            : undefined;
          return revived ? savedServiceToSalonService(revived) : service;
        });
        const knownPredefinedIds = new Set(
          previous.services
            .map((service) => service.predefinedServiceId)
            .filter((id): id is string => Boolean(id)),
        );
        const appended = result.services
          .filter((service) => service.predefinedServiceId && !knownPredefinedIds.has(service.predefinedServiceId))
          .map((service) => savedServiceToSalonService(service));
        return {
          ...previous,
          services: appended.length > 0 ? [...services, ...appended] : services,
        };
      });
      setSelectedSuggested([]);
      setSaveSelectedNotice(
        result.insertedCount > 0
          ? `${result.insertedCount} service${result.insertedCount === 1 ? '' : 's'} saved.`
          : 'Selected services are already saved.',
      );
      if (onSave) onSave();
    } catch (error) {
      if (saveRequestRef.current !== requestId) return;
      setSaveSelectedError(networkErrorMessage(error, isBrowserOffline()));
    } finally {
      if (saveRequestRef.current === requestId) setIsSavingSelected(false);
    }
  };

  const handleAISuggest = () => {
    if (isFamilyFullService || isNailLashStudio) return;
    const names = AI_SUGGESTION_NAMES[theme as keyof typeof AI_SUGGESTION_NAMES];
    if (!names) return;
    const aiAdded: Service[] = names.map((n, i) => {
      const found = findCurrentPredefinedService(n);
      return {
        id: 'ai-' + Date.now() + '-' + i,
        name: found ? found.name : n,
        category: found ? found.category : (categories[0] || 'General'),
        description: found ? found.description : 'AI-suggested premium service for your salon.',
        price: found ? found.price : 50,
        duration: found ? found.duration : 30,
        featured: i === 0,
      };
    });
    setData({
      ...data,
      services: [...data.services, ...aiAdded],
    });
    if (onSave) onSave();
  };

  const handleSpeechInput = () => {
    if (isFamilyFullService || isNailLashStudio) return;
    setIsSpeaking(true);
    speechTimerRef.current = setTimeout(() => {
      speechTimerRef.current = null;
      setIsSpeaking(false);
      const v = VOICE_SERVICE_BY_THEME[theme as keyof typeof VOICE_SERVICE_BY_THEME];
      if (!v) return;
      const voiceService: Service = {
        id: 'v-' + Date.now(),
        name: v.name,
        category: v.category,
        description: v.description,
        price: v.price,
        duration: v.duration,
      };
      setData({
        ...data,
        services: [...data.services, voiceService],
      });
      if (onSave) onSave();
    }, 1500);
  };

  const handleOpenAddService = () => {
    setIsAddingService(true);
    setCustomService(false);
    setServiceDropdownOpen(false);
    setNewServiceName('');
    setNewServicePredefinedId(null);
    setAddServiceError('');
    setNewServiceDesc(suggestServiceDescription(newServiceCategory, ''));
    setNewServiceDescTouched(false);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
  };

  const handleServiceNameInput = (value: string) => {
    setNewServiceName(value);
    setAddServiceError('');
    if (!serviceDropdownOpen) setServiceDropdownOpen(true);
    if (customService) {
      // Custom / "Other" never acquires predefined provenance from typing.
      setNewServicePredefinedId(null);
      if (!newServiceDescTouched) {
        setNewServiceDesc(suggestServiceDescription(newServiceCategory, value));
      }
      return;
    }
    const match = findCurrentPredefinedService(value);
    if (match) {
      // Exact predefined match (or a family suggested alias) → canonicalise
      // the name and auto-fill the rest of the form.
      setNewServiceName(match.name);
      setNewServiceCategory(match.category);
      setNewServicePrice(match.price);
      setNewServiceDuration(match.duration);
      setNewServiceDesc(match.description);
      setNewServiceDescTouched(false);
      setNewServicePredefinedId(predefinedIdOf(match));
    } else {
      // A partially typed name is not a predefined service.
      setNewServicePredefinedId(null);
      if (!newServiceDescTouched) {
        // Still typing → keep a live, relevant description suggestion.
        setNewServiceDesc(suggestServiceDescription(newServiceCategory, value));
      }
    }
  };

  const selectPredefined = (s: PredefinedService) => {
    setNewServiceName(s.name);
    setNewServiceCategory(s.category);
    setNewServicePrice(s.price);
    setNewServiceDuration(s.duration);
    setNewServiceDesc(s.description);
    setNewServiceDescTouched(false);
    setNewServicePredefinedId(predefinedIdOf(s));
    setCustomService(false);
    setServiceDropdownOpen(false);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
    setAddServiceError('');
  };

  const enableCustom = () => {
    setCustomService(true);
    setNewServiceName('');
    setNewServiceDesc(suggestServiceDescription(newServiceCategory, ''));
    setNewServiceDescTouched(false);
    setNewServicePrice(50);
    setNewServiceDuration(30);
    // Custom Service / Other keeps predefined_service_id NULL.
    setNewServicePredefinedId(null);
    setServiceDropdownOpen(false);
    setAddServiceError('');
  };

  const backToPredefined = () => {
    setCustomService(false);
    setNewServiceName('');
    setNewServicePredefinedId(null);
    setServiceDropdownOpen(true);
    setAddServiceError('');
  };

  const handleCategoryChange = (cat: string) => {
    setNewServiceCategory(cat);
    setServiceDropdownOpen(true);
    setAddServiceError('');
    // A different category invalidates any previously matched predefined row.
    setNewServicePredefinedId(null);
    if (!customService) {
      // Service names differ per category — reset the selection.
      setNewServiceName('');
      setNewServicePrice(50);
      setNewServiceDuration(30);
      setNewServiceDesc(suggestServiceDescription(cat, ''));
      setNewServiceDescTouched(false);
    } else {
      setNewServiceDesc(suggestServiceDescription(cat, newServiceName));
      setNewServiceDescTouched(false);
    }
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
  };

  const handleServiceDescChange = (value: string) => {
    setNewServiceDesc(value);
    setNewServiceDescTouched(true);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
  };

  const applyDescSuggestion = (suggestion: string) => {
    setNewServiceDesc(suggestion);
    setNewServiceDescTouched(false);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
  };

  const closeAddServiceForm = () => {
    setNewServiceName('');
    setNewServiceDesc('');
    setNewServiceDescTouched(false);
    setNewServicePredefinedId(null);
    setCustomService(false);
    setServiceDropdownOpen(false);
    setShowDescConfirm(false);
    setPendingDescSuggestion('');
    setAddServiceError('');
    setIsAddingService(false);
    // Explicit cancel / reset discards the auto-saved draft too — a form the
    // user walked away from must not be "restored" on the next visit.
    clearServiceFormDraft();
  };

  const handleCreateService = async (e: FormEvent) => {
    e.preventDefault();
    const name = newServiceName.trim();
    if (!name || isCreatingService) return;
    persistServiceFormDraft({
      themeId: theme,
      name,
      description: newServiceDesc,
      price: Number(newServicePrice) || 0,
      duration: Number(newServiceDuration) || 30,
      category: newServiceCategory,
      savedAt: new Date().toISOString(),
    });
    if (isOffline || isBrowserOffline()) {
      setAddServiceError('You are offline. This form is kept on this device — save again when you reconnect.');
      return;
    }

    const price = Number(newServicePrice) || 0;
    const duration = Number(newServiceDuration) || 30;
    const description = newServiceDesc || 'Custom salon service.';

    // Preserved original theme keeps its existing in-memory behavior.
    if (!isDatabaseCatalogTheme(theme)) {
      const created: Service = {
        id: 'custom-' + Date.now(),
        themeId: null,
        categoryId: null,
        predefinedServiceId: null,
        name,
        category: newServiceCategory || 'General',
        description,
        price,
        duration,
      };
      setData({
        ...data,
        services: [...data.services, created],
      });
      closeAddServiceForm();
      if (onSave) onSave();
      return;
    }

    if (!activeCatalog) {
      setAddServiceError('Wait for this theme’s services to finish loading.');
      return;
    }
    const categoryId = categoryIdOf(newServiceCategory);
    if (!categoryId) {
      setAddServiceError('Select a category from this theme before saving.');
      return;
    }

    // Predefined provenance is only kept when the picked row still belongs to
    // the selected category of the current theme. Otherwise it stays NULL and
    // the service is saved as a Custom / "Other" service.
    const predefinedMatch = newServicePredefinedId
      ? activeCatalog.predefinedServices.find((service) =>
          service.id === newServicePredefinedId && service.categoryId === categoryId)
      : undefined;
    const predefinedServiceId = customService ? null : (predefinedMatch?.id ?? null);

    // Prevent duplicates before hitting the database. Archived (soft-deleted)
    // services are retired — re-adding one revives it instead of erroring, so
    // only live rows count as duplicates (mirrors the partial unique indexes
    // that exclude soft-deleted rows and the M67 upsert RPC).
    const duplicate = data.services.some((service) =>
      (predefinedServiceId !== null
        && service.predefinedServiceId === predefinedServiceId
        && service.status !== 'archived')
      || (service.status !== 'archived'
        && service.name.trim().toLowerCase() === name.toLowerCase())
    );
    if (duplicate) {
      setAddServiceError('This service is already saved for your salon.');
      return;
    }

    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setIsCreatingService(true);
    setAddServiceError('');
    try {
      const saved = await createSavedService(theme, {
        categoryId,
        name,
        description,
        price,
        duration,
        predefinedServiceId,
        status: 'active',
      });
      if (saveRequestRef.current !== requestId) return;
      setData((previous) => normalizeThemeId(previous.templateId) === theme
        ? {
            ...previous,
            // Re-adding an archived service revives the SAME row id, so when
            // the returned row is already in the list (stale archived copy)
            // replace it in place instead of leaving it behind or duplicating.
            services: previous.services.some((item) => item.id === saved.id)
              ? previous.services.map((item) =>
                  item.id === saved.id ? savedServiceToSalonService(saved) : item)
              : [...previous.services, savedServiceToSalonService(saved)],
          }
        : previous
      );
      // Successful submit → the auto-saved draft is now persisted server-side.
      // Clear it (and any matching stale copy) so the next mount can never
      // "restore" an already-saved form.
      clearServiceFormDraftIfMatches({
        name: saved.name,
        price: saved.price,
        duration: saved.duration,
        description: saved.description,
        category: saved.category,
      });
      clearServiceFormDraft();
      closeAddServiceForm();
      setSyncNotice('');
      if (onSave) onSave();
    } catch (error) {
      if (saveRequestRef.current !== requestId) return;
      setAddServiceError(networkErrorMessage(error, isBrowserOffline()));
    } finally {
      if (saveRequestRef.current === requestId) setIsCreatingService(false);
    }
  };

  const handleCreatePackage = (e: FormEvent) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;
    const created: Package = {
      id: 'pkg-' + Date.now(),
      name: newPackageName,
      description: newPackageDesc || 'Combo package offering maximum savings.',
      price: Number(newPackagePrice) || 0,
      duration: Number(newPackageDuration) || 60,
    };
    setData({
      ...data,
      packages: [...data.packages, created],
    });
    setNewPackageName('');
    setNewPackageDesc('');
    setIsAddingPackage(false);
    if (onSave) onSave();
  };

  /** A saved (database-backed) service of the current theme. */
  const isSavedService = (service: Service): boolean =>
    Boolean(service.businessId) && isDatabaseCatalogTheme(theme);

  const beginEditService = (service: Service) => {
    if (!isSavedService(service)) return;
    setEditingServiceId(service.id);
    setEditServiceName(service.name);
    setEditServiceDescription(service.description);
    setEditServicePrice(service.price);
    setEditServiceDuration(service.duration);
    setEditServiceStatus(service.status ?? 'active');
    const hindi = service.translations?.find((item) => item.locale === 'hi');
    setEditHindiName(hindi?.name ?? '');
    setEditHindiDescription(hindi?.description ?? '');
    setSavedServicesError('');
  };

  /**
   * AUTOSAVE (canonical `services` row) — see src/hooks/useAutoSaveService.ts.
   *
   * While a DATABASE-backed service is open in the editor, every field change
   * is debounced (800 ms) and upserted into the canonical `services` table, so
   * the owner never loses an edit to a refresh or a step change. The explicit
   * "Save Changes" button below still owns status, translations and media,
   * which need the saved-service RPC. Autosave is paused while that explicit
   * save is in flight so the two writers can never interleave.
   */
  const editingService = editingServiceId
    ? data.services.find((item) => item.id === editingServiceId) ?? null
    : null;

  const serviceAutosave = useAutoSaveService(
    editingService
      ? {
          id: editingService.id,
          salonId: editingService.businessId ?? null,
          name: editServiceName,
          category: editingService.category,
          description: editServiceDescription,
          price: editServicePrice,
          duration: editServiceDuration,
          featured: editingService.featured === true,
          promotionalBadge: editingService.promotionalBadge ?? null,
        }
      : null,
    {
      // Only rows that already exist in the database are autosaved; creating a
      // service keeps using `create_saved_service` (provenance + duplicates).
      enabled: Boolean(editingService?.businessId) && managingServiceId !== editingServiceId,
      onSaved: () => {
        // Mirror the confirmed values into the CENTRAL edit state so the live
        // preview (same React tree — bound to `data` by props) updates the
        // instant the database confirms, without a second save.
        if (!editingServiceId) return;
        setData((previous) => ({
          ...previous,
          services: previous.services.map((item) =>
            item.id === editingServiceId
              ? {
                  ...item,
                  name: editServiceName,
                  description: editServiceDescription,
                  price: editServicePrice,
                  duration: editServiceDuration,
                }
              : item,
          ),
        }));
      },
      onError: (message) => setSavedServicesError(message),
    },
  );

  /**
   * Applies mutable field changes only. `theme_id`, `category_id` and
   * `predefined_service_id` are never sent, so the original theme/category/
   * predefined relationship (or the Custom NULL provenance) always survives.
   */
  const applySavedServiceChanges = async (
    service: Service,
    changes: {
      name?: string;
      description?: string;
      price?: number;
      duration?: number;
      status?: SavedServiceStatus;
    },
    fallbackMessage: string,
  ): Promise<boolean> => {
    if (!isDatabaseCatalogTheme(theme) || !service.businessId) return false;
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setManagingServiceId(service.id);
    setSavedServicesError('');
    try {
      const updated = await updateSavedService(theme, service.id, changes);
      if (saveRequestRef.current !== requestId) return false;
      setData((previous) => ({
        ...previous,
        services: previous.services.map((item) =>
          item.id === service.id
            ? {
                ...savedServiceToSalonService(updated),
                promotionalBadge: item.promotionalBadge,
                pricingVariants: item.pricingVariants,
                translations: updated.translations ?? item.translations,
                media: updated.media ?? item.media,
              }
            : item
        ),
      }));
      if (onSave) onSave();
      return true;
    } catch (error) {
      if (saveRequestRef.current !== requestId) return false;
      setSavedServicesError(error instanceof Error ? error.message : fallbackMessage);
      return false;
    } finally {
      if (saveRequestRef.current === requestId) setManagingServiceId(null);
    }
  };

  /** Edit Service — name, description, price, duration and status together. */
  const handleUpdateSavedService = async (service: Service) => {
    const saved = await applySavedServiceChanges(
      service,
      {
        name: editServiceName,
        description: editServiceDescription,
        price: editServicePrice,
        duration: editServiceDuration,
        status: editServiceStatus,
      },
      'Unable to update this service.',
    );
    if (saved) setEditingServiceId(null);
  };

  /** Update Price only. */
  const handleUpdateServicePrice = (service: Service, price: number) =>
    applySavedServiceChanges(service, { price }, 'Unable to update the price.');

  /** Update Duration only. */
  const handleUpdateServiceDuration = (service: Service, duration: number) =>
    applySavedServiceChanges(service, { duration }, 'Unable to update the duration.');

  /** Update Description only. */
  const handleUpdateServiceDescription = (service: Service, description: string) =>
    applySavedServiceChanges(service, { description }, 'Unable to update the description.');

  /** Change service status (active / inactive / archived). */
  const handleChangeServiceStatus = async (service: Service, status: SavedServiceStatus) => {
    if (!isDatabaseCatalogTheme(theme) || !service.businessId) return;
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setManagingServiceId(service.id);
    setSavedServicesError('');
    try {
      const updated = await setSavedServiceStatus(theme, service.id, status);
      if (saveRequestRef.current !== requestId) return;
      setData((previous) => ({
        ...previous,
        services: previous.services.map((item) =>
          item.id === service.id
            ? {
                ...savedServiceToSalonService(updated),
                promotionalBadge: item.promotionalBadge,
                pricingVariants: item.pricingVariants,
                translations: updated.translations ?? item.translations,
                media: updated.media ?? item.media,
              }
            : item
        ),
      }));
      if (onSave) onSave();
    } catch (error) {
      if (saveRequestRef.current !== requestId) return;
      setSavedServicesError(error instanceof Error ? error.message : 'Unable to change service status.');
    } finally {
      if (saveRequestRef.current === requestId) setManagingServiceId(null);
    }
  };

  /** Activate / Deactivate toggle. */
  const handleToggleSavedService = (service: Service) =>
    handleChangeServiceStatus(service, service.status === 'active' ? 'inactive' : 'active');

  /**
   * Deletes the salon's own saved service row only. Global themes,
   * service_categories and predefined_services are never targeted.
   */
  const handleDeleteService = async (service: Service) => {
    if (service.businessId && isDatabaseCatalogTheme(theme)) {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setManagingServiceId(service.id);
      setSavedServicesError('');
      try {
        await deleteSavedService(service.id);
        if (saveRequestRef.current !== requestId) return;
      } catch (error) {
        if (saveRequestRef.current !== requestId) return;
        setSavedServicesError(error instanceof Error ? error.message : 'Unable to delete this service.');
        setManagingServiceId(null);
        setPendingDeleteServiceId(null);
        return;
      }
      if (saveRequestRef.current === requestId) setManagingServiceId(null);
    }
    setPendingDeleteServiceId(null);
    if (editingServiceId === service.id) setEditingServiceId(null);
    setData((previous) => ({
      ...previous,
      services: previous.services.filter((item) => item.id !== service.id),
    }));
    if (onSave) onSave();
  };

  /**
   * A duplicate is always a NEW custom service: it never inherits the source
   * row's predefined link, so the original predefined relationship stays
   * unique to the original saved service.
   */
  const handleDuplicateService = async (s: Service) => {
    const copyName = `${s.name} (Copy)`;

    if (s.businessId && isDatabaseCatalogTheme(theme) && s.categoryId) {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setManagingServiceId(s.id);
      setSavedServicesError('');
      try {
        const saved = await createSavedService(theme, {
          categoryId: s.categoryId,
          name: copyName,
          description: s.description,
          price: s.price,
          duration: s.duration,
          // Copies are custom services; provenance is intentionally NULL.
          predefinedServiceId: null,
          status: 'active',
        });
        if (saveRequestRef.current !== requestId) return;
        setData((previous) => ({
          ...previous,
          services: [...previous.services, savedServiceToSalonService(saved)],
        }));
        if (onSave) onSave();
      } catch (error) {
        if (saveRequestRef.current !== requestId) return;
        setSavedServicesError(error instanceof Error ? error.message : 'Unable to duplicate this service.');
      } finally {
        if (saveRequestRef.current === requestId) setManagingServiceId(null);
      }
      return;
    }

    const dup: Service = {
      ...s,
      id: 'dup-' + Date.now(),
      businessId: undefined,
      themeId: null,
      themeKey: undefined,
      categoryId: null,
      predefinedServiceId: null,
      status: 'active',
      name: copyName,
    };
    setData((previous) => ({
      ...previous,
      services: [...previous.services, dup],
    }));
    if (onSave) onSave();
  };

  const patchServiceContent = (serviceId: string, patch: Partial<Service>) => {
    setData((previous) => ({
      ...previous,
      services: previous.services.map((item) =>
        item.id === serviceId ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleSaveHindiTranslation = async (service: Service) => {
    if (!isDatabaseCatalogTheme(theme) || !service.businessId) return;
    try {
      const saved = await upsertSavedServiceTranslation(
        theme, service.id, 'hi', editHindiName, editHindiDescription,
      );
      const next = [
        ...(service.translations ?? []).filter((item) => item.locale !== 'hi'),
        saved,
      ];
      patchServiceContent(service.id, { translations: next });
    } catch (error) {
      setSavedServicesError(error instanceof Error ? error.message : 'Unable to save translation.');
    }
  };

  const handleServiceMediaUpload = async (service: Service, kind: ServiceMediaKind, dataUrl: string) => {
    if (!isDatabaseCatalogTheme(theme) || !service.businessId) return;
    try {
      const media = await upsertSavedServiceMedia(theme, service.id, kind, dataUrl);
      patchServiceContent(service.id, { media: { ...service.media, ...media } });
    } catch (error) {
      setSavedServicesError(error instanceof Error ? error.message : 'Unable to save media.');
    }
  };

  const handleServiceMediaRemove = async (service: Service, kind: ServiceMediaKind) => {
    if (!isDatabaseCatalogTheme(theme) || !service.businessId) return;
    try {
      const media = await deleteSavedServiceMedia(theme, service.id, kind);
      patchServiceContent(service.id, { media });
    } catch (error) {
      setSavedServicesError(error instanceof Error ? error.message : 'Unable to remove media.');
    }
  };

  const handleDeletePackage = (id: string) => {
    setData({
      ...data,
      packages: data.packages.filter((p) => p.id !== id),
    });
    if (onSave) onSave();
  };

  // Service-name combobox: the list of selectable names is filtered by the
  // currently chosen category AND the current theme.
  const serviceQuery = newServiceName.trim().toLowerCase();
  const categoryServices = usesDatabaseCatalog
    ? (activeCatalog?.predefinedServices.filter((service) => service.category === newServiceCategory) ?? [])
    : getStaticServicesForThemeCategory(theme, newServiceCategory);
  const filteredServices = customService
    ? []
    : categoryServices.filter((s) => s.name.toLowerCase().includes(serviceQuery));

  const suggestedPredefinedIds: Set<string> = new Set<string>(
    suggestedList.flatMap((service) => {
      const id = (service as { id?: unknown }).id;
      return typeof id === 'string' && id ? [id] : [];
    }),
  );
  const visibleServices = showSavedServices
    ? filterAndSortServices(data.services, discovery, locale, suggestedPredefinedIds)
    : [];

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
      active
        ? 'border-[#ac0053] bg-[#ffd9e1] text-[#3f001a]'
        : 'border-[#eeeeee] bg-[#f9f9f9] text-[#1a1c1c] hover:border-[#ac0053] hover:text-[#ac0053]'
    }`;

  return (
    <div className="flex-1 flex w-full h-full bg-[#f9f9f9] overflow-x-hidden">
      <div className="w-full md:w-[55%] h-full flex flex-col relative bg-[#f9f9f9] border-r border-[#eeeeee] min-w-0">
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 sm:p-6 md:p-10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto pb-32 space-y-8">
            <div>
              <span className="text-xs font-semibold tracking-widest text-[#5f5e5e] uppercase">SERVICES</span>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1a1c1c] mt-1 mb-2 break-words">What services do you offer?</h1>
              <p className="text-[#5f5e5e] text-base">Choose your services, add prices and your website will update instantly.</p>
              {(isOffline || syncNotice) && (
                <p className="mt-3 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3" role="status">
                  {isOffline
                    ? 'Offline — Add Selected / Edit / Save are paused so retries cannot create duplicates. Unsaved form text is kept on this device.'
                    : syncNotice}
                </p>
              )}
            </div>

            {/* Suggested Services — theme-specific */}
            <div className="bg-white rounded-lg border border-[#eeeeee] p-6 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[#1a1c1c] uppercase tracking-wider">Suggested for {themeDisplayName}</h3>
                  <p className="text-xs text-[#5f5e5e] mt-0.5">Curated to match your selected website style.</p>
                </div>
                <button
                  onClick={selectAllSuggested}
                  className="min-h-11 text-xs font-semibold text-[#ac0053] hover:underline self-start sm:self-auto"
                >
                  {allVisibleSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Category filter (per theme) */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSuggestedFilter('All')} className={`${chipClass(suggestedFilter === 'All')} min-h-11`}>
                  All
                </button>
                {categories.map((c) => (
                  <button key={c} onClick={() => setSuggestedFilter(c)} className={`${chipClass(suggestedFilter === c)} min-h-11`}>
                    {c}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {currentCatalogLoading && (
                  <p className="text-sm text-[#5f5e5e]">Loading services…</p>
                )}
                {!currentCatalogLoading && currentCatalogError && (
                  <p className="text-sm text-red-600" role="alert">{currentCatalogError}</p>
                )}
                {!currentCatalogLoading && !currentCatalogError && visibleSuggested.map((s) => {
                  const isSelected = selectedSuggested.includes(s.name);
                  return (
                    <button
                      key={s.name}
                      onClick={() => toggleSuggested(s.name)}
                      title={s.description}
                      className={`min-h-11 px-4 py-2 rounded-full border text-sm font-medium transition-all flex items-center gap-1.5 break-words ${
                        isSelected
                          ? 'border-[#ac0053] bg-[#ffd9e1] text-[#3f001a]'
                          : 'border-[#eeeeee] bg-[#f9f9f9] text-[#1a1c1c] hover:border-[#ac0053] hover:text-[#ac0053]'
                      }`}
                    >
                      {isSelected ? <Check className="w-4 h-4 text-[#ac0053]" /> : <Plus className="w-4 h-4 text-[#5f5e5e]" />}
                      {s.suggestedLabel || s.name}
                    </button>
                  );
                })}
                {!currentCatalogLoading && !currentCatalogError && visibleSuggested.length === 0 && (
                  <p className="text-sm text-[#5f5e5e]">No suggested services in this category.</p>
                )}
              </div>
              <div className="pt-2">
                <button
                  onClick={handleAddSelected}
                  disabled={selectedSuggested.length === 0 || isSavingSelected || currentCatalogLoading}
                  className="min-h-11 bg-[#ac0053] text-white font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-[#ba005b] transition-colors disabled:opacity-40"
                >
                  {isSavingSelected ? 'Saving…' : `Add Selected (${selectedSuggested.length})`}
                </button>
                {saveSelectedError && (
                  <p className="text-xs text-red-600 mt-2" role="alert">{saveSelectedError}</p>
                )}
                {saveSelectedNotice && !saveSelectedError && (
                  <p className="text-xs text-emerald-700 mt-2" role="status">{saveSelectedNotice}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleSpeechInput}
                disabled={isSpeaking}
                className="flex-1 min-h-11 bg-white border border-[#eeeeee] rounded-lg p-4 flex items-center justify-center gap-2 hover:border-[#ac0053] transition-colors group shadow-sm"
              >
                {isSpeaking ? (
                  <Volume2 className="w-5 h-5 text-[#ac0053] animate-pulse" />
                ) : (
                  <Mic className="w-5 h-5 text-[#5f5e5e] group-hover:text-[#ac0053] transition-colors" />
                )}
                <span className="text-sm font-semibold text-[#1a1c1c] group-hover:text-[#ac0053] transition-colors">
                  {isSpeaking ? 'Listening...' : 'Speak your services'}
                </span>
              </button>
              <button
                onClick={handleAISuggest}
                className="flex-1 min-h-11 bg-white border border-[#eeeeee] rounded-lg p-4 flex items-center justify-center gap-2 hover:border-[#ac0053] transition-colors group shadow-sm"
              >
                <Sparkles className="w-5 h-5 text-[#5f5e5e] group-hover:text-[#ac0053] transition-colors" />
                <span className="text-sm font-semibold text-[#1a1c1c] group-hover:text-[#ac0053] transition-colors">
                  Suggest with AI
                </span>
              </button>
            </div>

            <hr className="border-[#eeeeee]" />

            <div className="flex flex-col gap-4 min-w-0">
              <h3 className="text-xs font-semibold tracking-wider text-[#5f5e5e] uppercase">
                MY SERVICES ({showSavedServices ? visibleServices.length : 0}
                {showSavedServices && visibleServices.length !== data.services.length
                  ? ` of ${data.services.length}`
                  : ''})
              </h3>
              {usesDatabaseCatalog && (
                <ServiceDiscoveryBar
                  query={discovery}
                  onChange={setDiscovery}
                  locale={locale}
                  onLocaleChange={handleLocaleChange}
                  categories={categories}
                />
              )}
              {savedServicesLoading && usesDatabaseCatalog && (
                <p className="text-xs text-[#5f5e5e]" role="status">Loading saved services…</p>
              )}
              {savedServicesError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-xs text-red-700" role="alert">{savedServicesError}</p>
                  <button type="button" onClick={reloadSavedServices} className="min-h-11 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 shrink-0">
                    Try again
                  </button>
                </div>
              )}
              {showSavedServices && !savedServicesError && data.services.length === 0 && (
                <div className="rounded-lg border border-dashed border-[#eeeeee] bg-white p-6 text-center">
                  <p className="text-sm font-semibold text-[#1a1c1c]">No services yet</p>
                  <p className="text-xs text-[#5f5e5e] mt-1">Pick from the suggested services above, or use “Add Service” to create your own.</p>
                </div>
              )}

              <AnimatePresence>
                {/* {showSavedServices && data.services.map( */}
                {showSavedServices && visibleServices.map((s) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={s.id}
                    className={`bg-white border border-[#eeeeee] rounded-lg p-5 shadow-sm flex flex-col gap-4 group hover:border-[#ac0053]/40 transition-colors ${s.status && s.status !== 'active' ? 'opacity-65' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {(s.media?.iconUrl || s.media?.imageUrl) && (
                          <img src={s.media.iconUrl || s.media.imageUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
                        )}
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base sm:text-lg font-bold text-[#1a1c1c] break-words">
                              {localizedName(s.name, s.translations, locale)}
                            </h4>
                            {s.featured && <span className="bg-[#ffd9e1] text-[#3f001a] font-medium text-[10px] px-2 py-0.5 rounded-full">Featured</span>}
                            {s.promotionalBadge && <span className="bg-[#fff1f4] text-[#8e0045] border border-[#f8c8dc] font-semibold text-[10px] px-2 py-0.5 rounded-full">{s.promotionalBadge}</span>}
                            {s.status === 'inactive' && <span className="bg-gray-100 text-gray-600 font-medium text-[10px] px-2 py-0.5 rounded-full">Inactive</span>}
                            {s.status === 'archived' && <span className="bg-amber-50 text-amber-700 font-medium text-[10px] px-2 py-0.5 rounded-full">Archived</span>}
                            {s.businessId && !s.predefinedServiceId && <span className="bg-[#f1f5ff] text-[#31456a] font-medium text-[10px] px-2 py-0.5 rounded-full">Custom</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[#5f5e5e]">
                            <span className="font-semibold text-[#1a1c1c]">₹{s.price.toLocaleString('en-IN')}</span>
                            <span>•</span>
                            <span>{s.duration} min</span>
                            <span>•</span>
                            <span className="italic">{s.category}</span>
                          </div>
                          <p className="text-sm text-[#565755] mt-1 break-words">{s.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                        {s.businessId && (
                          <>
                            <button onClick={() => beginEditService(s)} disabled={managingServiceId === s.id} title="Edit Service" className="min-h-11 min-w-11 p-2 text-[#5f5e5e] hover:text-[#ac0053] hover:bg-[#f9f9f9] rounded-full">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleToggleSavedService(s)} disabled={managingServiceId === s.id} title={s.status === 'active' ? 'Deactivate Service' : 'Activate Service'} className="min-h-11 min-w-11 p-2 text-[#5f5e5e] hover:text-[#ac0053] hover:bg-[#f9f9f9] rounded-full">
                              <Power className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDuplicateService(s)} title="Duplicate" className="min-h-11 min-w-11 p-2 text-[#5f5e5e] hover:text-[#ac0053] hover:bg-[#f9f9f9] rounded-full">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => (s.businessId ? setPendingDeleteServiceId(s.id) : handleDeleteService(s))} disabled={managingServiceId === s.id} title="Delete Service" className="min-h-11 min-w-11 p-2 text-[#5f5e5e] hover:text-red-600 hover:bg-red-50 rounded-full">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {pendingDeleteServiceId === s.id && s.businessId && isDatabaseCatalogTheme(theme) && (
                      <ServiceDeleteGuard
                        serviceId={s.id}
                        serviceName={s.name}
                        onCancel={() => setPendingDeleteServiceId(null)}
                        onDelete={() => handleDeleteService(s)}
                        onArchive={() => {
                          setPendingDeleteServiceId(null);
                          setData((previous) => ({
                            ...previous,
                            services: previous.services.map((item) =>
                              item.id === s.id ? { ...item, status: 'archived' } : item
                            ),
                          }));
                        }}
                      />
                    )}
                    {pendingDeleteServiceId === s.id && !s.businessId && (
                      <div className="border-t border-[#eeeeee] pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <p className="text-xs text-[#5f5e5e]">The global predefined service stays available in the catalog for all salons.</p>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setPendingDeleteServiceId(null)} className="min-h-11 px-3 py-1.5 text-xs font-semibold border rounded-lg">Cancel</button>
                          <button type="button" onClick={() => handleDeleteService(s)} className="min-h-11 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg">Delete</button>
                        </div>
                      </div>
                    )}
                    {editingServiceId === s.id && (
                      <div className="border-t border-[#eeeeee] pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1a1c1c] mb-1">Service Name</label>
                          <input value={editServiceName} onChange={(event) => setEditServiceName(event.target.value)} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1a1c1c] mb-1">Status</label>
                          <select value={editServiceStatus} onChange={(event) => setEditServiceStatus(event.target.value as SavedServiceStatus)} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1a1c1c] mb-1">Price (₹)</label>
                          <input type="number" min="0" value={editServicePrice} onChange={(event) => setEditServicePrice(Number(event.target.value))} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1a1c1c] mb-1">Duration (mins)</label>
                          <input type="number" min="1" value={editServiceDuration} onChange={(event) => setEditServiceDuration(Number(event.target.value))} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-[#1a1c1c] mb-1">Description</label>
                          <textarea value={editServiceDescription} onChange={(event) => setEditServiceDescription(event.target.value)} rows={2} className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053] resize-none" />
                        </div>
                        {s.businessId && isDatabaseCatalogTheme(theme) && (
                          <>
                            <div className="md:col-span-2 space-y-2">
                              <p className="text-[11px] font-semibold text-[#1a1c1c]">Hindi translation (stored separately)</p>
                              <input value={editHindiName} onChange={(event) => setEditHindiName(event.target.value)} placeholder="हिन्दी नाम" className="w-full px-3 py-2 min-h-11 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                              <textarea value={editHindiDescription} onChange={(event) => setEditHindiDescription(event.target.value)} placeholder="हिन्दी विवरण" rows={2} className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053] resize-none" />
                              <button type="button" onClick={() => handleSaveHindiTranslation(s)} className="min-h-11 px-3 py-1.5 border border-[#eeeeee] rounded-lg text-[11px] font-semibold text-[#ac0053]">Save Hindi copy</button>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <p className="text-[11px] font-semibold text-[#1a1c1c]">Service media (this salon + theme only)</p>
                              <ServiceMediaEditor media={s.media} disabled={managingServiceId === s.id} onUpload={(kind, url) => handleServiceMediaUpload(s, kind, url)} onRemove={(kind) => handleServiceMediaRemove(s, kind)} />
                            </div>
                          </>
                        )}
                        <div className="md:col-span-2 flex items-center justify-end gap-2">
                          {/* AUTOSAVE STATUS — the canonical `services` row is
                              written automatically; this only reports it. */}
                          <span
                            className={`mr-auto text-[11px] font-semibold ${
                              serviceAutosave.status === 'saved'
                                ? 'text-emerald-600'
                                : serviceAutosave.status === 'saving'
                                  ? 'text-[#ac0053]'
                                  : serviceAutosave.status === 'error'
                                    ? 'text-red-600'
                                    : 'text-[#8a8989]'
                            }`}
                            aria-live="polite"
                          >
                            {serviceAutosave.status === 'saving'
                              ? 'Autosaving…'
                              : serviceAutosave.status === 'saved'
                                ? 'Autosaved ✓'
                                : serviceAutosave.status === 'error'
                                  ? 'Autosave failed — use Save Changes'
                                  : 'Autosave on'}
                          </span>
                          <button type="button" onClick={() => setEditingServiceId(null)} className="min-h-11 px-4 py-2 border border-[#eeeeee] rounded-lg text-xs font-semibold text-[#5f5e5e]">Cancel</button>
                          <button type="button" onClick={() => handleUpdateSavedService(s)} disabled={managingServiceId === s.id || !editServiceName.trim()} className="min-h-11 px-4 py-2 bg-[#ac0053] text-white rounded-lg text-xs font-semibold disabled:opacity-40">
                            {managingServiceId === s.id ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isAddingService ? (
                <form onSubmit={handleCreateService} className="bg-white border-2 border-[#ac0053] rounded-lg p-5 shadow-md space-y-4">
                  <div className="flex justify-between items-center border-b border-[#eeeeee] pb-3">
                    <h4 className="font-bold text-[#1a1c1c]">Add New Service</h4>
                    <button type="button" onClick={closeAddServiceForm} className="min-h-11 min-w-11 text-[#5f5e5e]"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Category</label>
                      <select value={newServiceCategory} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]">
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Service Name</label>
                      <div className="relative" ref={serviceComboRef}>
                        <Search className="w-4 h-4 text-[#5f5e5e] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="text" required value={newServiceName} onChange={(e) => handleServiceNameInput(e.target.value)} onFocus={() => setServiceDropdownOpen(true)} placeholder={customService ? 'Type your custom service name' : `Search ${themeDisplayName} services…`} className="w-full min-h-11 pl-9 pr-9 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                        {serviceDropdownOpen && (
                          <div className="absolute z-30 mt-1 w-full bg-white border border-[#eeeeee] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredServices.map((s) => (
                              <button type="button" key={s.name} onClick={() => selectPredefined(s)} className="w-full min-h-11 text-left px-3 py-2.5 hover:bg-[#fff1f4] flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-[#1a1c1c] break-words">{s.name}</span>
                                <span className="text-xs text-[#5f5e5e] whitespace-nowrap">₹{s.price.toLocaleString('en-IN')}</span>
                              </button>
                            ))}
                            <button type="button" onClick={enableCustom} className="w-full min-h-11 text-left px-3 py-2.5 text-sm font-semibold text-[#ac0053] hover:bg-[#fff1f4]">Other / Custom Service</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Price (₹)</label>
                      <input type="number" required value={newServicePrice} onChange={(e) => setNewServicePrice(Number(e.target.value))} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Duration (mins)</label>
                      <input type="number" required value={newServiceDuration} onChange={(e) => setNewServiceDuration(Number(e.target.value))} className="w-full min-h-11 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]" />
                    </div>
                  </div>
                  <textarea value={newServiceDesc} onChange={(e) => handleServiceDescChange(e.target.value)} rows={2} className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053] resize-none" />
                  {addServiceError && <p className="text-xs text-red-600" role="alert">{addServiceError}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={closeAddServiceForm} className="min-h-11 px-4 py-2 text-sm text-[#5f5e5e]">Cancel</button>
                    <button type="submit" disabled={isCreatingService || !newServiceName.trim() || currentCatalogLoading} className="min-h-11 px-5 py-2 text-sm bg-[#ac0053] text-white font-semibold rounded-lg disabled:opacity-40">{isCreatingService ? 'Saving…' : 'Save Service'}</button>
                  </div>
                </form>
              ) : (
                <button onClick={handleOpenAddService} className="flex items-center justify-center gap-2 w-full min-h-11 py-4 border border-dashed border-[#5f5e5e] hover:border-[#ac0053] hover:text-[#ac0053] text-[#5f5e5e] rounded-lg text-sm font-semibold bg-white">
                  <Plus className="w-5 h-5" /> Add Service
                </button>
              )}
            </div>

            {usesDatabaseCatalog && activeCatalog && showSavedServices && (
              <>
                <hr className="border-[#eeeeee]" />
                <CommerceManager
                  themeId={theme}
                  services={data.services}
                  bundles={data.packages}
                  offers={data.offers ?? []}
                  categories={activeCatalog.categories}
                  predefinedServices={activeCatalog.predefinedServices}
                  loading={commerceLoading}
                  error={commerceError}
                  onRefresh={reloadCommerce}
                />
                <ServiceAuditLog themeId={theme} />
              </>
            )}
          </motion.div>
        </div>

        <div className="fixed bottom-0 left-0 w-full z-50 bg-white border-t border-[#eeeeee] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4">
          <div className="max-w-screen-2xl mx-auto flex justify-between items-center px-4 md:px-8">
            <button onClick={onPrev} className="min-h-11 text-sm font-semibold text-[#5f5e5e] flex items-center gap-2 py-2 px-4 rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={onNext} className="min-h-11 bg-[#ac0053] hover:bg-[#ba005b] text-white text-sm font-semibold flex items-center gap-2 px-8 py-3 rounded-lg">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="hidden md:block w-[45%] h-full min-w-0">
        <PreviewPane data={data} step={3} />
      </div>
    </div>
  );
}
