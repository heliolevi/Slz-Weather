import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from '../controllers/app.controller';
import { WeatherModule } from './weather.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    // Limite padrão para toda a API (60 requisições/minuto por IP) — protege rotas de leitura
    // simples (/clima/alertas, /clima/emergencias, /clima/tendencia). /clima/atual tem um limite
    // próprio, bem mais restrito, porque dispara uma avaliação real (ver WeatherController).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 60,
      },
    ]),
    WeatherModule,
  ],
  controllers: [AppController],
  providers: [
    // Aplica o ThrottlerGuard globalmente, em todas as rotas, sem precisar decorar cada
    // controller manualmente. Rotas individuais podem apertar o limite com @Throttle(...).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
