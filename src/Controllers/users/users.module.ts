import { Module } from '@nestjs/common';

import { HelperModule } from '../HelperService/helper-service.module';

import { UsersService } from './users.service';

@Module({
  imports: [HelperModule],
  controllers: [],
  providers: [UsersService],
})
export class UsersModule {}
