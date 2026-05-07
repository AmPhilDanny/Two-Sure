/**
 * Formats a date string or object into West Africa Time (WAT)
 * WAT is UTC+1 (Africa/Lagos)
 */
export function formatToWAT(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

export function getCurrentWAT(): Date {
  // Returns a Date object adjusted to WAT
  const now = new Date();
  const watOffset = 1; // WAT is UTC+1
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * watOffset));
}
