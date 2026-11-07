const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(value: string | number | Date): string {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | number | Date): string {
  return dateTimeFormat.format(new Date(value));
}
