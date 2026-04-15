import type { Appointment, CalendarListItem } from '../hooks';

export function canCreateOnCalendar(calendar: CalendarListItem | null | undefined): boolean {
  return Boolean(calendar && (calendar.isOwner || calendar.permissions.can_create));
}

export function decorateAppointmentWithCalendarAccess(
  appointment: Appointment,
  calendarMap: Map<number, CalendarListItem>,
  sessionDbUserId?: string
): Appointment {
  if (typeof appointment.calendar_id !== 'number') {
    return {
      ...appointment,
      can_edit: appointment.can_edit ?? true,
      can_delete: appointment.can_delete ?? true,
      can_change_status: appointment.can_change_status ?? true,
      can_drag: appointment.can_drag ?? appointment.status === 'scheduled',
    };
  }

  const calendar = calendarMap.get(appointment.calendar_id);
  if (!calendar) {
    return {
      ...appointment,
      can_edit: false,
      can_delete: false,
      can_change_status: false,
      can_drag: false,
    };
  }

  const isCreator = Boolean(
    sessionDbUserId &&
    appointment.created_by_user_id &&
    appointment.created_by_user_id === sessionDbUserId
  );
  const canEdit = calendar.isOwner
    || calendar.permissions.can_edit_all
    || (calendar.permissions.can_edit_own && isCreator);
  const canDelete = calendar.isOwner
    || calendar.permissions.can_delete_all
    || (calendar.permissions.can_delete_own && isCreator);

  return {
    ...appointment,
    calendar_name: appointment.calendar_name || calendar.name,
    calendar_color: appointment.calendar_color || calendar.color,
    calendar_settings: appointment.calendar_settings || calendar.settings || null,
    dentist_color: appointment.dentist_color || calendar.dentistColor,
    can_edit: canEdit,
    can_delete: canDelete,
    can_change_status: canEdit,
    can_drag: canEdit && appointment.status === 'scheduled',
  };
}
