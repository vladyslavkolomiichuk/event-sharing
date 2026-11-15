import type {
  CheckoutRequest,
  CheckoutSession,
  EventPaymentList,
  MyPayment,
  PayoutAccount,
  PayoutOnboarding,
} from '@event-sharing/contracts';
import { ApiError, gateway } from './GatewayClient';

export class PaymentsClient {
  checkout(
    eventId: string,
    request: CheckoutRequest = {},
  ): Promise<CheckoutSession> {
    return gateway.post(
      `/api/participation/events/${eventId}/checkout`,
      request,
    );
  }

  mine(eventId: string): Promise<MyPayment> {
    return gateway.get(`/api/participation/events/${eventId}/payments/me`);
  }

  forEvent(eventId: string): Promise<EventPaymentList> {
    return gateway.get(`/api/participation/events/${eventId}/payments`);
  }

  account(): Promise<PayoutAccount> {
    return gateway.get('/api/participation/payments/account');
  }

  onboarding(): Promise<PayoutOnboarding> {
    return gateway.post('/api/participation/payments/account/onboarding');
  }
}

export const paymentsClient = new PaymentsClient();

// Opens checkout when a paid event refuses a free join.
export async function joinOrPay(
  eventId: string,
  join: () => Promise<unknown>,
  invitation: Pick<CheckoutRequest, 'inviteId' | 'token'>,
): Promise<'joined' | 'checkout'> {
  try {
    await join();
    return 'joined';
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'PAYMENT_REQUIRED'))
      throw cause;
    const session = await paymentsClient.checkout(eventId, invitation);
    window.location.assign(session.url);
    return 'checkout';
  }
}
