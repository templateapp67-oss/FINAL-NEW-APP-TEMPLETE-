import React, { useEffect, useState } from 'react';
import { Store, Globe, MapPin, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import {
  fetchOwnerSalonCandidates,
  setActiveWorkspaceSalonId,
  type OwnerSalonCandidate,
} from '../lib/ownerSalon';

interface OwnerWorkspaceSelectorProps {
  userId: string;
  salonIds: string[];
  onSelectSalon: (salonId: string) => void;
}

export default function OwnerWorkspaceSelector({
  userId,
  salonIds,
  onSelectSalon,
}: OwnerWorkspaceSelectorProps) {
  const [candidates, setCandidates] = useState<OwnerSalonCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const list = await fetchOwnerSalonCandidates(salonIds);
      setCandidates(list);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidates();
  }, [salonIds.join(',')]);

  const handleSelect = (salonId: string) => {
    setSelectingId(salonId);
    setActiveWorkspaceSalonId(userId, salonId);
    onSelectSalon(salonId);
  };

  return (
    <div
      className="min-h-screen bg-[#f9f9f9] flex items-center justify-center px-4 py-12 font-sans text-gray-900"
      data-testid="owner-workspace-selector-boundary"
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ffd9e1]/60 text-[#ac0053]">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-extrabold text-[#1a1c1c]">Select Salon Workspace</h1>
          <p className="mt-1 text-sm text-gray-600">
            Multiple salon workspaces are linked to your account. Choose which workspace you want to open and manage.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#ac0053]" />
            <p className="mt-3 text-sm text-gray-500">Loading your salons…</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-600 mb-4">
              We found {salonIds.length} salon records for your account. Click below to refresh or open your default salon.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void loadCandidates()}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh list
              </button>
              {salonIds[0] && (
                <button
                  type="button"
                  onClick={() => handleSelect(salonIds[0])}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ac0053] px-4 py-2 text-sm font-bold text-white hover:bg-[#8d0044]"
                >
                  <span>Open workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((candidate) => {
              const isSelected = selectingId === candidate.id;
              return (
                <div
                  key={candidate.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-[#ac0053]/40 hover:shadow-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#1a1c1c] truncate">
                        {candidate.name}
                      </h3>
                      {candidate.isPublished ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          Draft
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">/{candidate.slug}</span>
                      </div>
                      {(candidate.city || candidate.address) && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">
                            {[candidate.city, candidate.address].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelect(candidate.id)}
                    disabled={isSelected}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8d0044] transition-colors disabled:opacity-50 shrink-0 shadow-2xs"
                  >
                    {isSelected ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <>
                        <span>Open Workspace</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          <p className="text-xs text-gray-400">
            All your salon data, services, bookings, and public websites remain securely preserved.
          </p>
        </div>
      </div>
    </div>
  );
}
