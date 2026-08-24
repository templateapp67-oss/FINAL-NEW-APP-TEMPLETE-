import type { Dispatch, SetStateAction } from 'react';
import { SalonData } from '../types';
import {
  activeTemplateConfigFromSalon,
  applyTemplateConfigToSalon,
  templateSupportsConfig,
} from '../lib/templateConfig';
import { SALON_NAME_COLORS, SALON_NAME_FONTS } from '../lib/brandIdentity';

interface Props {
  data: SalonData;
  setData: Dispatch<SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
}

export default function TemplateConfigPanel({ data, setData, onSave }: Props) {
  const config = activeTemplateConfigFromSalon(data);
  const supportsHeroCrop = templateSupportsConfig(data.templateId, 'heroPosition');
  const supportsOwnerPhoto = templateSupportsConfig(data.templateId, 'showOwnerPhoto');

  const update = (patch: Partial<typeof config>) => {
    setData((current) => applyTemplateConfigToSalon(current, patch));
    onSave?.('Template look updated');
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4" data-testid="template-config-panel">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#ac0053]">Template look</p>
        <h3 className="text-sm font-extrabold text-gray-900">Presentation only</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          These fields already drive the live site. Services, bookings, and staff stay unchanged.
        </p>
      </div>

      <label className="block text-xs font-semibold text-gray-700">
        Appearance
        <select
          value={config.appearance}
          onChange={(e) => update({ appearance: e.target.value === 'dark' ? 'dark' : 'light' })}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label className="block text-xs font-semibold text-gray-700">
        Accent color
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={config.accentColor}
            onChange={(e) => update({ accentColor: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded border border-gray-200"
            aria-label="Accent color"
          />
          <input
            type="text"
            value={config.accentColor}
            onChange={(e) => update({ accentColor: e.target.value })}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs"
          />
        </div>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-gray-700">Salon name font</legend>
        <div className="grid grid-cols-1 gap-1.5">
          {SALON_NAME_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => update({ salonNameFont: font.id })}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                config.salonNameFont === font.id ? 'border-[#ac0053] bg-[#ffd9e1]/30' : 'border-gray-200 bg-gray-50'
              }`}
              style={{ fontFamily: font.fontFamily, fontWeight: font.fontWeight }}
            >
              {font.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-gray-700">Salon name color</legend>
        <div className="flex flex-wrap gap-2">
          {SALON_NAME_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              onClick={() => update({ salonNameColor: color.value })}
              className={`h-8 w-8 rounded-full border-2 ${
                config.salonNameColor.toLowerCase() === color.value.toLowerCase()
                  ? 'border-gray-900'
                  : 'border-white shadow-sm'
              }`}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
      </fieldset>

      {supportsHeroCrop && (
        <label className="block text-xs font-semibold text-gray-700">
          Hero crop
          <select
            value={config.heroPosition}
            onChange={(e) => update({ heroPosition: e.target.value as typeof config.heroPosition })}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          >
            <option value="Top">Top</option>
            <option value="Center">Center</option>
            <option value="Bottom">Bottom</option>
          </select>
        </label>
      )}

      {supportsOwnerPhoto && (
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={config.showOwnerPhoto}
            onChange={(e) => update({ showOwnerPhoto: e.target.checked })}
          />
          Show owner photo on the site
        </label>
      )}

      {!supportsHeroCrop && !supportsOwnerPhoto && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          Only controls supported by this template are shown. Other template settings remain saved separately.
        </p>
      )}
    </div>
  );
}
