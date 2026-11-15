import type { PaymentProvider } from '../payments/PaymentProvider.js';
import { paymentProvider } from '../config/payment-provider.js';
import { PaymentRepository } from '../repositories/PaymentRepository.js';

// Frees expired seat holds and retries pending refunds.
export class PaymentWorker {
  private interval?: NodeJS.Timeout;
  private running: Promise<void> | undefined;

  constructor(
    private readonly payments = new PaymentRepository(),
    private readonly provider: PaymentProvider | null = paymentProvider,
    private readonly periodMs = 15_000,
  ) {}

  start(): void {
    this.interval = setInterval(() => void this.tick(), this.periodMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.running;
  }

  tick(): Promise<void> {
    this.running ??= this.work()
      .catch((error: unknown) => {
        console.error(
          'Payment worker failed.',
          error instanceof Error ? error.message : 'UnknownError',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async work(): Promise<void> {
    await this.payments.expireDue();
    if (!this.provider) return;
    for (const payment of await this.payments.refundsDue()) {
      try {
        if (!payment.providerPaymentId)
          throw new Error('Payment has no provider reference.');
        await this.provider.refund(payment.providerPaymentId, payment.id);
        await this.payments.markRefunded(payment.id);
      } catch (error) {
        await this.payments.refundFailed(payment.id);
        console.error(
          'Refund failed.',
          payment.id,
          error instanceof Error ? error.message : 'UnknownError',
        );
      }
    }
  }
}
