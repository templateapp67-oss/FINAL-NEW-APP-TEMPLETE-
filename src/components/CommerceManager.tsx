import { useMemo, useState } from 'react';
import { Gift, Layers3, Plus, Power, Tags, Trash2, X } from 'lucide-react';
import type { Package, Service, ServiceOffer } from '../types';
import type {
  ThemeCatalogCategory,
  ThemeCatalogPredefinedService,
} from '../lib/themeCatalogService';
import type { DatabaseCatalogThemeId } from '../lib/themeCatalogService';
import {
  createServiceBundle,
  createServiceOffer,
  deletePricingVariant,
  deleteServiceOffer,
  savePricingVariant,
  setServiceBundleStatus,
  setServiceOfferActive,
  setServicePromotionalBadge,
} from '../lib/pricingPromotionService';
import { formatCurrency, PROMOTIONAL_BADGES, todayDateKey } from '../lib/pricing';

interface Props {
  themeId: DatabaseCatalogThemeId;
  services: Service[];
  bundles: Package[];
  offers: ServiceOffer[];
  categories: ThemeCatalogCategory[];
  predefinedServices: ThemeCatalogPredefinedService[];
  loading?: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
}

const fieldClass = 'w-full px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-xs outline-none focus:border-[#ac0053]';
const labelClass = 'block text-[11px] font-semibold text-[#1a1c1c] mb-1';

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return todayDateKey(date);
};

export default function CommerceManager({
  themeId,
  services,
  bundles,
  offers,
  categories,
  predefinedServices,
  loading,
  error: loadError,
  onRefresh,
}: Props) {
  const activeServices = services.filter((service) => service.status !== 'archived');
  const [openPricingServiceId, setOpenPricingServiceId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState(0);
  const [variantDuration, setVariantDuration] = useState(30);
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [bundleDescription, setBundleDescription] = useState('');
  const [bundleCategoryId, setBundleCategoryId] = useState(categories[0]?.id ?? '');
  const [bundleServiceIds, setBundleServiceIds] = useState<string[]>([]);
  const [bundleDiscountType, setBundleDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [bundleDiscount, setBundleDiscount] = useState(15);
  const [bundleBadge, setBundleBadge] = useState('Best Seller');
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerTitle, setOfferTitle] = useState('Festive Special');
  const [offerBadge, setOfferBadge] = useState('20% OFF');
  const [offerTargetType, setOfferTargetType] = useState<ServiceOffer['targetType']>('theme');
  const [offerTargetId, setOfferTargetId] = useState('');
  const [offerDiscountType, setOfferDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [offerDiscount, setOfferDiscount] = useState(20);
  const [offerStartDate, setOfferStartDate] = useState(todayDateKey());
  const [offerEndDate, setOfferEndDate] = useState(inDays(30));
  const [offerActive, setOfferActive] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [actionError, setActionError] = useState('');

  const selectedBundleServices = activeServices.filter((service) => bundleServiceIds.includes(service.id));
  const bundleSubtotal = selectedBundleServices.reduce((total, service) => total + service.price, 0);
  const bundleFinal = Math.max(0, bundleDiscountType === 'percentage'
    ? bundleSubtotal * (1 - bundleDiscount / 100)
    : bundleSubtotal - bundleDiscount);

  const customServices = activeServices.filter((service) => !service.predefinedServiceId);
  const targetOptions = useMemo(() => {
    switch (offerTargetType) {
      case 'theme': return [];
      case 'category': return categories.map((item) => ({ id: item.id, name: item.name }));
      case 'predefined_service': return predefinedServices.map((item) => ({ id: item.id, name: item.name }));
      case 'saved_service': return customServices.map((item) => ({ id: item.id, name: item.name }));
      case 'bundle': return bundles.map((item) => ({ id: item.id, name: item.name }));
    }
  }, [offerTargetType, categories, predefinedServices, customServices, bundles]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setActionError('');
    try {
      await action();
      await onRefresh();
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to save this change.');
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const saveVariant = async (service: Service) => {
    const saved = await run(`variant-${service.id}`, () => savePricingVariant(themeId, {
      serviceId: service.id,
      name: variantName,
      price: variantPrice,
      duration: variantDuration,
      status: 'active',
    }));
    if (saved) {
      setVariantName('');
      setVariantPrice(0);
      setVariantDuration(service.duration);
    }
  };

  const saveBundle = async () => {
    const saved = await run('bundle-create', () => createServiceBundle(themeId, {
      categoryId: bundleCategoryId || null,
      name: bundleName,
      description: bundleDescription || 'A value bundle of our most-loved services.',
      serviceIds: bundleServiceIds,
      discountType: bundleDiscountType,
      discountValue: bundleDiscount,
      promotionalBadge: bundleBadge,
      status: 'active',
    }));
    if (saved) {
      setShowBundleForm(false);
      setBundleName('');
      setBundleDescription('');
      setBundleServiceIds([]);
    }
  };

  const saveOffer = async () => {
    const saved = await run('offer-create', () => createServiceOffer(themeId, {
      targetType: offerTargetType,
      categoryId: offerTargetType === 'category' ? offerTargetId : null,
      predefinedServiceId: offerTargetType === 'predefined_service' ? offerTargetId : null,
      savedServiceId: offerTargetType === 'saved_service' ? offerTargetId : null,
      packageId: offerTargetType === 'bundle' ? offerTargetId : null,
      title: offerTitle,
      promotionalBadge: offerBadge,
      discountType: offerDiscountType,
      discountValue: offerDiscount,
      startDate: offerStartDate,
      endDate: offerEndDate,
      status: offerActive ? 'active' : 'inactive',
    }));
    if (saved) {
      setShowOfferForm(false);
      setOfferTargetType('theme');
      setOfferTargetId('');
    }
  };

  return (
    <div className="space-y-8 pb-24" data-testid="phase-9-commerce-manager">
      <div className="rounded-xl border border-[#eadde3] bg-[#fffafb] p-5">
        <div className="flex items-start gap-3">
          <Tags className="w-5 h-5 text-[#ac0053] mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-[#1a1c1c]">Pricing &amp; promotions</h3>
            <p className="text-xs text-[#5f5e5e] mt-1">Theme-safe pricing options, badges, dated offers and service bundles. Base service links stay unchanged.</p>
          </div>
        </div>
        {loading && <p className="text-xs text-[#5f5e5e] mt-3">Loading pricing and promotions…</p>}
        {(loadError || actionError) && <p className="text-xs text-red-600 mt-3" role="alert">{actionError || loadError}</p>}
      </div>

      {/* Variable pricing and standalone promotional badges */}
      <section className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold tracking-wider text-[#5f5e5e] uppercase">VARIABLE PRICING &amp; BADGES</h3>
          <p className="text-xs text-[#5f5e5e] mt-1">Add Short / Medium / Long, Junior / Senior or any custom variant without replacing the base service.</p>
        </div>
        {activeServices.length === 0 && (
          <div className="border border-dashed border-[#eeeeee] rounded-lg bg-white p-5 text-xs text-[#5f5e5e]">Save a service before adding variants or badges.</div>
        )}
        {activeServices.map((service) => {
          const expanded = openPricingServiceId === service.id;
          return (
            <div key={service.id} className="bg-white border border-[#eeeeee] rounded-lg p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-[#1a1c1c]">{service.name}</h4>
                    {service.promotionalBadge && <span className="rounded-full bg-[#fff1f4] text-[#8e0045] px-2 py-0.5 text-[9px] font-bold">{service.promotionalBadge}</span>}
                  </div>
                  <p className="text-[11px] text-[#5f5e5e] mt-1">Base {formatCurrency(service.price)} · {service.pricingVariants?.length ?? 0} options · {service.category}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenPricingServiceId(expanded ? null : service.id);
                    setVariantDuration(service.duration);
                  }}
                  className="px-3 py-2 rounded-lg border border-[#eeeeee] text-xs font-semibold text-[#ac0053] hover:bg-[#fff1f4]"
                >
                  {expanded ? 'Close' : 'Manage pricing'}
                </button>
              </div>
              {expanded && (
                <div className="mt-4 pt-4 border-t border-[#eeeeee] space-y-4">
                  <div>
                    <label className={labelClass}>Promotional badge</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => run(`badge-${service.id}`, () => setServicePromotionalBadge(service.id, ''))}
                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold border ${!service.promotionalBadge ? 'border-[#ac0053] bg-[#fff1f4] text-[#ac0053]' : 'border-[#eeeeee]'}`}
                      >None</button>
                      {PROMOTIONAL_BADGES.map((badge) => (
                        <button
                          type="button"
                          key={badge}
                          disabled={busyKey === `badge-${service.id}`}
                          onClick={() => run(`badge-${service.id}`, () => setServicePromotionalBadge(service.id, badge))}
                          className={`rounded-full px-3 py-1.5 text-[10px] font-semibold border ${service.promotionalBadge === badge ? 'border-[#ac0053] bg-[#fff1f4] text-[#ac0053]' : 'border-[#eeeeee]'}`}
                        >{badge}</button>
                      ))}
                    </div>
                  </div>
                  {(service.pricingVariants ?? []).map((variant) => (
                    <div key={variant.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f9f9f9] border border-[#eeeeee] p-3">
                      <div>
                        <p className="text-xs font-bold text-[#1a1c1c]">{variant.name}</p>
                        <p className="text-[10px] text-[#5f5e5e]">{formatCurrency(variant.price)} · {variant.duration ?? service.duration} min · {variant.status}</p>
                      </div>
                      <button type="button" title="Delete pricing option" onClick={() => run(`variant-delete-${variant.id}`, () => deletePricingVariant(variant.id))} className="p-2 rounded-full text-[#5f5e5e] hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                    <div><label className={labelClass}>Variant</label><input value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="e.g. Long Hair" className={fieldClass} /></div>
                    <div><label className={labelClass}>Price (₹)</label><input type="number" min="0" value={variantPrice} onChange={(event) => setVariantPrice(Number(event.target.value))} className={fieldClass} /></div>
                    <div><label className={labelClass}>Minutes</label><input type="number" min="1" value={variantDuration} onChange={(event) => setVariantDuration(Number(event.target.value))} className={fieldClass} /></div>
                    <button type="button" disabled={!variantName.trim() || busyKey === `variant-${service.id}`} onClick={() => saveVariant(service)} className="px-4 py-2 rounded-lg bg-[#ac0053] text-white text-xs font-semibold disabled:opacity-40">Add option</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Theme/category validated bundles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-xs font-semibold tracking-wider text-[#5f5e5e] uppercase">COMBO / BUNDLE SERVICES</h3><p className="text-xs text-[#5f5e5e] mt-1">Individual prices are snapshotted and the final price is calculated from the discount.</p></div>
          <button type="button" onClick={() => setShowBundleForm(true)} className="px-3 py-2 rounded-lg bg-[#ac0053] text-white text-xs font-semibold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New bundle</button>
        </div>
        {bundles.map((bundle) => (
          <div key={bundle.id} className={`bg-white border border-[#eeeeee] rounded-lg p-4 ${bundle.status !== 'active' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold">{bundle.name}</h4>{bundle.promotionalBadge && <span className="rounded-full bg-[#fff1f4] text-[#8e0045] px-2 py-0.5 text-[9px] font-bold">{bundle.promotionalBadge}</span>}</div>
                <p className="text-[11px] text-[#5f5e5e] mt-1">{bundle.includedServices?.map((item) => `${item.name} (${formatCurrency(item.individualPrice)})`).join(' + ')}</p>
                <p className="text-xs mt-2"><span className="line-through text-[#5f5e5e]">{formatCurrency(bundle.originalPrice ?? bundle.price)}</span> <span className="font-bold text-emerald-700 ml-1">{formatCurrency(bundle.price)}</span> · {bundle.status}</p>
              </div>
              <button type="button" title={bundle.status === 'active' ? 'Deactivate bundle' : 'Activate bundle'} onClick={() => run(`bundle-${bundle.id}`, () => setServiceBundleStatus(bundle.id, bundle.status === 'active' ? 'inactive' : 'active'))} className="p-2 rounded-full hover:bg-[#fff1f4] text-[#ac0053]"><Power className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {showBundleForm && (
          <div className="bg-white border-2 border-[#ac0053] rounded-lg p-5 space-y-4">
            <div className="flex justify-between"><div className="flex items-center gap-2"><Layers3 className="w-4 h-4 text-[#ac0053]" /><h4 className="text-sm font-bold">Create service bundle</h4></div><button type="button" onClick={() => setShowBundleForm(false)}><X className="w-4 h-4" /></button></div>
            <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Bundle name</label><input value={bundleName} onChange={(event) => setBundleName(event.target.value)} placeholder="e.g. Grooming Combo" className={fieldClass} /></div><div><label className={labelClass}>Category</label><select value={bundleCategoryId} onChange={(event) => setBundleCategoryId(event.target.value)} className={fieldClass}><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div>
            <div><label className={labelClass}>Included services (choose at least 2)</label><div className="grid sm:grid-cols-2 gap-2">{activeServices.map((service) => <label key={service.id} className="flex items-center gap-2 border border-[#eeeeee] rounded-lg p-2.5 text-xs"><input type="checkbox" checked={bundleServiceIds.includes(service.id)} onChange={() => setBundleServiceIds((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])} /> <span className="flex-1">{service.name}</span><span className="font-semibold">{formatCurrency(service.price)}</span></label>)}</div></div>
            <div className="grid sm:grid-cols-3 gap-3"><div><label className={labelClass}>Discount type</label><select value={bundleDiscountType} onChange={(event) => setBundleDiscountType(event.target.value as 'percentage' | 'fixed')} className={fieldClass}><option value="percentage">Percentage</option><option value="fixed">Fixed (₹)</option></select></div><div><label className={labelClass}>Discount</label><input type="number" min="0" value={bundleDiscount} onChange={(event) => setBundleDiscount(Number(event.target.value))} className={fieldClass} /></div><div><label className={labelClass}>Badge</label><select value={bundleBadge} onChange={(event) => setBundleBadge(event.target.value)} className={fieldClass}>{PROMOTIONAL_BADGES.map((badge) => <option key={badge}>{badge}</option>)}</select></div></div>
            <div><label className={labelClass}>Description</label><textarea rows={2} value={bundleDescription} onChange={(event) => setBundleDescription(event.target.value)} className={fieldClass} /></div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex justify-between text-xs"><span>Individual total: <strong>{formatCurrency(bundleSubtotal)}</strong></span><span>Final bundle price: <strong className="text-emerald-700">{formatCurrency(bundleFinal)}</strong></span></div>
            <div className="flex justify-end"><button type="button" disabled={!bundleName.trim() || bundleServiceIds.length < 2 || bundleDiscount <= 0 || busyKey === 'bundle-create'} onClick={saveBundle} className="px-5 py-2 rounded-lg bg-[#ac0053] text-white text-xs font-semibold disabled:opacity-40">Save bundle</button></div>
          </div>
        )}
      </section>

      {/* Dated offers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-xs font-semibold tracking-wider text-[#5f5e5e] uppercase">OFFERS &amp; SEASONAL PROMOTIONS</h3><p className="text-xs text-[#5f5e5e] mt-1">Theme/category/service/custom-service/bundle targeting. Ended offers expire automatically.</p></div>
          <button type="button" onClick={() => setShowOfferForm(true)} className="px-3 py-2 rounded-lg bg-[#ac0053] text-white text-xs font-semibold flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> New offer</button>
        </div>
        {offers.map((offer) => (
          <div key={offer.id} className={`bg-white border border-[#eeeeee] rounded-lg p-4 ${offer.effectiveStatus !== 'active' ? 'opacity-65' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold">{offer.title}</h4><span className="rounded-full bg-[#fff1f4] text-[#8e0045] px-2 py-0.5 text-[9px] font-bold">{offer.promotionalBadge}</span><span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[9px] font-bold capitalize">{offer.effectiveStatus}</span></div><p className="text-[11px] text-[#5f5e5e] mt-1 capitalize">{offer.targetType.replaceAll('_', ' ')} · {offer.discountType === 'percentage' ? `${offer.discountValue}%` : formatCurrency(offer.discountValue)} off · {offer.startDate} to {offer.endDate}</p></div>
              <div className="flex gap-1"><button type="button" title={offer.status === 'active' ? 'Deactivate offer' : 'Activate offer'} onClick={() => run(`offer-status-${offer.id}`, () => setServiceOfferActive(offer.id, offer.status !== 'active'))} className="p-2 rounded-full hover:bg-[#fff1f4] text-[#ac0053]"><Power className="w-4 h-4" /></button><button type="button" title="Delete offer" onClick={() => run(`offer-delete-${offer.id}`, () => deleteServiceOffer(offer.id))} className="p-2 rounded-full hover:bg-red-50 text-[#5f5e5e] hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>
            </div>
          </div>
        ))}
        {showOfferForm && (
          <div className="bg-white border-2 border-[#ac0053] rounded-lg p-5 space-y-4">
            <div className="flex justify-between"><div className="flex items-center gap-2"><Gift className="w-4 h-4 text-[#ac0053]" /><h4 className="text-sm font-bold">Create seasonal offer</h4></div><button type="button" onClick={() => setShowOfferForm(false)}><X className="w-4 h-4" /></button></div>
            <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Offer title</label><input value={offerTitle} onChange={(event) => setOfferTitle(event.target.value)} placeholder="e.g. Diwali Spa Package" className={fieldClass} /></div><div><label className={labelClass}>Promotional badge</label><input list="promotion-badges" value={offerBadge} onChange={(event) => setOfferBadge(event.target.value)} className={fieldClass} /><datalist id="promotion-badges">{PROMOTIONAL_BADGES.map((badge) => <option key={badge} value={badge} />)}</datalist></div></div>
            <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Linked to</label><select value={offerTargetType} onChange={(event) => { setOfferTargetType(event.target.value as ServiceOffer['targetType']); setOfferTargetId(''); }} className={fieldClass}><option value="theme">Entire theme</option><option value="category">Category</option><option value="predefined_service">Predefined service</option><option value="saved_service">Saved custom service</option><option value="bundle">Combo / bundle</option></select></div>{offerTargetType !== 'theme' && <div><label className={labelClass}>Target</label><select value={offerTargetId} onChange={(event) => setOfferTargetId(event.target.value)} className={fieldClass}><option value="">Select target</option>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>{targetOptions.length === 0 && <p className="text-[10px] text-amber-700 mt-1">Create or save an eligible target first.</p>}</div>}</div>
            <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Discount type</label><select value={offerDiscountType} onChange={(event) => setOfferDiscountType(event.target.value as 'percentage' | 'fixed')} className={fieldClass}><option value="percentage">Percentage</option><option value="fixed">Fixed (₹)</option></select></div><div><label className={labelClass}>{offerDiscountType === 'percentage' ? 'Discount (%)' : 'Fixed discount (₹)'}</label><input type="number" min="0" value={offerDiscount} onChange={(event) => setOfferDiscount(Number(event.target.value))} className={fieldClass} /></div></div>
            <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Start date</label><input type="date" value={offerStartDate} onChange={(event) => setOfferStartDate(event.target.value)} className={fieldClass} /></div><div><label className={labelClass}>End date</label><input type="date" min={offerStartDate} value={offerEndDate} onChange={(event) => setOfferEndDate(event.target.value)} className={fieldClass} /></div></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={offerActive} onChange={(event) => setOfferActive(event.target.checked)} /> Activate this offer immediately when its date range begins</label>
            <div className="flex justify-end"><button type="button" disabled={!offerTitle.trim() || !offerBadge.trim() || offerDiscount <= 0 || offerEndDate < offerStartDate || (offerTargetType !== 'theme' && !offerTargetId) || busyKey === 'offer-create'} onClick={saveOffer} className="px-5 py-2 rounded-lg bg-[#ac0053] text-white text-xs font-semibold disabled:opacity-40">Save offer</button></div>
          </div>
        )}
      </section>
    </div>
  );
}
