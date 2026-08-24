import React, { useState } from 'react';
import { SalonData } from '../types';
import { ThemeId } from '../lib/themeServices';
import { THEME_LABELS, normalizeThemeId } from '../lib/templateConfig';
import ThemeSelector from './ThemeSelector';
import { Layout, Sparkles } from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => void;
}

export default function TemplateSelectionDashboard({ data, setData, onSave, onThemeChange }: Props) {
  const currentTemplate = normalizeThemeId(data.templateId);
  const [previewId, setPreviewId] = useState<ThemeId | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053] mb-1">
            <Layout className="w-4 h-4" /> Template & Theme Selection
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Active Website Theme</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Preview all five Nexora templates, then apply one. Switching never creates another salon.
          </p>
        </div>
        <div
          data-testid="dashboard-active-template"
          className="flex items-center gap-2 bg-[#ffd9e1]/20 text-[#ac0053] px-3.5 py-1.5 rounded-xl border border-[#ffd9e1]/50 text-xs font-bold"
        >
          <Sparkles className="w-4 h-4" />
          {THEME_LABELS[currentTemplate]}
        </div>
      </div>

      <ThemeSelector
        data={data}
        setData={setData}
        onSave={onSave}
        onThemeChange={onThemeChange}
        onPreview={setPreviewId}
        previewId={previewId}
        layout="grid"
      />
    </div>
  );
}
