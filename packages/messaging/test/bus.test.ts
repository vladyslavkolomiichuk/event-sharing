import { randomUUID } from 'node:crypto';
import {
  RPC_OPERATIONS,
  SERVICE_NAMES,
  type RpcRequest,
  type RpcResponse,
  type ServiceName,
} from '@event-sharing/contracts';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

type EachMessage = (input: {
  message: { value: Buffer };
  heartbeat: () => Promise<void>;
}) => Promise<void>;

const kafka = vi.hoisted(() => ({
  sent: [] as { topic: string; value: string }[],
  consumers: [] as { groupId: string; eachMessage?: EachMessage }[],
}));
vi.mock('kafkajs', () => {
  const producer = {
    connect: async () => {},
    disconnect: async () => {},
    send: async ({
      topic,
      messages,
    }: {
      topic: string;
      messages: { value: string }[];
    }) => {
      for (const message of messages)
        kafka.sent.push({ topic, value: message.value });
    },
  };
  const consumer = (groupId: string) => {
    const entry: { groupId: string; eachMessage?: EachMessage } = { groupId };
    kafka.consumers.push(entry);
    return {
      events: { CRASH: 'crash', GROUP_JOIN: 'join' },
      on: (name: string, listener: () => void) => {
        if (name === 'join') queueMicrotask(listener);
        return () => {};
      },
      connect: async () => {},
      disconnect: async () => {},
      subscribe: async () => {},
      run: async ({ eachMessage }: { eachMessage: EachMessage }) => {
        entry.eachMessage = eachMessage;
      },
    };
  };
  return {
    Kafka: vi.fn(function Kafka() {
      return {
        producer: () => producer,
        consumer: ({ groupId }: { groupId: string }) => consumer(groupId),
      };
    }),
    Partitioners: { DefaultPartitioner: vi.fn() },
    logLevel: { WARN: 4 },
  };
});

const {
  KafkaServiceBus,
  KafkaSigningKeys,
  ServiceRpcError,
  serviceRequestTopic,
} = await import('../src/index.js');
const { ServicePeerCipher } = await import('../src/ServicePeerCipher.js');

const keys = Object.fromEntries(
  SERVICE_NAMES.map((name) => [name, '12'.repeat(32)]),
) as Record<ServiceName, string>;
const peer = (name: ServiceName) => new ServicePeerCipher(name, keys);

beforeEach(() => {
  kafka.sent.length = 0;
  kafka.consumers.length = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

async function until(check: () => boolean) {
  for (let index = 0; index < 50 && !check(); index++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

const replies = () =>
  kafka.consumers.find((entry) => entry.groupId.includes('rpc-replies'))!;
const requests = () =>
  kafka.consumers.find((entry) => entry.groupId.endsWith('-rpc-v1'))!;

describe('KafkaServiceBus.call', () => {
  it('names request topics per service', () => {
    expect(serviceRequestTopic('users')).toBe('event-sharing.rpc.users.v1');
  });

  it('sends an encrypted request and resolves with the reply', async () => {
    const bus = new KafkaServiceBus('events', ['k:9092'], keys);
    const result = bus.call(
      'users',
      RPC_OPERATIONS.profile,
      { id: 1 },
      'Bearer t',
    );
    await until(() => kafka.sent.length > 0);
    expect(kafka.sent[0]?.topic).toBe('event-sharing.rpc.users.v1');
    const request = peer('users').decode(kafka.sent[0]!.value) as RpcRequest;
    expect(request).toMatchObject({
      sender: 'events',
      target: 'users',
      data: { id: 1 },
      authorization: 'Bearer t',
    });
    const response: RpcResponse = {
      kind: 'response',
      id: request.id,
      sender: 'users',
      target: 'events',
      operation: request.operation,
      data: { name: 'Iryna' },
    };
    await replies().eachMessage!({
      message: { value: Buffer.from(peer('users').encode(response)) },
      heartbeat: async () => {},
    });
    await expect(result).resolves.toEqual({ name: 'Iryna' });
    await bus.stop();
  });

  it('rejects with the remote error', async () => {
    const bus = new KafkaServiceBus('events', ['k:9092'], keys);
    const result = bus.call('users', RPC_OPERATIONS.profile, {});
    await until(() => kafka.sent.length > 0);
    const request = peer('users').decode(kafka.sent[0]!.value) as RpcRequest;
    await replies().eachMessage!({
      message: {
        value: Buffer.from(
          peer('users').encode({
            kind: 'response',
            id: request.id,
            sender: 'users',
            target: 'events',
            operation: request.operation,
            error: { code: 'NOT_FOUND', message: 'Missing.', statusCode: 404 },
          }),
        ),
      },
      heartbeat: async () => {},
    });
    await expect(result).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    await bus.stop();
  });

  it('ignores replies from the wrong sender', async () => {
    const bus = new KafkaServiceBus('events', ['k:9092'], keys);
    const result = bus.call('users', RPC_OPERATIONS.profile, {}, undefined, 50);
    await until(() => kafka.sent.length > 0);
    const request = peer('users').decode(kafka.sent[0]!.value) as RpcRequest;
    await replies().eachMessage!({
      message: {
        value: Buffer.from(
          peer('auth').encode({
            kind: 'response',
            id: request.id,
            sender: 'auth',
            target: 'events',
            operation: request.operation,
            data: 'spoofed',
          }),
        ),
      },
      heartbeat: async () => {},
    });
    await expect(result).rejects.toThrow('users did not respond.');
    await bus.stop();
  });

  it('rejects pending calls when stopping', async () => {
    const bus = new KafkaServiceBus('events', ['k:9092'], keys);
    const result = bus.call('users', RPC_OPERATIONS.profile, {});
    await until(() => kafka.sent.length > 0);
    await bus.stop();
    await expect(result).rejects.toThrow('Service is stopping.');
  });
});

describe('KafkaServiceBus request handler', () => {
  async function serve(handler: (request: RpcRequest) => Promise<unknown>) {
    const bus = new KafkaServiceBus('users', ['k:9092'], keys);
    bus.start(handler);
    await until(() => Boolean(requests()?.eachMessage));
    const deliver = async (overrides: Partial<RpcRequest> = {}) => {
      const request: RpcRequest = {
        kind: 'request',
        id: randomUUID(),
        sender: 'events',
        target: 'users',
        operation: RPC_OPERATIONS.profile,
        deadline: Date.now() + 10000,
        data: {},
        ...overrides,
      };
      await requests().eachMessage!({
        message: { value: Buffer.from(peer('events').encode(request)) },
        heartbeat: async () => {},
      });
      const reply = kafka.sent.at(-1);
      return reply
        ? (peer('events').decode(reply.value) as RpcResponse)
        : undefined;
    };
    return { bus, deliver };
  }

  it('replies with the handler result', async () => {
    const { bus, deliver } = await serve(async () => ({ ok: true }));
    expect(await deliver()).toMatchObject({
      sender: 'users',
      data: { ok: true },
    });
    await bus.stop();
  });

  it('maps known, validation and unexpected errors', async () => {
    let error: unknown;
    const { bus, deliver } = await serve(async () => {
      throw error;
    });
    error = new ServiceRpcError('Gone.', 'GONE', 410);
    expect((await deliver())?.error).toEqual({
      message: 'Gone.',
      code: 'GONE',
      statusCode: 410,
    });
    error = z.string().safeParse(1).error;
    expect((await deliver())?.error?.code).toBe('VALIDATION_ERROR');
    error = new Error('secret');
    expect((await deliver())?.error).toEqual({
      message: 'The service could not process this request.',
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
    });
    await bus.stop();
  });

  it('drops expired requests', async () => {
    const handler = vi.fn();
    const { bus, deliver } = await serve(handler);
    kafka.sent.length = 0;
    expect(await deliver({ deadline: Date.now() - 1 })).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    await bus.stop();
  });
});

describe('KafkaSigningKeys', () => {
  it('loads keys over RPC and verifies tokens', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
    const bus = { call: vi.fn(async () => ({ keys: [jwk] })) };
    const signing = new KafkaSigningKeys(bus as never);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .sign(privateKey);
    const { jwtVerify } = await import('jose');
    await expect(jwtVerify(token, signing.getKey)).resolves.toBeDefined();
    await jwtVerify(token, signing.getKey);
    expect(bus.call).toHaveBeenCalledTimes(1);
    expect(bus.call).toHaveBeenCalledWith(
      'auth',
      RPC_OPERATIONS.signingKeys,
      {},
      undefined,
      5000,
    );
  });

  it('does not refresh again right after a missing key', async () => {
    const bus = { call: vi.fn(async () => ({ keys: [] })) };
    const signing = new KafkaSigningKeys(bus as never);
    const { privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'none' })
      .sign(privateKey);
    const { jwtVerify } = await import('jose');
    await expect(jwtVerify(token, signing.getKey)).rejects.toThrow();
    expect(bus.call).toHaveBeenCalledTimes(1);
  });
});
