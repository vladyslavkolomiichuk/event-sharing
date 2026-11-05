import { ServiceNameSchema, type ServiceName } from '@event-sharing/contracts';
import { z } from 'zod';
import { ServiceMessageCipher } from './ServiceMessageCipher.js';

const PacketSchema = z.object({
  sender: ServiceNameSchema,
  target: ServiceNameSchema,
  payload: z.string(),
});

export class ServicePeerCipher {
  private readonly peers = new Map<ServiceName, ServiceMessageCipher>();

  constructor(
    private readonly service: ServiceName,
    keys: Record<ServiceName, string>,
  ) {
    for (const [peer, key] of Object.entries(keys)) {
      this.peers.set(
        ServiceNameSchema.parse(peer),
        new ServiceMessageCipher(key),
      );
    }
  }

  encode(message: { sender: ServiceName; target: ServiceName }): string {
    const cipher = this.peers.get(message.target);
    if (!cipher || message.sender !== this.service)
      throw new Error('Unknown service recipient.');
    return JSON.stringify({
      sender: message.sender,
      target: message.target,
      payload: cipher.encode(message),
    });
  }

  decode(value: string): unknown {
    const packet = PacketSchema.parse(JSON.parse(value));
    const cipher = this.peers.get(packet.sender);
    if (!cipher || packet.target !== this.service)
      throw new Error('Invalid service recipient.');
    const message = cipher.decode(packet.payload);
    const identity = PacketSchema.omit({ payload: true }).parse(message);
    if (identity.sender !== packet.sender || identity.target !== packet.target)
      throw new Error('Invalid service identity.');
    return message;
  }
}
