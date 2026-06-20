export const MINIMUM_CLINICAL_RETENTION_YEARS = 5;

export function addUtcYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}
