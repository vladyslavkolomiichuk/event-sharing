import { randomUUID } from 'node:crypto';
import {
  PrivacyExportResultSchema,
  ServiceNameSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { privacyDatabase } from '../config/service-bus.js';
import { PrivacyServiceClient } from '../clients/PrivacyServiceClient.js';

const services = [
  'auth',
  'users',
  'events',
  'participation',
  'messages',
  'notifications',
  'geo-search',
  'event-log',
  'storage',
];

export class PrivacyExportController {
  create: RequestHandler = async (request, response) => {
    const userId = request.authUser!.id;
    const tx = await privacyDatabase.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `privacy-export:${userId}`,
      ]);
      const existing = await tx.query<{ id: string }>(
        'SELECT id FROM privacy_export_job WHERE "userId" = $1 AND "expiresAt" > now() ORDER BY "createdAt" DESC LIMIT 1',
        [userId],
      );
      const id = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rowCount) {
        await tx.query(
          'INSERT INTO privacy_export_job (id, "userId") VALUES ($1, $2)',
          [id, userId],
        );
        for (const service of services)
          await tx.query(
            'INSERT INTO privacy_export_source ("jobId", service) VALUES ($1, $2)',
            [id, service],
          );
      }
      await tx.query('COMMIT');
      response.status(202).set('cache-control', 'no-store').json({ id });
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    } finally {
      tx.release();
    }
  };

  status: RequestHandler = async (request, response) => {
    const result = await privacyDatabase.pool.query(
      `SELECT job.id, job."createdAt", job."expiresAt", job."completedAt", count(source."completedAt")::integer AS completed, count(source.service)::integer AS total FROM privacy_export_job job JOIN privacy_export_source source ON source."jobId" = job.id WHERE job."userId" = $1 AND job."expiresAt" > now() GROUP BY job.id ORDER BY job."createdAt" DESC LIMIT 1`,
      [request.authUser!.id],
    );
    const job = result.rows[0];
    response
      .set('cache-control', 'no-store')
      .json(
        job
          ? { ...job, status: job.completedAt ? 'READY' : 'PROCESSING' }
          : { status: 'NONE' },
      );
  };

  download: RequestHandler = async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const jobs = await privacyDatabase.pool.query(
      'SELECT * FROM privacy_export_job WHERE id = $1 AND "userId" = $2 AND "completedAt" IS NOT NULL AND "expiresAt" > now()',
      [id, request.authUser!.id],
    );
    if (!jobs.rowCount) {
      response.status(404).json({
        code: 'EXPORT_NOT_READY',
        message: 'The export is not ready or has expired.',
        details: [],
      });
      return;
    }
    const pages = await privacyDatabase.pool.query<{
      service: string;
      data: string;
    }>(
      'SELECT service, data FROM privacy_export_page WHERE "jobId" = $1 ORDER BY service, collection, "offset"',
      [id],
    );
    const client = new PrivacyServiceClient();
    const data: Record<string, Record<string, Record<string, unknown>[]>> = {};
    for (const item of pages.rows) {
      const service = ServiceNameSchema.parse(item.service);
      const page = PrivacyExportResultSchema.parse(
        client.cipher(service).decode(item.data),
      );
      const section = (data[service] ??= {});
      (section[page.collection] ??= []).push(...page.rows);
    }
    response
      .set('cache-control', 'no-store')
      .set(
        'content-disposition',
        'attachment; filename="event-sharing-data.json"',
      )
      .json({
        requestedAt: jobs.rows[0].createdAt,
        completedAt: jobs.rows[0].completedAt,
        userId: request.authUser!.id,
        complete: true,
        data,
      });
  };
}
