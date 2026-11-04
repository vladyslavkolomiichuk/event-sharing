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
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Administration
          </p>
          <h1>Admin workspace</h1>
        </div>
        <AdminWorkspace section={section as AdminSection} />
      </div>
    </RequireAuth>
  );
}
