import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequireAuth } from '@/components/auth/RequireAuth';
import {
  AdminWorkspace,
  type AdminSection,
} from '@/components/admin/AdminWorkspace';

const sections: AdminSection[] = [
  'moderation',
  'role-requests',
  'user-roles',
  'categories',
  'privacy-requests',
  'system-messages',
];

const titles: Record<string, string> = {
  moderation: 'Moderation',
  'role-requests': 'Role requests',
  'user-roles': 'User roles',
  categories: 'Categories',
  'privacy-requests': 'Privacy requests',
  'system-messages': 'System messages',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: titles[section] ?? 'Page not found' };
}

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as AdminSection)) notFound();
  return (
    <RequireAuth role="ADMIN">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-500">Administration</p>
          <h1>Admin workspace</h1>
        </div>
        <AdminWorkspace section={section as AdminSection} />
      </div>
    </RequireAuth>
  );
}
