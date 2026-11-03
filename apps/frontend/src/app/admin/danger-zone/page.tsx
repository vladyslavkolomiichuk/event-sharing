import { RequireAuth } from '@/components/auth/RequireAuth';

export default function DangerZonePage() {
  return (
    <RequireAuth role="ADMIN">
      <section className="max-w-2xl space-y-5 rounded-xl border border-red-200 bg-white p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-red-700">
          Administration
        </p>
        <h1>Danger Zone</h1>
        <p className="text-neutral-600">
          Service container controls may be added here later. No container
          controls are available in the website.
        </p>
      </section>
    </RequireAuth>
  );
}
