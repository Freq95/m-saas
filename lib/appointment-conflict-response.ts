const CONFLICT_MESSAGE_BY_TYPE: Record<string, string> = {
  calendar_appointment: 'Există deja o altă programare în acest interval.',
  appointment_overlap: 'Există deja o altă programare în acest interval.',
  availability_block: 'Intervalul este blocat în calendar.',
};

export function formatAppointmentConflictPayload(conflict: any) {
  const baseMessage = CONFLICT_MESSAGE_BY_TYPE[conflict?.type] || 'Conflict detectat.';
  const appointment = conflict?.appointment;

  if (appointment) {
    return {
      type: conflict.type,
      message: `${baseMessage} ${appointment.client_name || 'Client'} (${appointment.start_time} - ${appointment.end_time}).`,
      appointment: {
        id: appointment.id,
        client_name: appointment.client_name || null,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
      },
    };
  }

  const block = conflict?.block;
  if (block) {
    return {
      type: 'availability_block',
      message: `${baseMessage} ${block.type_label || 'Indisponibil'} (${block.start_time} - ${block.end_time}).`,
      block: {
        id: block.id,
        type_label: block.type_label || null,
        reason: block.reason || null,
        start_time: block.start_time,
        end_time: block.end_time,
      },
    };
  }

  return { type: conflict?.type || 'appointment_overlap', message: baseMessage };
}

export function formatAppointmentConflictSuggestions(
  suggestions: Array<{ start: Date; end: Date }>
) {
  return suggestions.map((slot) => ({
    startTime: slot.start.toISOString(),
    endTime: slot.end.toISOString(),
    reason: 'Interval alternativ disponibil',
  }));
}

export function getAppointmentConflictWarning(conflicts: unknown[] = []) {
  return conflicts.length > 0
    ? 'Programarea a fost salvată, dar intervalul se suprapune cu altă programare.'
    : null;
}

export function hasAvailabilityBlockConflict(conflicts: unknown[] = []) {
  return conflicts.some((conflict: any) => conflict?.type === 'availability_block');
}
