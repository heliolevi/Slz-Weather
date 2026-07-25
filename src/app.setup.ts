import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function configureApp(app: INestApplication): void {
  // Confia no primeiro proxy à frente da aplicação (o edge da Vercel em produção) para resolver
  // o IP real do cliente a partir do header X-Forwarded-For. Sem isso, tanto o rate limiting
  // (ThrottlerGuard) quanto o log [ACESSO] em GET /clima/atual veriam sempre o IP interno do
  // proxy — o mesmo IP para todo mundo — em vez do IP de quem está de fato fazendo a requisição.
  // Em dev local (sem proxy na frente), isso não tem efeito: sem X-Forwarded-For, o Express cai
  // de volta pro endereço do socket normalmente.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.enableCors();

  // Valida automaticamente qualquer @Query()/@Body() tipado com um DTO decorado (class-validator) —
  // hoje, isso cobre a paginação de GET /clima/alertas (PaginationQueryDto). `transform: true` converte
  // strings de query string pra number antes da validação; `whitelist: true` descarta qualquer campo
  // não declarado no DTO em vez de deixá-lo passar silenciosamente.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

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
