function addMonthsClamped(date: Date, monthsToAdd: number): Date {
  const next = new Date(date);
  const dayOfMonth = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + monthsToAdd);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(dayOfMonth, daysInTargetMonth));
  return next;
}

export function generateRecurringInstances(
  startTime: Date,
  endTime: Date,
  recurrence: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval?: number;
    end_date?: string;
    endDate?: string;
    count?: number;
  }
): Array<{ start: Date; end: Date }> {
  const instances: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();
  const safeInterval = Math.max(1, Number(recurrence.interval) || 1);
  const maxCount = Math.min(recurrence.count || 52, 52);
  const recurrenceEndDate = recurrence.end_date || recurrence.endDate;
  const recurrenceEnd = recurrenceEndDate ? new Date(recurrenceEndDate) : null;

  for (let index = 1; index < maxCount; index++) {
    const currentStart = new Date(startTime);
    if (recurrence.frequency === 'daily') {
      currentStart.setDate(startTime.getDate() + index * safeInterval);
    } else if (recurrence.frequency === 'weekly') {
      currentStart.setDate(startTime.getDate() + index * 7 * safeInterval);
    } else if (recurrence.frequency === 'monthly') {
      const nextStart = addMonthsClamped(startTime, index * safeInterval);
      currentStart.setTime(nextStart.getTime());
    }

    if (recurrenceEnd && currentStart > recurrenceEnd) {
      break;
    }

    const currentEnd = new Date(currentStart.getTime() + duration);
    instances.push({ start: currentStart, end: currentEnd });
  }

  return instances;
}

