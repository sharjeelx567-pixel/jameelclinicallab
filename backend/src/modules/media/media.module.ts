import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { CloudinaryProvider, MediaProvider } from './media-provider';
import { MediaService } from './media.service';

@Global()
@Module({
  controllers: [MediaController],
  providers: [MediaService, { provide: MediaProvider, useClass: CloudinaryProvider }],
  exports: [MediaService, MediaProvider],
})
export class MediaModule {}
