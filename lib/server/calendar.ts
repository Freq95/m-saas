import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { ObjectId } from 'mongodb';

type AppointmentQuery = {
  userId?: number;
  tenantId?: ObjectId;
  startDate?: string | Date;
  endDate?: string | Date;
  providerId?: number;
  resourceId?: number;
  status?: string;
};

const SERVICES_PROJECTION = {
  _id: 1,
  id: 1,
  name: 1,
  duration_minutes: 1,
  price: 1,
  user_id: 1,
  tenant_id: 1,
  description: 1,
  created_at: 1,
  updated_at: 1,
};

export async function getAppointmentsData(query: AppointmentQuery = {}) {
  const db = await getMongoDbOrThrow();
  if (!query.userId) {
    throw new Error('userId is required');
  }
  const userId = query.userId;
  const tenantId = query.tenantId;
  const startDate = query.startDate instanceof Date ? query.startDate.toISOString() : query.startDate;
  const endDate = query.endDate instanceof Date ? query.endDate.toISOString() : query.endDate;
  const providerId = query.providerId;
  const resourceId = query.resourceId;
  const status = query.status;

  const filter: Record<string, unknown> = { user_id: userId };
  if (tenantId) {
    filter.tenant_id = tenantId;
  }
  if (startDate || endDate) {
    const range: Record<string, string> = {};
    if (startDate) range.$gte = startDate;
    if (endDate) range.$lte = endDate;
    filter.start_time = range;
  }
  if (status) {
    filter.status = status;
  }
  if (providerId) {
    filter.provider_id = providerId;
  }
  if (resourceId) {
    filter.resource_id = resourceId;
  }

  const appointmentQuery = db
    .collection('appointments')
    .find(filter)
    .project({
      _id: 1,
      id: 1,
      tenant_id: 1,
      user_id: 1,
      conversation_id: 1,
      service_id: 1,
      client_id: 1,
      client_name: 1,
      client_email: 1,
      client_phone: 1,
      start_time: 1,
      end_time: 1,
      status: 1,
      provider_id: 1,
      resource_id: 1,
      category: 1,
      color: 1,
      notes: 1,
      reminder_sent: 1,
      created_at: 1,
      updated_at: 1,
    })
    .sort({ start_time: 1 });

  const servicesQuery = db
    .collection('services')
    .find(tenantId ? { user_id: userId, tenant_id: tenantId } : { user_id: userId })
    .project(SERVICES_PROJECTION);

  const [appointments, services] = await Promise.all([
    appointmentQuery.toArray().then((docs: any[]) => docs.map(stripMongoId)),
    servicesQuery.toArray().then((docs: any[]) => docs.map(stripMongoId)),
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  return appointments.map((appointment: any) => {
    const service = serviceById.get(appointment.service_id);
    return {
      ...appointment,
      service_name: service?.name || '',
      duration_minutes: service?.duration_minutes,
      service_price: service?.price,
    };
  });
}

export async function getServicesData(userId: number, tenantId?: ObjectId) {
  const db = await getMongoDbOrThrow();
  const servicesQuery = db
    .collection('services')
    .find(tenantId ? { user_id: userId, tenant_id: tenantId } : { user_id: userId })
    .project(SERVICES_PROJECTION)
    .sort({ name: 1 });
  const services = await servicesQuery.toArray();
  return services.map(stripMongoId);
}
