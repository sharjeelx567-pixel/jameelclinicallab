import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AuthController } from './auth.controller';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AuthModule {}
