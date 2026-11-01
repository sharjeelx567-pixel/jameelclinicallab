import { Controller, Delete, Get, HttpCode, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { MediaCategory } from '../../common/entities';
import { badRequest } from '../../common/errors';
import type { AuthUser } from '../../common/types';
import { ApiZodQuery, CurrentUser, ZodBody, ZodQuery } from '../../decorators';
import type { UploadedBinary } from '../settings/storage.service';
import { MAX_MEDIA_BYTES, MediaCategoryParam, MediaListQuery, MediaService, MediaUploadFields } from './media.service';

/** Multer stops reading at the largest category limit; per-category limits are checked in the service. */
const fileInterceptor = FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES + 1, files: 1, fields: 4 } });

const category = (raw: string): MediaCategory => {
  const parsed = MediaCategoryParam.safeParse(raw);
  if (!parsed.success) throw badRequest('MEDIA_CATEGORY', 'Unknown image category');
  return parsed.data;
};

/**
 * Non-sensitive images (branding, gallery, staff/doctor photos, website art).
 * Permission is per category and checked in MediaService; every route requires sign-in.
 */
@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('config')
  config() {
    return this.media.config();
  }

  @Get()
  @ApiZodQuery(MediaListQuery)
  list(@ZodQuery(MediaListQuery) q: z.infer<typeof MediaListQuery>) {
    return this.media.list(q);
  }

  @Post(':category')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  upload(
    @Param('category') raw: string,
    @UploadedFile() file: UploadedBinary | undefined,
    @ZodBody(MediaUploadFields) fields: z.infer<typeof MediaUploadFields>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.media.upload(category(raw), file, fields, actor);
  }

  @Put(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  replace(@Param('id') id: string, @UploadedFile() file: UploadedBinary | undefined, @CurrentUser() actor: AuthUser) {
    return this.media.replace(id, file, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    await this.media.remove(id, actor);
  }
}
