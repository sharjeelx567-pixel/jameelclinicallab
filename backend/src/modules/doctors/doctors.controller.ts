import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { patchOf } from '../../utils';
import { DoctorDto, DoctorQuery, DoctorsService } from './doctors.service';

const PartialDoctor = patchOf(DoctorDto);

@ApiTags('Doctors')
@ApiBearerAuth()
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @RequirePermissions('doctors.read')
  @ApiZodQuery(DoctorQuery)
  list(@ZodQuery(DoctorQuery) q: z.infer<typeof DoctorQuery>) {
    return this.doctors.list(q);
  }

  @Get(':id')
  @RequirePermissions('doctors.read')
  stats(@Param('id') id: string) {
    return this.doctors.stats(id);
  }

  @Post()
  @RequirePermissions('doctors.write')
  @ApiZodBody(DoctorDto)
  create(@ZodBody(DoctorDto) dto: z.infer<typeof DoctorDto>, @CurrentUser() user: AuthUser) {
    return this.doctors.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('doctors.write')
  @ApiZodBody(PartialDoctor)
  update(@Param('id') id: string, @ZodBody(PartialDoctor) dto: z.infer<typeof PartialDoctor>, @CurrentUser() user: AuthUser) {
    return this.doctors.update(id, dto, user);
  }
}
