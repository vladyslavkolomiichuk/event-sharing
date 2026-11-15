'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  MIN_ONLINE_PRICE_CENTS,
  PAYMENT_CURRENCIES,
  type PaymentCurrency,
  type PricingMode,
} from '@event-sharing/contracts';
import { Input } from '@/components/ui/input';
import { paymentsClient } from '@/lib/api/PaymentsClient';
import { formatMoney } from '@/lib/format-money';
import type { PricingDraft } from '@/lib/event-pricing';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

const modes: { value: PricingMode; label: string; hint: string }[] = [
  { value: 'FREE', label: 'Free', hint: 'Anyone can join without paying.' },
  {
    value: 'ONLINE',
    label: 'Paid online',
    hint: 'Participants pay by card on this site to get a place.',
  },
  {
    value: 'ON_SITE',
    label: 'Pay at the venue',
    hint: 'The price is shown here; you collect payment yourself.',
  },
  {
    value: 'DONATION',
    label: 'Donation',
    hint: 'Joining is free; participants may pay what they want.',
  },
];

export function EventPricingFields({
  value,
  onChange,
  disabled,
}: {
  value: PricingDraft;
  onChange: (value: PricingDraft) => void;
  disabled: boolean;
}) {
  const [payouts, setPayouts] = useState<
    'unknown' | 'ready' | 'missing' | 'off'
  >('unknown');
  const online = value.mode === 'ONLINE' || value.mode === 'DONATION';

  useEffect(() => {
    if (!online || payouts !== 'unknown') return;
    paymentsClient
      .account()
      .then((account) =>
        setPayouts(
          !account.available
            ? 'off'
            : account.chargesEnabled
              ? 'ready'
              : 'missing',
        ),
      )
      .catch(() => setPayouts('unknown'));
  }, [online, payouts]);

  const update = (patch: Partial<PricingDraft>) =>
    onChange({ ...value, ...patch });
  const minimum = formatMoney(MIN_ONLINE_PRICE_CENTS, value.currency);

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="mb-2 font-medium">Entry price</legend>
      {disabled && (
        <p className="text-sm text-neutral-600">
          Pricing cannot change after registration opens.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {modes.map((mode) => (
          <label
            key={mode.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
              value.mode === mode.value
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-neutral-200'
            }`}
          >
            <input
              type="radio"
              name="pricing-mode"
              value={mode.value}
              checked={value.mode === mode.value}
              onChange={() => update({ mode: mode.value })}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{mode.label}</span>
              <span className="text-neutral-600">{mode.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {value.mode !== 'FREE' && (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label htmlFor="event-price">
              {value.mode === 'DONATION'
                ? 'Suggested donation (optional)'
                : 'Price per participant'}
            </label>
            <Input
              id="event-price"
              inputMode="decimal"
              placeholder={value.mode === 'DONATION' ? 'Optional' : '15.00'}
              value={value.price}
              onChange={(event) => update({ price: event.target.value })}
            />
            {value.mode === 'ONLINE' && (
              <p className="mt-1 text-xs text-neutral-500">
                Minimum {minimum}.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="event-currency">Currency</label>
            <select
              id="event-currency"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
              value={value.currency}
              onChange={(event) =>
                update({ currency: event.target.value as PaymentCurrency })
              }
            >
              {PAYMENT_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {value.mode === 'ONLINE' && (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.refunds}
              onChange={(event) => update({ refunds: event.target.checked })}
            />
            Refund participants who leave in time
          </label>
          {value.refunds && (
            <div className="flex items-center gap-2">
              <span>Until</span>
              <Input
                aria-label="Refund deadline in hours before start"
                className="w-24"
                type="number"
                min={0}
                max={720}
                value={value.refundHours}
                onChange={(event) =>
                  update({ refundHours: event.target.value })
                }
              />
              <span>hours before the start</span>
            </div>
          )}
          <p className="text-neutral-600">
            Cancelling the event always refunds every paid participant.
          </p>
        </div>
      )}
      {online && payouts === 'missing' && (
        <InlineFeedback
          tone="warning"
          message="Connect a payout account before registration opens, or participants cannot pay."
        />
      )}
      {online && payouts === 'off' && (
        <InlineFeedback
          tone="warning"
          message="Online payments are not enabled on this site yet."
        />
      )}
      {online && payouts !== 'off' && (
        <Link href="/payouts" className="text-sm underline" target="_blank">
          Manage payout account
        </Link>
      )}
    </fieldset>
  );
}
