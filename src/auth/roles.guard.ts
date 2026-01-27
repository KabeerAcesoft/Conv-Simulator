import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Profile } from 'src/Controllers/AccountConfig/account-config.dto';

import { Roles } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const token = request.token;

    if (!token || !user) return false;

    const hasProfiles = roles.some((role) =>
      user.profiles.some((profile: Profile) => profile.name === role),
    );

    return hasProfiles;
  }
}
