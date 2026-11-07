import type { Metadata } from 'next';
import { PrivacySettings } from '@/components/profile/PrivacySettings';

export const metadata: Metadata = { title: 'Privacy settings' };

export default function PrivacyPage() {
  return <PrivacySettings />;
}
