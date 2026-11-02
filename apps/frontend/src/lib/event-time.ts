export function eventLocalTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

export function eventUtcTime(local: string, timeZone: string): string {
  const target = Date.parse(`${local}Z`);
  if (Number.isNaN(target))
    throw new Error('Enter a valid event date and time.');
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = Date.parse(
      `${eventLocalTime(new Date(instant).toISOString(), timeZone)}Z`,
    );
    instant += target - current;
  }
  const result = new Date(instant).toISOString();
  if (eventLocalTime(result, timeZone) !== local) {
    throw new Error('This time does not exist in the selected time zone.');
  }
  return result;
}
