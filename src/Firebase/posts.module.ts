import { Module } from '@nestjs/common';

import { FirebaseModule } from './firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [],
  providers: [],
})
export class PostsModule {}
