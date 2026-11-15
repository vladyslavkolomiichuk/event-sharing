import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PayoutAccountPanel } from '@/components/payments/PayoutAccountPanel';
export const metadata: Metadata = { title: 'Payouts' };

export default function PayoutsPage() {
  return (
    <RequireAuth role="ORGANIZER">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-500">
            Organizer workspace
          </p>
          <h1>Payouts</h1>
          <p className="text-neutral-600">
            Connect a Stripe account to sell tickets and accept donations.
            Participants pay on this site and the money goes to your account.
          </p>
        </div>
        <PayoutAccountPanel />
      </div>
    </RequireAuth>
  );
}
