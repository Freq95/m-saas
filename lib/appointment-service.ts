import { ObjectId } from 'mongodb';
import type { AuthContext } from './auth-helpers';
import { resolveBookableDentistForCalendar, type BookableCalendarDentist } from './calendar-dentists';

export interface ServiceOwnerScope {
  serviceOwnerUserId: number;
  serviceOwnerTenantId: ObjectId;
}

export interface AppointmentDentistAssignment {
  assignedDentistUserId: number;
  assignedDentistTenantId: ObjectId;
  dentistDbUserId: ObjectId;
  dentistDisplayName: string;
  isOwner: boolean;
  isCurrentUser: boolean;
}

function toObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

export function getServiceOwnerScopeFromAppointment(appointment: Record<string, any>): ServiceOwnerScope | null {
  // service_owner_user_id is the dentist who owns the service catalog for this appointment.
  // Falls back to user_id (calendar owner) for legacy appointments that pre-date dentist-scoped services.
  const serviceOwnerUserId = typeof appointment.service_owner_user_id === 'number'
    ? appointment.service_owner_user_id
    : typeof appointment.user_id === 'number'
      ? appointment.user_id
      : null;
  const serviceOwnerTenantId = toObjectId(appointment.service_owner_tenant_id) || toObjectId(appointment.tenant_id);

  if (!serviceOwnerUserId || !serviceOwnerTenantId) {
    return null;
  }

  return {
    serviceOwnerUserId,
    serviceOwnerTenantId,
  };
}

function buildServiceOwnerFields(scope: ServiceOwnerScope) {
  return {
    service_owner_user_id: scope.serviceOwnerUserId,
    service_owner_tenant_id: scope.serviceOwnerTenantId,
  };
}

function mapBookableDentistToAssignment(dentist: BookableCalendarDentist): AppointmentDentistAssignment {
  return {
    assignedDentistUserId: dentist.userId,
    assignedDentistTenantId: dentist.tenantId,
    dentistDbUserId: dentist.dbUserId,
    dentistDisplayName: dentist.displayName,
    isOwner: dentist.isOwner,
    isCurrentUser: dentist.isCurrentUser,
  };
}

export async function resolveAppointmentDentistAssignment(
  auth: AuthContext,
  calendarId: number,
  dentistUserId?: number | null
): Promise<AppointmentDentistAssignment> {
  const dentist = await resolveBookableDentistForCalendar(auth, calendarId, dentistUserId);
  return mapBookableDentistToAssignment(dentist);
}

export function buildAppointmentDentistFields(
  assignment: AppointmentDentistAssignment,
  serviceOwner?: ServiceOwnerScope
) {
  // service_owner_* points at the selected dentist's service/client catalog.
  // dentist_* points at who is performing the appointment.
  const ownerScope: ServiceOwnerScope = serviceOwner ?? {
    serviceOwnerUserId: assignment.assignedDentistUserId,
    serviceOwnerTenantId: assignment.assignedDentistTenantId,
  };
  return {
    ...buildServiceOwnerFields(ownerScope),
    dentist_db_user_id: assignment.dentistDbUserId,
    dentist_id: assignment.assignedDentistUserId,
  };
}
