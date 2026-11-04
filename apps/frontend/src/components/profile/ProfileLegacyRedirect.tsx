'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const paths: Record<string, string> = {
  '#public-profile': '/profile/details',
  '#search-preferences': '/profile/search-location',
  '#account-security': '/profile/security',
  '#social-accounts': '/profile/social-accounts',
};

export function ProfileLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    const path = paths[window.location.hash];
    if (path) router.replace(path);
  }, [router]);
  return null;
}
