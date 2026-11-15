'use client';

import { LoadingRegion } from '@/components/feedback/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useState } from 'react';
import type {
  Availability,
  EventPaymentList,
  Payment,
} from '@event-sharing/contracts';
import { participationClient } from '@/lib/api/ParticipationClient';
import { paymentsClient } from '@/lib/api/PaymentsClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { pricingLabel } from '@/lib/event-pricing';
import { formatMoney, parseMoney } from '@/lib/format-money';

const paymentNotices: Partial<Record<Payment['status'], string>> = {
  REFUND_PENDING: 'Your payment is being refunded.',
  REFUNDED: 'Your payment was refunded.',
};

export function RegistrationPanel({
  eventId,
  userId,
  isOwner,
  revision,
  onMembershipChanged,
}: {
  eventId: string;
  userId: string;
  isOwner: boolean;
  revision: number;
  onMembershipChanged: () => void;
}) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [joined, setJoined] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [sales, setSales] = useState<EventPaymentList | null>(null);
  const [donation, setDonation] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mode = availability?.pricing.mode ?? 'FREE';
  const paidOnline = mode === 'ONLINE' || mode === 'DONATION';

  async function refresh() {
    setLoading(true);
    setError('');
    let policy: Availability | null = null;
    try {
      policy = await participationClient.availability(eventId);
      setAvailability(policy);
    } catch (cause) {
      setAvailability(null);
      if (!(cause instanceof ApiError && cause.status === 404))
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load availability.',
        );
    }
    try {
      setJoined(await participationClient.joined(eventId, userId));
      const online =
        policy?.pricing.mode === 'ONLINE' ||
        policy?.pricing.mode === 'DONATION';
      if (online && isOwner) setSales(await paymentsClient.forEvent(eventId));
      else if (online) setPayment((await paymentsClient.mine(eventId)).payment);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load your registration.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [eventId, userId, revision]);

  // Stripe sends the buyer back with ?payment=success or cancelled.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('payment');
    if (!result) return;
    url.searchParams.delete('payment');
    window.history.replaceState(null, '', url);
    if (result === 'cancelled') {
      setNotice('Payment was cancelled. Your place is not reserved.');
      return;
    }
    if (result === 'success') void waitForConfirmation();
  }, [eventId]);

  async function waitForConfirmation() {
    setConfirming(true);
    try {
      for (let attempt = 0; attempt < 20; attempt++) {
        const { payment: latest } = await paymentsClient.mine(eventId);
        setPayment(latest);
        if (latest?.status === 'PAID') {
          setNotice('Payment received. You joined this event.');
          await refresh();
          onMembershipChanged();
          return;
        }
        if (latest?.status === 'REFUND_PENDING') {
          setNotice(
            'Payment received, but no place was left. It is being refunded.',
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      setNotice(
        'Your payment is still being confirmed. Refresh this page in a minute.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not check payment.',
      );
    } finally {
      setConfirming(false);
    }
  }

  async function pay(amountCents?: number) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await paymentsClient.checkout(
        eventId,
        amountCents ? { amountCents } : {},
      );
      window.location.assign(session.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not start payment.',
      );
      setBusy(false);
    }
  }

  function donate() {
    const cents = parseMoney(donation);
    if (!cents || cents < 50) {
      setError(
        `Enter at least ${formatMoney(50, availability?.pricing.currency ?? 'EUR')}.`,
      );
      return;
    }
    void pay(cents);
  }

  async function change() {
    const refundHours = availability?.pricing.refundHoursBeforeStart;
    const paid = payment?.status === 'PAID';
    const warning = !paid
      ? 'Leave this event? Its places may fill up.'
      : refundHours === null || refundHours === undefined
        ? 'Leave this event? Your payment will not be refunded.'
        : `Leave this event? You get a refund if you leave at least ${refundHours} hours before the start.`;
    if (joined && !window.confirm(warning)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (joined) await participationClient.leave(eventId);
      else await participationClient.join(eventId);
      setNotice(
        joined ? 'You have left this event.' : 'You joined this event.',
      );
      await refresh();
      onMembershipChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not change registration.',
      );
    } finally {
      setBusy(false);
    }
  }

  const closed =
    !availability ||
    availability.status !== 'OPEN' ||
    availability.available === 0;
  const disabled = busy || loading || confirming || Boolean(error);

  return (
    <div className="space-y-4">
      <h2 className="text-lg">Registration</h2>
      {availability ? (
        <>
          <p className="text-sm font-medium">
            {pricingLabel(availability.pricing)}
          </p>
          <p className="text-sm text-neutral-600">
            {availability.occupied} of {availability.capacity} places filled.{' '}
            {availability.status === 'OPEN'
              ? `${availability.available} available.`
              : `Registration ${availability.status.toLowerCase()}.`}
          </p>
          {payment?.status === 'PAID' && joined && (
            <p className="text-sm text-neutral-600">
              You paid {formatMoney(payment.amountCents, payment.currency)}.
            </p>
          )}
          {payment && paymentNotices[payment.status] && (
            <InlineFeedback
              message={paymentNotices[payment.status]!}
              tone="info"
            />
          )}
          {isOwner && sales && (
            <p className="text-sm text-neutral-600">
              {sales.items.filter((item) => item.status === 'PAID').length} paid
              · {formatMoney(sales.paidCents, availability.pricing.currency)}{' '}
              collected
              {sales.refundedCents > 0 &&
                ` · ${formatMoney(sales.refundedCents, availability.pricing.currency)} refunded`}
            </p>
          )}
          {!isOwner && joined && (
            <Button
              onClick={() => void change()}
              disabled={disabled}
              variant="outline"
              loading={busy}
            >
              Leave event
            </Button>
          )}
          {!isOwner && !joined && mode === 'ONLINE' && (
            <Button
              onClick={() => void pay()}
              disabled={disabled || closed}
              loading={busy || confirming}
            >
              Buy ticket ·{' '}
              {formatMoney(
                availability.pricing.priceCents,
                availability.pricing.currency,
              )}
            </Button>
          )}
          {!isOwner && !joined && mode !== 'ONLINE' && (
            <Button
              onClick={() => void change()}
              disabled={disabled || closed}
              loading={busy}
            >
              {mode === 'DONATION' ? 'Join for free' : 'Join event'}
            </Button>
          )}
          {!isOwner && !joined && paidOnline && mode === 'DONATION' && (
            <div className="space-y-2 border-t border-neutral-200 pt-4">
              <label htmlFor="donation-amount" className="text-sm">
                Or support the organizer and join
              </label>
              <div className="flex gap-2">
                <Input
                  id="donation-amount"
                  inputMode="decimal"
                  placeholder={
                    availability.pricing.priceCents
                      ? (availability.pricing.priceCents / 100).toFixed(2)
                      : '5.00'
                  }
                  value={donation}
                  onChange={(event) => {
                    setDonation(event.target.value);
                    setError('');
                  }}
                />
                <Button
                  variant="outline"
                  onClick={donate}
                  disabled={disabled || closed}
                >
                  Donate
                </Button>
              </div>
            </div>
          )}
        </>
      ) : loading ? (
        <LoadingRegion label="Loading registration" className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-28" />
        </LoadingRegion>
      ) : (
        <p className="text-sm text-neutral-600">
          Registration has not opened yet.
        </p>
      )}
      {confirming && (
        <InlineFeedback message="Confirming your payment…" tone="info" />
      )}
      {notice && <InlineFeedback message={notice} tone="success" />}
      {error && <InlineFeedback message={error} tone="error" />}
    </div>
  );
}
