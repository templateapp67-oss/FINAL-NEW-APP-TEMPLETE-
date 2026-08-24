import type { CSSProperties } from 'react';
import { LayoutTemplate } from 'lucide-react';

interface Props {
  title: string;
  detail: string;
  background: string;
  color: string;
  accent: string;
  className?: string;
  style?: CSSProperties;
}

/** A clearly labelled design/configuration state, never a sample offering. */
export default function OwnerPreviewTemplateNotice({
  title,
  detail,
  background,
  color,
  accent,
  className = '',
  style,
}: Props) {
  return (
    <section
      data-owner-preview-placeholder="true"
      className={`site-section px-5 md:px-8 py-12 ${className}`}
      style={{ backgroundColor: background, ...style }}
    >
      <div
        className="mx-auto max-w-2xl border p-6 text-center"
        style={{ borderColor: accent, color }}
      >
        <LayoutTemplate className="mx-auto h-5 w-5" style={{ color: accent }} aria-hidden />
        <h2 className="mt-3 text-sm font-bold">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-[11px] leading-relaxed opacity-75">{detail}</p>
      </div>
    </section>
  );
}
