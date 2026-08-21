/**
 * PHASE 12.6 — SERVICE DETAIL data helpers (all five themes).
 *
 * Pure, read-only helpers for the Service Detail view:
 *
 *   - `staffForService(data, serviceId)` returns the real, public staff members
 *     who can perform the selected service. It never invents staff:
 *       · members on leave / inactive are excluded (they cannot be booked);
 *       · when the salon assigns services (`assignedServiceIds`), only members
 *         assigned to this service are shown;
 *       · when no member has any assignment, all available members are shown
 *         (the salon has not configured per-service staffing).
 *
 * No new service/database architecture — this reads the existing `SalonData`
 * team + the existing public-staff mapping.
 */
import type { SalonData, TeamMember } from '../types';
import { getPublicStaffData } from '../types';

export interface ServiceStaff {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  specialties: string[];
  bio?: string;
  rating?: number;
}

function isAvailableToWork(member: TeamMember): boolean {
  return member.status !== 'On Leave' && member.status !== 'Inactive';
}

export function staffForService(data: SalonData, serviceId: string): ServiceStaff[] {
  const team = data.team || [];
  const usesAssignments = team.some(
    (member) => Array.isArray(member.assignedServiceIds) && member.assignedServiceIds.length > 0,
  );
  return team
    .filter(isAvailableToWork)
    .filter((member) => {
      if (!usesAssignments) return true;
      const assigned = Array.isArray(member.assignedServiceIds) ? member.assignedServiceIds : [];
      return assigned.includes(serviceId);
    })
    .map((member) => getPublicStaffData(member));
}
