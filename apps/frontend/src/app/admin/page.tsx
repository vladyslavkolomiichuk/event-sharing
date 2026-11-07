import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
export const metadata: Metadata = { title: 'Admin workspace' };

export default function AdminPage() {
  return (
    <RequireAuth role="ADMIN">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-500">Administration</p>
          <h1>Admin workspace</h1>
          <p className="text-neutral-600">
            Review events, role requests, users, and service health.
          </p>
        </div>
        <AdminWorkspace />
      </div>
    </RequireAuth>
  );
}
