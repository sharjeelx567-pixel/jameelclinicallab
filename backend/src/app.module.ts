import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppError } from './common/errors';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { checkDatabase } from './database/database-health';
import { getEnv } from './config/env';
import { DataStore } from './database/data-store';
import { DatabaseModule } from './database/database.module';
import { Public } from './decorators';
import { AuthGuard } from './guards/auth.guard';
import { LoggingInterceptor, ResponseInterceptor } from './interceptors/response.interceptor';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AnalyzersModule } from './modules/analyzers/analyzers.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { HomeSamplingModule } from './modules/home-sampling/home-sampling.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MediaProvider } from './modules/media/media-provider';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PanelsModule } from './modules/panels/panels.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ResultsModule } from './modules/results/results.module';
import { SamplesModule } from './modules/samples/samples.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TestsModule } from './modules/tests/tests.module';
import { UsersModule } from './modules/users/users.module';

@Controller('health')
class HealthController {
  private static lastOk: { at: number; result: Awaited<ReturnType<typeof checkDatabase>> } | null = null;

  constructor(
    private readonly store: DataStore,
    private readonly media: MediaProvider,
  ) {}

  @Public()
  @Get()
  health() {
    const env = getEnv();
    return { status: 'ok', dataBackend: this.store.kind, authMode: env.AUTH_MODE, mediaConfigured: this.media.configured, time: new Date().toISOString() };
  }

  /** Real database round trip (write + read-back). 503 when the database is unreachable. */
  @Public()
  @Get('database')
  async database() {
    // Public endpoint that WRITES: a healthy result is reused for 30 s so repeated calls
    // (uptime monitors, abuse) cannot use up the daily write quota.
    if (HealthController.lastOk && Date.now() - HealthController.lastOk.at < 30_000) return { ...HealthController.lastOk.result, cached: true };
    const result = await checkDatabase(this.store);
    if (result.ok) HealthController.lastOk = { at: Date.now(), result };
    if (!result.ok) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'DATABASE_UNAVAILABLE', result.error ?? 'Database check failed', result);
    return result;
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: getEnv().RATE_LIMIT_PER_MINUTE }]),
    DatabaseModule,
    AuditLogsModule,
    AuthModule,
    SettingsModule,
    MediaModule,
    NotificationsModule,
    UsersModule,
    PatientsModule,
    DoctorsModule,
    PanelsModule,
    TestsModule,
    OrdersModule,
    SamplesModule,
    ResultsModule,
    ReportsModule,
    BillingModule,
    HomeSamplingModule,
    InventoryModule,
    AnalyzersModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
