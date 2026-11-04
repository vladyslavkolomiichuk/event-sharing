'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  { href: '/profile', label: 'Name and username' },
  { href: '/profile/details', label: 'Public profile' },
  { href: '/profile/search-location', label: 'Search location' },
  { href: '/profile/security', label: 'Account security' },
  { href: '/profile/social-accounts', label: 'Social accounts' },
  { href: '/profile/privacy', label: 'Privacy settings' },
];

export function ProfileNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Profile sections"
      className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
    >
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={pathname === section.href ? 'page' : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 hover:bg-orange-50 ${pathname === section.href ? 'bg-orange-50 font-semibold text-orange-800' : ''}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
