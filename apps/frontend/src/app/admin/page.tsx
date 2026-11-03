import { RequireAuth } from '@/components/auth/RequireAuth';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { PrivacyRequests } from '@/components/admin/PrivacyRequests';
export default function AdminPage() {
  return (
    <RequireAuth role="ADMIN">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Administration
          </p>
          <h1>Admin workspace</h1>
          <p className="text-neutral-600">
            Manage categories, user roles, and service health.
          </p>
        </div>
        <AdminWorkspace />
        <PrivacyRequests />
      </div>
    </RequireAuth>
  );
}
