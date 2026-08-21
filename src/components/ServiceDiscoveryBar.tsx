import { Search } from 'lucide-react';
import type { AppLocale } from '../lib/locale';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../lib/locale';
import type { ServiceDiscoveryQuery, ServiceSort } from '../lib/serviceSearch';

interface Props {
  query: ServiceDiscoveryQuery;
  onChange: (next: ServiceDiscoveryQuery) => void;
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  categories: string[];
}

export default function ServiceDiscoveryBar({
  query, onChange, locale, onLocaleChange, categories,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-[#eeeeee] p-4 shadow-sm flex flex-col gap-3 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#5f5e5e] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query.search}
            onChange={(event) => onChange({ ...query, search: event.target.value })}
            placeholder="Search name, description, or Hindi name…"
            className="w-full min-h-11 pl-9 pr-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]"
          />
        </div>
        <div className="flex rounded-lg border border-[#eeeeee] overflow-hidden shrink-0">
          {SUPPORTED_LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onLocaleChange(item)}
              className={`min-h-11 px-4 text-xs font-semibold ${locale === item ? 'bg-[#ac0053] text-white' : 'bg-white text-[#1a1c1c]'}`}
            >
              {LOCALE_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={query.category}
          onChange={(event) => onChange({ ...query, category: event.target.value })}
          className="min-h-11 min-w-[10rem] flex-1 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        <select
          value={query.sort}
          onChange={(event) => onChange({ ...query, sort: event.target.value as ServiceSort })}
          className="min-h-11 min-w-[10rem] flex-1 px-3 py-2 bg-[#f9f9f9] border border-[#eeeeee] rounded-lg text-sm outline-none focus:border-[#ac0053]"
        >
          <option value="default">Default order</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="duration_asc">Duration: short → long</option>
          <option value="duration_desc">Duration: long → short</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...query, suggestedOnly: !query.suggestedOnly })}
          className={`min-h-11 px-4 rounded-full border text-xs font-semibold ${query.suggestedOnly ? 'border-[#ac0053] bg-[#ffd9e1] text-[#3f001a]' : 'border-[#eeeeee] bg-[#f9f9f9]'}`}
        >
          Suggested only
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...query, activeOnly: !query.activeOnly })}
          className={`min-h-11 px-4 rounded-full border text-xs font-semibold ${query.activeOnly ? 'border-[#ac0053] bg-[#ffd9e1] text-[#3f001a]' : 'border-[#eeeeee] bg-[#f9f9f9]'}`}
        >
          Active only
        </button>
      </div>
    </div>
  );
}
