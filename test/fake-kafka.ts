import { vi } from 'vitest';

type EachMessage = (input: {
  topic: string;
  partition?: number;
  message: { value: Buffer | null; key?: Buffer | null; offset?: string };
  heartbeat?: () => Promise<void>;
}) => Promise<void>;

// Shared state of every fake Kafka client in one test file.
export const kafka = {
  consumers: [] as FakeConsumer[],
  sent: [] as { topic: string; messages: { key?: string; value: string }[] }[],
  guard: {
    run: vi.fn(async (event: unknown, apply: (event: unknown) => unknown) =>
      apply(event),
    ),
    recover: vi.fn(async (work: () => Promise<void>) => work()),
    close: vi.fn(async () => {}),
  },
  reset() {
    kafka.consumers.length = 0;
    kafka.sent.length = 0;
  },
};

export class FakeConsumer {
  events = { CRASH: 'crash', GROUP_JOIN: 'join' };
  eachMessage?: EachMessage;
  subscriptions: unknown[] = [];
  on = vi.fn(() => () => {});
  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});
  subscribe = vi.fn(async (input: unknown) => {
    this.subscriptions.push(input);
  });
  run = vi.fn(async ({ eachMessage }: { eachMessage: EachMessage }) => {
    this.eachMessage = eachMessage;
  });
  constructor(readonly groupId: string) {}

  // Delivers one encoded message to the running handler.
  async deliver(topic: string, value: string | Buffer) {
    if (!this.eachMessage) throw new Error('Consumer is not running.');
    await this.eachMessage({
      topic,
      partition: 0,
      message: { value: Buffer.from(value), offset: '0' },
      heartbeat: async () => {},
    });
  }
}

export const fakeProducer = {
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  send: vi.fn(async (input: { topic: string; messages: any[] }) => {
    kafka.sent.push(input);
  }),
};

// Replaces Kafka clients and the privacy guard in the messaging package.
export function mockMessaging(original: Record<string, unknown>) {
  return {
    ...original,
    KafkaClientFactory: vi.fn(function Factory() {
      return {
        createConsumer: (groupId: string) => {
          const consumer = new FakeConsumer(groupId);
          kafka.consumers.push(consumer);
          return consumer;
        },
        createProducer: () => fakeProducer,
      };
    }),
    PrivacyEventGuard: vi.fn(function Guard() {
      return kafka.guard;
    }),
    OrderedEventProcessor: vi.fn(function Ordered(
      _url: string,
      apply: (event: unknown) => Promise<unknown>,
    ) {
      return {
        start: vi.fn(),
        close: vi.fn(async () => {}),
        run: (event: unknown) => apply(event),
      };
    }),
  };
}

// Waits until a started consumer has registered its handler.
export async function running(index = 0): Promise<FakeConsumer> {
  await vi.waitFor(() => {
    if (!kafka.consumers[index]?.eachMessage) throw new Error('not running');
  });
  return kafka.consumers[index]!;
}
