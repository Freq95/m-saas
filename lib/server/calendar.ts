import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { DEFAULT_USER_ID } from '@/lib/constants';

type AppointmentQuery = {
  userId?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  providerId?: number;
  resourceId?: number;
  status?: string;
};

export async function getAppointmentsData(query: AppointmentQuery = {}) {
  const db = await getMongoDbOrThrow();
  const userId = query.userId ?? DEFAULT_USER_ID;
  const startDate = query.startDate instanceof Date ? query.startDate.toISOString() : query.startDate;
  const endDate = query.endDate instanceof Date ? query.endDate.toISOString() : query.endDate;
  const providerId = query.providerId;
  const resourceId = query.resourceId;
  const status = query.status;

  const filter: Record<string, unknown> = { user_id: userId };
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

  const [appointments, services] = await Promise.all([
    db
      .collection('appointments')
      .find(filter)
      .sort({ start_time: 1 })
      .toArray()
      .then((docs: any[]) => docs.map(stripMongoId)),
    db.collection('services').find({ user_id: userId }).toArray().then((docs: any[]) => docs.map(stripMongoId)),
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

export async function getServicesData(userId: number = DEFAULT_USER_ID) {
  const db = await getMongoDbOrThrow();
  const services = await db
    .collection('services')
    .find({ user_id: userId })
    .sort({ name: 1 })
    .toArray();
  return services.map(stripMongoId);
}
