import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, StorageService],
  exports: [SettingsService, StorageService],
})
export class SettingsModule {}
