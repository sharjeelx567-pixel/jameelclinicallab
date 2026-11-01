import { Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, CurrentUser, RequirePermissions, ZodBody } from '../../decorators';
import { SettingsService, UpdateSettingsDto } from './settings.service';

/** The logo is uploaded through the media module (POST /media/lab_logo). */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('settings.read')
  get() {
    return this.settings.get();
  }

  /** Branches, centres and categories — needed by registration forms, so any signed-in staff may read. */
  @Get('reference')
  async reference() {
    const s = await this.settings.get();
    return {
      name: s.name,
      tagline: s.tagline,
      logo: s.logo ?? null,
      branches: s.branches.filter((b) => b.active),
      collectionCenters: s.collectionCenters.filter((c) => c.active),
      patientCategories: s.patientCategories,
      maxDiscountPercent: s.billing.maxDiscountPercent,
      currency: s.billing.currency,
      barcode: s.barcode,
    };
  }

  @Put()
  @RequirePermissions('settings.write')
  @ApiZodBody(UpdateSettingsDto)
  update(@ZodBody(UpdateSettingsDto) dto: z.infer<typeof UpdateSettingsDto>, @CurrentUser() actor: AuthUser) {
    return this.settings.update(dto, actor);
  }
}
