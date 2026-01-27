import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PreAuthMiddleware } from '../auth/auth.middleware.js';

@Module({
  imports: [ConfigModule],
  providers: [PreAuthMiddleware],
  exports: [],
})
export class FirebaseModule {}
