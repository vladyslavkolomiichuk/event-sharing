import { UserRoleSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { UpdateUserRoleSchema } from '../schemas/update-user-role.schema.js';
import type { UserRoleService } from '../services/UserRoleService.js';

const UserIdParamsSchema = z.strictObject({
  userId: z.uuid(),
});

export class UserRoleController {
  constructor(private readonly service: UserRoleService) {}

  readonly update: RequestHandler = async (request, response) => {
    const actor = request.authUser;
    if (!actor) {
      throw new UnauthorizedError();
    }

    const { userId } = UserIdParamsSchema.parse(request.params);
    const { role } = UpdateUserRoleSchema.parse(request.body);
    const updated = await this.service.changeRole(
      actor.id,
      UserRoleSchema.parse(actor.role),
      userId,
      role,
    );

    response.status(200).json(updated);
  };
}
