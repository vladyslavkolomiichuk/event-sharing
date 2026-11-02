import { SystemServicesResponseSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import type { ServiceHealthClient } from '../clients/ServiceHealthClient.js';

export class SystemController {
  constructor(private readonly clients: ServiceHealthClient[]) {}

  readonly listServices: RequestHandler = async (_request, response) => {
    const services = await Promise.all(
      this.clients.map(async (client) => ({
        service: client.service,
        status: await client.check(),
      })),
    );

    response.status(200).json(SystemServicesResponseSchema.parse({ services }));
  };
}
