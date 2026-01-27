import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';

import { Firestore } from '@google-cloud/firestore';

import {
  APP_PERMISSIONS,
  APP_ROLES,
  LE_USER_ROLES,
} from 'src/constants/constants';
import { Profile } from 'src/Controllers/AccountConfig/account-config.dto';
import { AccountConfigService } from 'src/Controllers/AccountConfig/account-config.service';
import { AppUserDto } from 'src/Controllers/users/users.dto';
import { FirestoreDatabaseProvider } from 'src/firestore/firestore.providers';
import { helper } from 'src/utils/HelperService';

import { LpToken } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private accountConfigService: AccountConfigService,
    @Inject(FirestoreDatabaseProvider) private readonly database: Firestore,
  ) {}

  cookieAuth(request: any) {
    const auth = request.signedCookies.cc_auth;
    const user = request.signedCookies.cc_user;

    if (!auth) {
      return null;
    }

    return { auth, user };
  }

  async getAuthenticationToken(
    request: any,
    response?: any,
  ): Promise<{ token: LpToken; user: AppUserDto }> {
    const cookieAuth = (localRequest: any) => {
      const auth = localRequest.signedCookies.cc_auth;
      const user = localRequest.signedCookies.cc_user;

      if (!auth) {
        return null;
      }

      return { auth, user };
    };

    const bearer = request?.headers?.authorization?.replace('Bearer ', '');

    const { auth } = cookieAuth(request);
    const authToken = bearer ? bearer : auth;
    const accountId = request?.params?.accountId;

    if (!authToken) {
      return response ? response.status(401).send('Unauthorized') : null;
    }

    /*
      TODO::Verify user token via LP Gatekeeper service
      below is workaround to attempt retrieving user from LP using the bearer token to confirm validity
    */

    const token = await this.getLPToken(authToken);

    const user = await this.accountConfigService.getOneUser(
      accountId,
      token.uid,
      authToken,
    );

    if (!token) {
      return response ? response.status(401).send('Unauthorized') : null;
    }

    if (!user) {
      return response ? response.status(401).send('Unauthorized') : null;
    }

    return { token, user: user as AppUserDto };
  }

  async getUser(uid: string): Promise<AppUserDto> {
    const user = await this.database.collection('users').doc(uid).get();

    return user.data() as AppUserDto;
  }

  async getLPToken(token: string): Promise<LpToken> {
    const lpTokenInfo = await this.database
      .collection('lp_tokens')
      .doc(token)
      .get();

    return lpTokenInfo.data() as LpToken;
  }

  // firebase admin sdk is not used anymore
  // async createUser(_data: any) {
  //   throw new Error('createUser is not supported without Firebase Admin Auth');
  // }
}

export const VerifyToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const { roles } = _data as {
      permissions: string[];
      roles: LE_USER_ROLES[];
    };

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const token = request.token;

    if (!token) {
      return null;
    }

    if (!user) {
      return null;
    }

    if (
      roles &&
      roles.length > 0 &&
      !roles.some((role) =>
        user.profiles.some((profile: Profile) => profile.name === role),
      )
    ) {
      return null;
    }

    return token;
  },
);

export const VerifyUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const { roles } = _data as {
      permissions: string[];
      roles: LE_USER_ROLES[];
    };

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const token = request.token;

    if (!token) {
      return null;
    }

    if (!user) {
      return null;
    }

    if (
      roles &&
      roles.length > 0 &&
      !roles.some((role) =>
        user.profiles.some((profile: Profile) => profile.name === role),
      )
    ) {
      return null;
    }

    return user;
  },
);

export const VerifyPermissions = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const { permissions: _p } = _data as {
      permissions:
        | keyof (typeof APP_PERMISSIONS)[]
        | keyof typeof APP_PERMISSIONS;
    };

    const permissions = Array.isArray(_p) ? _p : [_p];
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const token = request.token;

    if (!token) {
      return null;
    }

    if (!user) {
      return null;
    }

    if (user?.roles?.includes(APP_ROLES.ADMIN)) {
      return user;
    }

    const hasPermission =
      Array.isArray(permissions) &&
      helper.allinArr1inArr2(permissions, user.permissions);

    if (!hasPermission) {
      return null;
    }

    return user;
  },
);

export const VerifyRoles = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const { roles } = _data as {
      permissions: string[];
      roles: APP_ROLES[];
    };

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const token = request.token;

    if (!token) {
      return null;
    }

    if (!user) {
      return null;
    }

    if (
      roles &&
      roles.length > 0 &&
      !roles.some((role) => user.roles.includes(role))
    ) {
      return null;
    }

    return user;
  },
);
