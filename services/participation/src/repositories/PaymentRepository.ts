import { prisma } from '../database/client.js';
import { CapacityPolicy } from '../domain/CapacityPolicy.js';
import { PaymentError } from '../domain/errors/PaymentError.js';
import type {
  Payment,
  PayoutAccount,
  Prisma,
  RegistrationPolicy,
} from '../generated/prisma/client.js';
import { ParticipationRepository } from './ParticipationRepository.js';

export type ReserveInput = {
  eventId: string;
  userId: string;
  amountCents: number | undefined;
  inviteId: string | undefined;
  tokenHash: string | undefined;
  expiresAt: Date;
};

export type Reservation = {
  payment: Payment;
  policy: RegistrationPolicy;
  account: PayoutAccount;
  reused: boolean;
};

export type ConfirmResult = 'joined' | 'refund' | 'duplicate' | 'missing';

export class PaymentRepository {
  constructor(
    private readonly participations = new ParticipationRepository(),
    private readonly capacityPolicy = new CapacityPolicy(),
  ) {}

  // Holds one seat while the buyer pays.
  reserve(input: ReserveInput): Promise<Reservation> {
    return prisma.$transaction(async (transaction) => {
      const { eventId, userId } = input;
      const policy = await this.participations.lockPolicy(transaction, eventId);
      const amountCents = this.amount(policy, input.amountCents);
      const membership = await transaction.membership.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (membership?.status === 'JOINED')
        throw new PaymentError(
          'You already joined this event.',
          'ALREADY_JOINED',
        );
      const account = await transaction.payoutAccount.findUnique({
        where: { userId: policy.organizerId },
      });
      if (!account?.chargesEnabled)
        throw new PaymentError(
          'The organizer cannot accept payments yet.',
          'ORGANIZER_PAYMENTS_UNAVAILABLE',
        );

      const open = await transaction.payment.findFirst({
        where: { eventId, userId, status: 'PENDING' },
      });
      if (open?.held && open.checkoutUrl && open.expiresAt > new Date())
        return { payment: open, policy, account, reused: true };
      if (open) await this.releaseHeld(transaction, open);

      const access = await this.participations.findAccess(
        transaction,
        policy,
        userId,
        input.inviteId,
        input.tokenHash,
      );
      this.capacityPolicy.assertCanJoin(
        open?.held ? { ...policy, occupied: policy.occupied - 1 } : policy,
      );
      await transaction.registrationPolicy.update({
        where: { eventId },
        data: { occupied: { increment: 1 } },
      });
      const payment = await transaction.payment.create({
        data: {
          eventId,
          userId,
          organizerId: policy.organizerId,
          amountCents,
          currency: policy.currency,
          expiresAt: input.expiresAt,
          inviteId: access.inviteId,
          inviteLinkId: access.linkId,
        },
      });
      return { payment, policy, account, reused: false };
    });
  }

  attachCheckout(
    paymentId: string,
    sessionId: string,
    url: string,
  ): Promise<Payment> {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { providerSessionId: sessionId, checkoutUrl: url },
    });
  }

  // Frees the seat when checkout fails or expires.
  expire(paymentId: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const found = await transaction.payment.findUnique({
        where: { id: paymentId },
        select: { eventId: true },
      });
      if (!found) return false;
      await this.participations.lockPolicy(transaction, found.eventId);
      const payment = await this.lockPayment(transaction, paymentId);
      if (payment?.status !== 'PENDING') return false;
      await this.releaseHeld(transaction, payment);
      return true;
    });
  }

  async expireDue(now = new Date()): Promise<number> {
    const due = await prisma.payment.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    let expired = 0;
    for (const item of due) if (await this.expire(item.id)) expired++;
    return expired;
  }

  // Seats the buyer once the provider confirms payment.
  confirm(
    paymentId: string,
    sessionId: string,
    providerPaymentId: string,
    amountCents: number,
  ): Promise<ConfirmResult> {
    return prisma.$transaction(async (transaction) => {
      const found = await transaction.payment.findUnique({
        where: { id: paymentId },
        select: { eventId: true },
      });
      if (!found) return 'missing';
      const policy = await this.participations.lockPolicy(
        transaction,
        found.eventId,
      );
      const payment = await this.lockPayment(transaction, paymentId);
      if (!payment) return 'missing';
      if (payment.status !== 'PENDING' && payment.status !== 'EXPIRED')
        return 'duplicate';
      if (
        payment.providerSessionId !== sessionId ||
        payment.amountCents !== amountCents
      )
        throw new Error('Payment confirmation does not match checkout.');

      const paid = {
        providerPaymentId,
        paidAt: new Date(),
        held: false,
      };
      const membership = await transaction.membership.findUnique({
        where: {
          eventId_userId: { eventId: payment.eventId, userId: payment.userId },
        },
      });
      const seated = payment.held && payment.status === 'PENDING';
      const canSeat =
        membership?.status !== 'JOINED' && (seated || this.hasSeat(policy));
      if (!canSeat) {
        if (seated)
          await transaction.registrationPolicy.update({
            where: { eventId: payment.eventId },
            data: { occupied: { decrement: 1 } },
          });
        await transaction.payment.update({
          where: { id: payment.id },
          data: { ...paid, status: 'REFUND_PENDING' },
        });
        return 'refund';
      }
      await this.participations.admit(
        transaction,
        payment.eventId,
        payment.userId,
        membership,
        { inviteId: payment.inviteId, linkId: payment.inviteLinkId },
        !seated,
      );
      await transaction.payment.update({
        where: { id: payment.id },
        data: { ...paid, status: 'PAID' },
      });
      return 'joined';
    });
  }

  refundsDue(): Promise<Payment[]> {
    return prisma.payment.findMany({
      where: { status: 'REFUND_PENDING', refundAttempts: { lt: 20 } },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
  }

  markRefunded(paymentId: string): Promise<Prisma.BatchPayload> {
    return prisma.payment.updateMany({
      where: { id: paymentId, status: 'REFUND_PENDING' },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
  }

  refundFailed(paymentId: string): Promise<Payment> {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { refundAttempts: { increment: 1 } },
    });
  }

  latest(eventId: string, userId: string): Promise<Payment | null> {
    return prisma.payment.findFirst({
      where: { eventId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  forEvent(eventId: string): Promise<Payment[]> {
    return prisma.payment.findMany({
      where: {
        eventId,
        status: { in: ['PAID', 'REFUND_PENDING', 'REFUNDED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  account(userId: string): Promise<PayoutAccount | null> {
    return prisma.payoutAccount.findUnique({ where: { userId } });
  }

  createAccount(
    userId: string,
    providerAccountId: string,
  ): Promise<PayoutAccount> {
    return prisma.payoutAccount.upsert({
      where: { userId },
      create: { userId, providerAccountId },
      update: {},
    });
  }

  updateAccount(
    providerAccountId: string,
    state: { chargesEnabled: boolean; detailsSubmitted: boolean },
  ): Promise<Prisma.BatchPayload> {
    return prisma.payoutAccount.updateMany({
      where: { providerAccountId },
      data: state,
    });
  }

  private amount(
    policy: RegistrationPolicy,
    requested: number | undefined,
  ): number {
    if (policy.pricingMode === 'ONLINE') return policy.priceCents;
    if (policy.pricingMode === 'DONATION' && requested && requested >= 50)
      return requested;
    throw new PaymentError(
      'This event does not take online payments.',
      'PAYMENT_NOT_REQUIRED',
    );
  }

  private hasSeat(policy: RegistrationPolicy): boolean {
    try {
      this.capacityPolicy.assertCanJoin(policy);
      return true;
    } catch {
      return false;
    }
  }

  private async releaseHeld(
    transaction: Prisma.TransactionClient,
    payment: Payment,
  ): Promise<void> {
    if (payment.held)
      await transaction.$executeRaw`
        UPDATE "registration_policy" SET occupied = GREATEST(0, occupied - 1)
        WHERE "eventId" = ${payment.eventId}::uuid
      `;
    await transaction.payment.update({
      where: { id: payment.id },
      data: { status: 'EXPIRED', held: false },
    });
  }

  private async lockPayment(
    transaction: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<Payment | null> {
    await transaction.$queryRaw`
      SELECT id FROM "payment" WHERE id = ${paymentId}::uuid FOR UPDATE
    `;
    return transaction.payment.findUnique({ where: { id: paymentId } });
  }
}
