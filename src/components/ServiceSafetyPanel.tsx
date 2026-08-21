import { useEffect, useState } from 'react';
import type { DatabaseCatalogThemeId } from '../lib/themeCatalogService';
import {
  archiveSavedService,
  loadServiceSafetyLock,
  loadThemeServiceAudit,
  type ServiceAuditEntry,
  type ServiceSafetyLock,
} from '../lib/serviceSafetyService';

interface SafetyProps {
  serviceId: string;
  serviceName: string;
  onArchive: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function ServiceDeleteGuard({ serviceId, serviceName, onArchive, onCancel, onDelete }: SafetyProps) {
  const [lock, setLock] = useState<ServiceSafetyLock | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadServiceSafetyLock(serviceId)
      .then((result) => { if (!cancelled) setLock(result); })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to check bookings.');
      });
    return () => { cancelled = true; };
  }, [serviceId]);

  const archive = async () => {
    setBusy(true);
    try {
      await archiveSavedService(serviceId);
      onArchive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-[#eeeeee] pt-4 space-y-3">
      {lock?.locked ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3" role="alert">
          <span className="font-semibold">{serviceName}</span> has {lock.upcomingAppointments} upcoming appointment(s), {lock.activeBookings} active booking(s), and {lock.pendingTransactions} pending transaction(s).
          It cannot be deleted or silently deactivated. Archive it so existing appointments stay intact.
        </p>
      ) : (
        <p className="text-xs text-[#5f5e5e]">
          Delete <span className="font-semibold text-[#1a1c1c]">{serviceName}</span> from your salon’s services? The theme’s predefined service stays available.
        </p>
      )}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 px-3 py-1.5 text-xs font-semibold text-[#5f5e5e] bg-white border border-[#eeeeee] rounded-lg">Cancel</button>
        {lock?.locked ? (
          <button type="button" onClick={archive} disabled={busy} className="min-h-11 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 rounded-lg disabled:opacity-40">
            {busy ? 'Archiving…' : 'Archive safely'}
          </button>
        ) : (
          <button type="button" onClick={onDelete} disabled={busy || lock?.canDelete === false} className="min-h-11 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg disabled:opacity-40">
            Delete Service
          </button>
        )}
      </div>
    </div>
  );
}

export function ServiceAuditLog({ themeId }: { themeId: DatabaseCatalogThemeId }) {
  const [entries, setEntries] = useState<ServiceAuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadThemeServiceAudit(themeId)
      .then((rows) => { if (!cancelled) setEntries(rows.slice(0, 12)); })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load audit log.');
      });
    return () => { cancelled = true; };
  }, [themeId]);

  return (
    <div className="bg-white rounded-lg border border-[#eeeeee] p-4 space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-[#5f5e5e] uppercase">Salon activity</h3>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {entries.length === 0 && !error && <p className="text-xs text-[#5f5e5e]">No service activity recorded yet for this theme.</p>}
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.id} className="text-[11px] text-[#1a1c1c] border-b border-[#f3f3f3] pb-2">
            <span className="font-semibold">{entry.action.replaceAll('_', ' ')}</span>
            {entry.serviceName ? ` · ${entry.serviceName}` : ''}
            <span className="block text-[#5f5e5e]">{entry.createdAt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
