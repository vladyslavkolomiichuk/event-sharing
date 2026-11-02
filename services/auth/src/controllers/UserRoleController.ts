import { UserRoleSchema, UsernameSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { UpdateUserRoleSchema } from '../schemas/update-user-role.schema.js';
import type { UserRoleService } from '../services/UserRoleService.js';

export class UserRoleController {
  constructor(private readonly service: UserRoleService) {}

  readonly update: RequestHandler = async (request, response) => {
    const actor = request.authUser;
    if (!actor) {
      throw new UnauthorizedError();
    }

    const username = UsernameSchema.parse(request.params.username);
    const { role } = UpdateUserRoleSchema.parse(request.body);
    const updated = await this.service.changeRole(
      actor.id,
      UserRoleSchema.parse(actor.role),
      username,
      role,
    );

    response.status(200).json(updated);
  };
}
