import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function configureApp(app: INestApplication): void {
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
}
