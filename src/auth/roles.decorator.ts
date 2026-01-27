import { Reflector } from '@nestjs/core';

import { LE_USER_ROLES } from 'src/constants/constants';

export const Roles = Reflector.createDecorator<LE_USER_ROLES[]>();
