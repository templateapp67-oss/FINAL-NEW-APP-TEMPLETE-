/**
 * CUSTOM DOMAIN PANEL — owner-facing CNAME setup.
 *
 * Lets a tenant connect a domain they own (e.g. `www.artsbyuma.com`) to their
 * published site. The flow is intentionally two-step and server-verified:
 *
 *   1. Save the domain      → status becomes 'pending'
 *   2. Press "Verify"       → the SERVER probes DNS and flips to 'verified'
 *
 * A browser can never mark its own domain verified, and an unverified domain
 * resolves to nothing — so a tenant cannot serve their site from a hostname
 * they have not proven they control.
 *
 * Writes go through `/api/owner/custom-domain`, which scopes every mutation
 * through the owner-scoped RPCs added in migration M69.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Globe, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { authenticatedApiFetch } from '../lib/apiFetch';
import {
  customDomainStatusLabel,
  dnsInstructions,
  isReservedHost,
  isValidCustomDomain,
  normalizeCustomDomain,
  validateCustomDomain,
} from '../lib/customDomain';

interface Props {
  salonId?: string | null;
  /** Current domain from the database (server-owned, never from a cache). */
  domain?: string | null;
  status?: 'not_configured' | 'pending' | 'verified' | 'failed' | null;
  /** True once the site is published — a domain can only be connected after. */
  published: boolean;
  /** Platform host the tenant must point their DNS at. */
  target?: string;
  onChanged?: (next: { domain: string | null; status: string }) => void;
}

type Phase = 'idle' | 'saving' | 'verifying' | 'removing';

export default function CustomDomainPanel({
  salonId,
  domain,
  status,
  published,
  target,
  onChanged,
}: Props) {
  const normalized = normalizeCustomDomain(domain);
  const [draft, setDraft] = useState(normalized || '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The database is authoritative — resync whenever the server value changes.
  useEffect(() => {
    setDraft(normalizeCustomDomain(domain) || '');
  }, [domain]);

  const problems = useMemo(() => validateCustomDomain(draft), [draft]);
  const dirty = normalizeCustomDomain(draft) !== normalized;
  const canSave = problems.length === 0 && dirty && !!salonId && published && phase === 'idle';
  const canVerify = !!normalized && status !== 'verified' && !!salonId && phase === 'idle';
  const instructions = useMemo(
    () => dnsInstructions(normalized || draft, target),
    [normalized, draft, target],
  );

  const request = useCallback(
    async (path: string, body: Record<string, unknown>, nextPhase: Phase) => {
      setPhase(nextPhase);
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedApiFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(payload?.error || 'Could not update your custom domain. Please try again.');
          return null;
        }
        return payload;
      } catch {
        setError('Could not reach the server. Check your connection and try again.');
        return null;
      } finally {
        setPhase('idle');
      }
    },
    [],
  );

  const save = async () => {
    if (!salonId) return;
    const payload = await request(
      '/api/owner/custom-domain',
      { salonId, domain: draft },
      'saving',
    );
    if (!payload) return;
    setNotice(
      payload.status === 'verified'
        ? 'Custom domain connected.'
        : 'Domain saved. Add the DNS record below, then verify.',
    );
    onChanged?.({ domain: payload.domain ?? null, status: payload.status ?? 'pending' });
  };

  const verify = async () => {
    if (!salonId) return;
    const payload = await request(
      '/api/owner/custom-domain/verify',
      { salonId },
      'verifying',
    );
    if (!payload) return;
    setNotice(payload.status === 'verified' ? 'Domain verified and connected.' : payload.detail || null);
    if (payload.status !== 'verified') {
      setError(payload.detail || 'DNS check failed.');
    }
    onChanged?.({ domain: payload.domain ?? normalized ?? null, status: payload.status ?? 'failed' });
  };

  const remove = async () => {
    if (!salonId) return;
    const payload = await request(
      '/api/owner/custom-domain',
      { salonId, domain: '' },
      'removing',
    );
    if (!payload) return;
    setNotice('Custom domain removed.');
    onChanged?.({ domain: null, status: 'not_configured' });
  };

  if (!published) {
    return (
      <section
        data-testid="custom-domain-panel"
        className="rounded-2xl border border-[#eeeeee] bg-white p-5"
      >
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#1a1c1c]">
          <Globe className="w-4 h-4" /> Custom domain
        </h3>
        <p className="mt-1 text-[12px] text-[#5f5e5e]">
          Publish your website first, then connect a domain you own.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="custom-domain-panel"
      className="rounded-2xl border border-[#eeeeee] bg-white p-5"
      aria-labelledby="custom-domain-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="custom-domain-heading" className="flex items-center gap-2 text-[15px] font-bold text-[#1a1c1c]">
            <Globe className="w-4 h-4" /> Custom domain
          </h3>
          <p className="mt-0.5 text-[12px] text-[#5f5e5e]">
            Connect a domain you already own, like www.yoursalon.com.
          </p>
        </div>
        {normalized && (
          <span
            data-testid="custom-domain-status"
            className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border ${
              status === 'verified'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : status === 'failed'
                  ? 'bg-red-50 text-[#c0003a] border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {customDomainStatusLabel(status)}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          data-testid="custom-domain-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
            setNotice(null);
          }}
          placeholder="www.yoursalon.com"
          spellCheck={false}
          autoCapitalize="none"
          className="flex-1 rounded-lg border border-[#eeeeee] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#ac0053]/30"
        />
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="custom-domain-save"
            onClick={save}
            disabled={!canSave}
            className="min-h-9 px-3 rounded-lg bg-[#ac0053] text-white text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {phase === 'saving' ? 'Saving…' : normalized ? 'Update' : 'Connect'}
          </button>
          {canVerify && (
            <button
              type="button"
              data-testid="custom-domain-verify"
              onClick={verify}
              className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-[#eeeeee] text-[12px] font-semibold text-[#1a1c1c]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${phase === 'verifying' ? 'animate-spin' : ''}`} />
              {phase === 'verifying' ? 'Checking…' : 'Verify'}
            </button>
          )}
          {normalized && (
            <button
              type="button"
              data-testid="custom-domain-remove"
              onClick={remove}
              aria-label="Remove custom domain"
              className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-lg border border-[#eeeeee] text-[#b0003a]"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {problems.length > 0 && draft.trim().length > 0 && (
        <p
          role="alert"
          data-testid="custom-domain-error"
          className="mt-2 flex items-center gap-1.5 text-[12px] text-[#c0003a]"
        >
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {problems[0].message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          data-testid="custom-domain-error"
          className="mt-2 flex items-center gap-1.5 text-[12px] text-[#c0003a]"
        >
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {notice && !error && (
        <p
          data-testid="custom-domain-notice"
          className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-700"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {notice}
        </p>
      )}

      {normalized && status !== 'verified' && instructions && (
        <div
          data-testid="custom-domain-dns"
          className="mt-4 rounded-xl border border-dashed border-[#dddddd] bg-[#fafafa] p-3"
        >
          <p className="text-[12px] font-semibold text-[#1a1c1c] mb-1">
            Add this DNS record at your domain provider
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-mono">
            <dt className="text-[#8a8a8a]">Type</dt>
            <dd data-testid="dns-type" className="text-[#1a1c1c]">{instructions.type}</dd>
            <dt className="text-[#8a8a8a]">Name</dt>
            <dd data-testid="dns-host" className="text-[#1a1c1c]">{instructions.host}</dd>
            <dt className="text-[#8a8a8a]">Value</dt>
            <dd data-testid="dns-value" className="text-[#1a1c1c] break-all">{instructions.value}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-[#8a8a8a]">
            Alternatively add a TXT record <span className="font-mono">nexora-verify={salonId}</span>.
            DNS changes can take up to 48 hours to spread.
          </p>
        </div>
      )}

      {normalized && status === 'verified' && (
        <p className="mt-3 text-[12px] text-[#5f5e5e]">
          Visitors to{' '}
          <a
            href={`https://${normalized}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#ac0053] hover:underline"
          >
            {normalized}
          </a>{' '}
          now see your website.
        </p>
      )}
    </section>
  );
}
