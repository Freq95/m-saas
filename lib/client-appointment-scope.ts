import type { ObjectId } from 'mongodb';

export interface ClientAppointmentScope {
  userId: number;
  tenantId: ObjectId;
}

function scopeKey(scope: ClientAppointmentScope): string {
  return `${scope.tenantId.toString()}:${scope.userId}`;
}

export function buildClientAppointmentFilter(
  clientId: number,
  scope: ClientAppointmentScope
) {
  return {
    client_id: clientId,
    deleted_at: { $exists: false },
    $or: [
      {
        user_id: scope.userId,
        tenant_id: scope.tenantId,
      },
      {
        service_owner_user_id: scope.userId,
        service_owner_tenant_id: scope.tenantId,
      },
    ],
  };
}

export function collectServiceScopesFromAppointments(
  appointments: Array<Record<string, any>>,
  fallbackScope: ClientAppointmentScope
): ClientAppointmentScope[] {
  const scopes = new Map<string, ClientAppointmentScope>();

  for (const appointment of appointments) {
    const userId = typeof appointment.service_owner_user_id === 'number'
      ? appointment.service_owner_user_id
      : typeof appointment.user_id === 'number'
        ? appointment.user_id
        : fallbackScope.userId;
    const tenantId = appointment.service_owner_tenant_id || appointment.tenant_id || fallbackScope.tenantId;
    const scope = { userId, tenantId } as ClientAppointmentScope;
    scopes.set(scopeKey(scope), scope);
  }

  if (scopes.size === 0) {
    scopes.set(scopeKey(fallbackScope), fallbackScope);
  }

  return Array.from(scopes.values());
}

export function buildServiceScopeFilter(scopes: ClientAppointmentScope[]) {
  const uniqueScopes = new Map<string, ClientAppointmentScope>();
  for (const scope of scopes) {
    uniqueScopes.set(scopeKey(scope), scope);
  }

  const clauses = Array.from(uniqueScopes.values()).map((scope) => ({
    user_id: scope.userId,
    tenant_id: scope.tenantId,
  }));

  if (clauses.length === 0) {
    return null;
  }

  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}
