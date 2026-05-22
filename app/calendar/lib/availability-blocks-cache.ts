function normalizeCalendarIds(calendarIds?: number[]): number[] | undefined {
  if (!Array.isArray(calendarIds)) return undefined;
  return Array.from(new Set(calendarIds.filter((id): id is number => Number.isInteger(id) && id > 0))).sort((a, b) => a - b);
}

export function buildAvailabilityBlocksCacheKey(params: {
  startDate: Date;
  endDate: Date;
  calendarIds?: number[];
}): string {
  const queryParams = new URLSearchParams({
    startDate: params.startDate.toISOString(),
    endDate: params.endDate.toISOString(),
  });
  const normalizedCalendarIds = normalizeCalendarIds(params.calendarIds);
  if (normalizedCalendarIds && normalizedCalendarIds.length > 0) {
    queryParams.set('calendarIds', normalizedCalendarIds.join(','));
  }
  return `/api/availability-blocks?${queryParams.toString()}`;
}
