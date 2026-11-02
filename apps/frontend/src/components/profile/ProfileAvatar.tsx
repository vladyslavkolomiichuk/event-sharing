export function ProfileAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'md' | 'lg';
}) {
  const dimension = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-10 w-10 text-sm';

  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={`${name}'s avatar`}
      className={`${dimension} rounded-full border border-neutral-200 object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 font-semibold text-neutral-700`}
    >
      {name.trim().charAt(0).toUpperCase() || 'M'}
    </span>
  );
}
