import { RefreshCcw, WifiOff } from 'lucide-react';

interface Props {
  /** The canonical slug that could not be checked (never a default tenant). */
  slug?: string;
}

/**
 * Shown when the public salon directory could NOT be reached — an offline
 * browser, an RPC/permission error or a 5xx from Supabase.
 *
 * This is deliberately a different screen from `NotFound`: a failed lookup is
 * not evidence that the salon does not exist, so telling the visitor "Salon
 * Not Found" (or silently rendering some default tenant) would be wrong. The
 * only honest answer is "we could not check right now — retry".
 */
export default function PublicSalonUnavailable({ slug }: Props) {
  return (
    <div className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center" id="salon-unavailable-container">
        <div className="mb-8 relative inline-flex items-center justify-center">
          <div className="absolute inset-0 bg-amber-100/60 rounded-full blur-2xl w-24 h-24 -translate-y-4"></div>
          <div className="w-20 h-20 rounded-2xl bg-white border border-amber-200 shadow-lg flex items-center justify-center text-amber-600 relative z-10">
            <WifiOff size={36} strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="text-3xl font-black text-gray-950 tracking-tight mb-3">
          Salon Temporarily Unavailable
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          We couldn&apos;t reach the salon directory just now, so we can&apos;t load
          {slug ? ` /${slug}` : ' this address'} yet. This address may still be
          valid — please check your connection and try again in a moment.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            id="salon-unavailable-retry"
            onClick={() => window.location.reload()}
            className="w-full bg-[#ac0053] hover:bg-[#8e0044] text-white py-3.5 px-6 rounded-xl font-bold text-sm transition-all shadow-md shadow-[#ac0053]/10 flex items-center justify-center gap-2"
          >
            <RefreshCcw size={16} />
            <span>Try again</span>
          </button>

          <a
            href="/"
            id="salon-unavailable-home"
            className="w-full bg-white hover:bg-gray-50 text-gray-700 py-3.5 px-6 rounded-xl font-bold text-sm transition-all border border-gray-200 flex items-center justify-center gap-2"
          >
            <span>Go to Nexora</span>
          </a>
        </div>

        <div className="mt-12 text-gray-400 text-[11px] font-medium tracking-wide uppercase">
          Powered by Nexora
        </div>
      </div>
    </div>
  );
}
