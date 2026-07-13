import * as dns from 'node:dns/promises';

dns.setServers(['1.1.1.1', '8.8.8.8']);

import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Defesa Civil - São Luís Weather Watch API')
    .setDescription(
      'Sistema resiliente de monitoramento climático, geofencing de alertas e contingência para a cidade de São Luís.',
    )
    .setVersion('1.0')
    .addTag('clima')
    .build();
    
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory); // Define o link da documentação

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();