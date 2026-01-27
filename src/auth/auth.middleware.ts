import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { Firestore } from '@google-cloud/firestore';
import { NextFunction, Request, Response } from 'express';

import { UserDto } from 'src/Controllers/AccountConfig/account-config.dto';
import { AccountConfigService } from 'src/Controllers/AccountConfig/account-config.service';
import { FirestoreDatabaseProvider } from 'src/firestore/firestore.providers';

import { LpToken } from './auth.dto';

const CONTEXT = '[AuthMiddleware]';

interface AuthenticatedRequest extends Request {
  token?: string;
  user?: UserDto;
  accountId?: string;
}

interface AuthResult {
  token: LpToken | null;
  user: UserDto | null;
  accessToken: string | null;
}

interface CCAuthResult {
  accessToken: string;
  token: { accountId: string };
  user: null;
}

interface CookieAuth {
  auth: string;
  user: string;
}

@Injectable()
export class PreAuthMiddleware implements NestMiddleware {
  private readonly MAX_TOKEN_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  // Restrict token character set to prevent catastrophic backtracking in regex
  private readonly AUTH_HEADER_PATTERNS = {
    BEARER: /^Bearer\s+([\w.+/=-]+)$/i,
    CC_BEARER: /^CC-Bearer\s+([\w.+/=-]+)$/i,
  };

  constructor(
    @InjectPinoLogger(PreAuthMiddleware.name)
    private readonly logger: PinoLogger,
    private readonly accountConfigService: AccountConfigService,
    @Inject(FirestoreDatabaseProvider) private readonly database: Firestore,
  ) {
    this.logger.setContext(CONTEXT);
  }

  private extractCookieAuth(request: AuthenticatedRequest): CookieAuth | null {
    try {
      const auth = request.signedCookies?.cc_auth;
      const user = request.signedCookies?.cc_user;

      if (!auth || typeof auth !== 'string') {
        return null;
      }

      return { auth, user: user || '' };
    } catch (error) {
      this.logger.warn({ fn: 'extractCookieAuth', error: error.message });

      return null;
    }
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    try {
      const authHeader = request.headers?.authorization;

      if (!authHeader || typeof authHeader !== 'string') {
        return null;
      }

      // Check for standard Bearer token
      const bearerMatch = this.AUTH_HEADER_PATTERNS.BEARER.exec(authHeader);

      if (bearerMatch) {
        return bearerMatch[1];
      }

      // Check for CC-Bearer token
      const ccBearerMatch =
        this.AUTH_HEADER_PATTERNS.CC_BEARER.exec(authHeader);

      if (ccBearerMatch) {
        return ccBearerMatch[1];
      }

      return null;
    } catch (error) {
      this.logger.warn({ fn: 'extractBearerToken', error: error.message });

      return null;
    }
  }
  private async getLPToken(token: string): Promise<LpToken | null> {
    try {
      if (!token || typeof token !== 'string' || token.length < 10) {
        return null;
      }

      const myToken = token;

      this.logger.info({ fn: 'getLPToken', myToken });

      const lpTokenDocument = await this.database
        .collection('lp_tokens')
        .doc(token)
        .get();

      if (!lpTokenDocument.exists) {
        this.logger.warn({
          fn: 'getLPToken',
          message: 'Token not found in database',
        });

        return null;
      }

      const tokenData = lpTokenDocument.data() as LpToken;

      // Validate token expiry if available
      if (tokenData.expiry) {
        const expiryDate = new Date(tokenData.expiry);

        if (expiryDate < new Date()) {
          this.logger.warn({
            fn: 'getLPToken',
            message: 'Token has expired',
            expiry: tokenData.expiry,
          });

          return null;
        }
      }

      return tokenData;
    } catch (error) {
      this.logger.error({
        fn: 'getLPToken',
        error: error.message,
        token: token?.substring(0, 10) + '...',
      });

      return null;
    }
  }

  private async validateCCAuth(
    token: string,
    accountId: string,
  ): Promise<CCAuthResult | null> {
    try {
      if (!token || !accountId) {
        this.logger.warn({
          fn: 'validateCCAuth',
          message: 'Missing token or accountId',
        });

        return null;
      }

      // Validate token by attempting to retrieve users
      await this.accountConfigService.getAllUsers(accountId, token);

      this.logger.info({
        fn: 'validateCCAuth',
        message: 'CC auth validation successful',
        accountId,
      });

      return {
        accessToken: token,
        token: { accountId },
        user: null,
      };
    } catch (error) {
      this.logger.error({
        fn: 'validateCCAuth',
        error: error.message,
        accountId,
        message: 'CC auth validation failed',
      });

      return null;
    }
  }

  private async authenticateToken(
    request: AuthenticatedRequest,
  ): Promise<AuthResult> {
    const function_ = 'authenticateToken';

    const defaultResponse: AuthResult = {
      token: null,
      user: null,
      accessToken: null,
    };

    try {
      const authHeader = request.headers?.authorization;
      let accountId = request.params?.accountId;

      // Handle CC-Bearer authentication
      if (authHeader?.includes('CC-Bearer')) {
        const ccToken = this.extractBearerToken(request);

        if (ccToken && accountId) {
          const ccAuthResult = await this.validateCCAuth(ccToken, accountId);

          if (ccAuthResult) {
            return {
              token: ccAuthResult.token as any,
              user: ccAuthResult.user,
              accessToken: ccAuthResult.accessToken,
            };
          }
        }

        this.logger.warn({
          fn: function_,
          message: 'CC-Bearer authentication failed',
        });

        return defaultResponse;
      }

      // Extract token from Bearer header or cookies
      const bearerToken = this.extractBearerToken(request);
      const cookieAuth = this.extractCookieAuth(request);
      const accessToken = bearerToken || cookieAuth?.auth;

      if (!accessToken) {
        this.logger.debug({
          fn: function_,
          message: 'No authentication token found',
        });

        return defaultResponse;
      }

      // TODO: Replace this workaround with proper LP Gatekeeper service verification
      // Currently using token lookup in Firestore as validation method
      const token = await this.getLPToken(accessToken);

      if (!token) {
        this.logger.warn({
          fn: function_,
          message: 'Invalid or expired token',
        });

        return defaultResponse;
      }

      accountId = accountId || token.accountId;
      const uid = token.uid || token.id;

      if (!uid) {
        this.logger.warn({
          fn: function_,
          message: 'No user ID found in token',
          accountId,
        });

        return defaultResponse;
      }

      // Retrieve user data
      const userDocument = await this.database
        .collection('users')
        .doc(String(uid))
        .get();

      if (!userDocument.exists) {
        this.logger.warn({
          fn: function_,
          message: 'User not found in database',
          uid,
          accountId,
        });

        return defaultResponse;
      }

      const userData = userDocument.data() as UserDto;

      this.logger.debug({
        fn: function_,
        message: 'Authentication successful',
        accountId,
        uid,
      });

      return {
        token,
        user: userData,
        accessToken,
      };
    } catch (error) {
      this.logger.error({
        fn: function_,
        error: error.message,
        accountId: request.params?.accountId,
      });

      return defaultResponse;
    }
  }

  async use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const function_ = 'use';
    const startTime = Date.now();

    try {
      const isRoot = request.path === '/';
      const userAgent = request.headers['user-agent'];
      const clientIP = request.ip || request.socket.remoteAddress;

      this.logger.debug({
        fn: function_,
        method: request.method,
        path: request.path,
        userAgent,
        clientIP,
      });

      // Authenticate the request
      const { token, user, accessToken } =
        await this.authenticateToken(request);

      // Handle root path redirects
      if (isRoot) {
        if (token?.accountId) {
          this.logger.info({
            fn: function_,
            message: 'Redirecting to account page',
            accountId: token.accountId,
          });

          response.redirect('/' + token.accountId);

          return;
        } else {
          this.logger.info({
            fn: function_,
            message: 'Redirecting to login page',
          });

          response.redirect('/login');

          return;
        }
      }

      // Validate authentication for protected routes
      if (!token && !user) {
        this.logger.warn({
          fn: function_,
          message: 'Unauthorized access attempt',
          path: request.path,
          clientIP,
        });

        if (!response.headersSent) {
          response.status(HttpStatus.UNAUTHORIZED).json({
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Unauthorized - Invalid or missing authentication token',
            timestamp: new Date().toISOString(),
            path: request.path,
          });
        }

        return;
      }

      // Attach authenticated data to request
      request.user = user;
      request.token = accessToken;
      request.accountId = token?.accountId;

      const processingTime = Date.now() - startTime;

      this.logger.debug({
        fn: function_,
        message: 'Authentication middleware completed',
        processingTime: `${processingTime}ms`,
        accountId: token?.accountId,
      });

      next();
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error({
        fn: function_,
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`,
        path: request.path,
      });

      if (!response.headersSent) {
        if (
          error.message?.includes('token has expired') ||
          error.message?.includes('expired')
        ) {
          response.status(HttpStatus.UNAUTHORIZED).json({
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Authentication token has expired',
            timestamp: new Date().toISOString(),
            path: request.path,
          });
        } else {
          response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error during authentication',
            timestamp: new Date().toISOString(),
            path: request.path,
          });
        }
      }
    }
  }
}
