import { RequireAuth } from '@/components/auth/RequireAuth';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';

export default function DangerZonePage() {
  return (
    <RequireAuth role="ADMIN">
      <div className="space-y-8">
        <h1>Admin workspace</h1>
        <AdminWorkspace section="danger-zone" />
      </div>
    </RequireAuth>
  );
}
