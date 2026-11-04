import type { InAppNotification } from '@event-sharing/contracts';

export function notificationLink(
  href: string,
  type?: InAppNotification['type'],
): string {
  if (type === 'FRIEND_REQUEST' && href === '/friends')
    return '/friends/received';
  return href.startsWith('/admin#organizer-request-')
    ? href.replace('/admin#', '/admin/role-requests#')
    : href;
}
