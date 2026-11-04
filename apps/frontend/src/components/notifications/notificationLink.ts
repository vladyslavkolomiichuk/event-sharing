export function notificationLink(href: string): string {
  return href.startsWith('/admin#organizer-request-')
    ? href.replace('/admin#', '/admin/role-requests#')
    : href;
}
