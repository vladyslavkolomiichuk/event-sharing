import { randomUUID } from 'node:crypto';
import {
  RpcRequestSchema,
  RpcResponseSchema,
  type RpcRequest,
  type RpcResponse,
  type RpcOperation,
  type ServiceName,
} from '@event-sharing/contracts';
import type { Consumer, Producer } from 'kafkajs';
import { mapApiError } from '@event-sharing/common';
import { KafkaClientFactory } from './KafkaClientFactory.js';
import { ServicePeerCipher } from './ServicePeerCipher.js';
import { ServiceRpcError } from './ServiceRpcError.js';

type Handler = (request: RpcRequest) => Promise<unknown>;
type Pending = {
  target: ServiceName;
  operation: RpcOperation;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
export const serviceRequestTopic = (name: ServiceName) =>
  `event-sharing.rpc.${name}.v1`;
export const SERVICE_REPLY_TOPIC = 'event-sharing.rpc.replies.v1';

export class KafkaServiceBus {
  private readonly producer: Producer;
  private readonly replies: Consumer;
  private readonly requests: Consumer;
  private readonly cipher: ServicePeerCipher;
  private readonly pending = new Map<string, Pending>();
  private handler?: Handler;
  private connecting: Promise<void> | undefined;
  private ready = false;
  private stopped = false;
  private interval?: NodeJS.Timeout;

  constructor(
    readonly service: ServiceName,
    brokers: string[],
    keys: Record<ServiceName, string>,
    private readonly namespace = 'event-sharing',
  ) {
    const factory = new KafkaClientFactory({
      clientId: `event-sharing-${service}-rpc`,
      brokers,
    });
    this.producer = factory.createProducer();
    this.replies = factory.createConsumer(
      `${namespace}-${service}-rpc-replies-${randomUUID()}`,
    );
    this.requests = factory.createConsumer(`${namespace}-${service}-rpc-v1`);
    this.cipher = new ServicePeerCipher(service, keys);
    for (const consumer of [this.requests, this.replies]) {
      consumer.on(consumer.events.CRASH, ({ payload }) => {
        if (!payload.restart) this.ready = false;
      });
    }
  }

  start(handler: Handler): void {
    this.handler = handler;
    this.interval = setInterval(
      () => void this.connect().catch(() => {}),
      5000,
    );
    void this.connect().catch(() => {});
  }

  async call(
    target: ServiceName,
    operation: RpcOperation,
    data: unknown,
    authorization?: string,
    timeoutMs = 30000,
  ): Promise<unknown> {
    const id = randomUUID();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ServiceRpcError(`${target} did not respond.`));
      }, timeoutMs);
      this.pending.set(id, { target, operation, resolve, reject, timer });
    });
    // Observe early timeouts while Kafka is reconnecting.
    void result.catch(() => {});
    try {
      const request: RpcRequest = {
        kind: 'request',
        id,
        sender: this.service,
        target,
        operation,
        data,
        deadline: Date.now() + timeoutMs,
        ...(authorization ? { authorization } : {}),
      };
      void this.sendRequest(request).catch((error: unknown) => {
        const pending = this.pending.get(id);
        if (pending)
          pending.reject(
            error instanceof Error
              ? error
              : new ServiceRpcError('Request delivery failed.'),
          );
      });
      return await result;
    } finally {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
      }
    }
  }

  private async sendRequest(request: RpcRequest): Promise<void> {
    await this.connect();
    if (!this.pending.has(request.id) || request.deadline < Date.now()) return;
    await this.producer.send({
      topic: this.requestTopic(request.target),
      acks: -1,
      messages: [{ key: request.id, value: this.cipher.encode(request) }],
    });
    console.info(
      `[KAFKA REQUEST] ${this.service} -> ${request.target} | ${request.operation} | id=${request.id}`,
    );
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.interval) clearInterval(this.interval);
    await this.connecting?.catch(() => {});
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new ServiceRpcError('Service is stopping.'));
    }
    this.pending.clear();
    await Promise.all([
      this.requests.disconnect(),
      this.replies.disconnect(),
      this.producer.disconnect(),
    ]);
  }

  private async connect(): Promise<void> {
    if (this.stopped) throw new ServiceRpcError('Service is stopping.');
    if (this.ready) return;
    if (!this.connecting)
      this.connecting = this.connectOnce().finally(() => {
        this.connecting = undefined;
      });
    await this.connecting;
  }

  private async connectOnce(): Promise<void> {
    try {
      await this.producer.connect();
      await this.replies.connect();
      await this.replies.subscribe({
        topic: this.replyTopic(),
        fromBeginning: false,
      });
      const joinedReplies = this.waitForGroup(this.replies);
      await this.replies.run({
        eachMessage: async ({ message }) => {
          let response: RpcResponse;
          try {
            response = RpcResponseSchema.parse(
              this.cipher.decode(message.value?.toString() ?? ''),
            );
          } catch {
            return;
          }
          const pending = this.pending.get(response.id);
          if (
            !pending ||
            response.target !== this.service ||
            response.sender !== pending.target ||
            response.operation !== pending.operation
          )
            return;
          clearTimeout(pending.timer);
          this.pending.delete(response.id);
          if (response.error)
            pending.reject(
              new ServiceRpcError(
                response.error.message,
                response.error.code,
                response.error.statusCode,
              ),
            );
          else pending.resolve(response.data);
        },
      });
      await joinedReplies;
      if (this.handler) {
        await this.requests.connect();
        await this.requests.subscribe({
          topic: this.requestTopic(this.service),
          fromBeginning: true,
        });
        await this.requests.run({
          partitionsConsumedConcurrently: 3,
          eachMessage: async ({ message, heartbeat }) => {
            let request: RpcRequest;
            try {
              request = RpcRequestSchema.parse(
                this.cipher.decode(message.value?.toString() ?? ''),
              );
            } catch {
              return;
            }
            if (
              request.target !== this.service ||
              request.deadline < Date.now()
            )
              return;
            const timer = setInterval(
              () => void heartbeat().catch(() => {}),
              3000,
            );
            const response: RpcResponse = {
              kind: 'response',
              id: request.id,
              sender: this.service,
              target: request.sender,
              operation: request.operation,
            };
            try {
              response.data = await this.handler!(request);
            } catch (error) {
              const mapped = mapApiError(error);
              response.error =
                error instanceof ServiceRpcError
                  ? {
                      message: error.message,
                      code: error.code,
                      statusCode: error.statusCode,
                    }
                  : mapped.unexpected
                    ? {
                        message: 'The service could not process this request.',
                        code: 'SERVICE_UNAVAILABLE',
                        statusCode: 503,
                      }
                    : {
                        message: mapped.body.message,
                        code: mapped.body.code,
                        statusCode: mapped.statusCode,
                      };
            } finally {
              clearInterval(timer);
            }
            await this.producer.send({
              topic: this.replyTopic(),
              acks: -1,
              messages: [
                { key: request.id, value: this.cipher.encode(response) },
              ],
            });
            console.info(
              `[KAFKA REPLY] ${this.service} -> ${request.sender} | ${request.operation} | id=${request.id} | ${response.error?.code ?? 'completed'}`,
            );
          },
        });
      }
      this.ready = true;
    } catch (error) {
      await Promise.allSettled([
        this.requests.disconnect(),
        this.replies.disconnect(),
        this.producer.disconnect(),
      ]);
      throw error;
    }
  }
  private waitForGroup(consumer: Consumer): Promise<void> {
    const joined = new Promise<void>((resolve, reject) => {
      const remove = consumer.on(consumer.events.GROUP_JOIN, () => {
        clearTimeout(timer);
        remove();
        resolve();
      });
      const timer = setTimeout(() => {
        remove();
        reject(new ServiceRpcError('The reply consumer is not ready.'));
      }, 30000);
      timer.unref();
    });
    void joined.catch(() => {});
    return joined;
  }
  private requestTopic(service: ServiceName): string {
    return `${this.namespace}.rpc.${service}.v1`;
  }
  private replyTopic(): string {
    return `${this.namespace}.rpc.replies.v1`;
  }
}
