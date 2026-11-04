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
          className={`shrink-0 rounded-lg px-3 py-2 hover:bg-neutral-100 ${pathname === section.href ? 'bg-neutral-100 font-semibold' : ''}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
