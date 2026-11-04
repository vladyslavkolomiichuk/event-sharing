export function InlineFeedback({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
}) {
  const colors = {
    info: 'border-neutral-200 bg-neutral-50 text-neutral-800',
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-orange-200 bg-orange-50 text-orange-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  }[tone];

  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border p-3 text-sm leading-6 ${colors}`}
    >
      {message}
    </p>
  );
}
