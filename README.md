# São Luís Weather Watch - Sistema de Alerta Precoce

## Visão Geral

O `São Luís Weather Watch` é um microsserviço NestJS para Defesa Civil de São Luís - MA. Ele combina dados meteorológicos reais da API Open-Meteo com um motor de regras críticas e um simulador sísmico para gerar alertas de severidade em tempo real.

O propósito principal é:
- salvar vidas;
- mitigar desastres;
- expor eventos extremos para painéis de crise;
- armazenar histórico de alertas em MongoDB.

## Estrutura do Projeto

- `src/weather/weather.schema.ts` — Modelo MongoDB do log de alertas, incluindo severidade e ação preventiva.
- `src/weather/weather.service.ts` — Motor analítico com regras de vento, chuva e abalos sísmicos simulados.
- `src/weather/weather.cron.ts` — Agendamento com `@Cron` a cada 30 minutos.
- `src/weather/weather.controller.ts` — Endpoints REST documentados com Swagger.
- `src/weather/weather.module.ts` — Configuração de dependências NestJS, Mongoose, HttpModule e ScheduleModule.

## Requisitos

- Node.js 20+
- pnpm
- MongoDB rodando localmente ou via URI de conexão

## Instalação

```bash
pnpm install
```

## Configuração do MongoDB

Esta aplicação já está preparada para uma conexão local padrão no `AppModule`:

```ts
MongooseModule.forRoot('mongodb://localhost:27017/sao-luis-weather-watch')
```

Se precisar usar outra URI, substitua a string acima ou mova a configuração para variáveis de ambiente e o `app.module.ts`.

## Executando o Serviço

```bash
pnpm run start:dev
```

O servidor ficará disponível na porta padrão `3000`.

## Endpoints Disponíveis

### Swagger

A documentação interativa estará disponível em:

```text
http://localhost:3000/api
```

> Caso o Swagger não esteja configurado no `main.ts`, registre `SwaggerModule` para habilitar a interface.

### API REST

Base: `http://localhost:3000/clima`

- `GET /clima/atual`
  - Acessa a API Open-Meteo, avalia regras de proteção civil, grava o alerta no MongoDB e retorna o registro atual.

- `GET /clima/alertas`
  - Retorna o histórico completo de alertas, ordenado do mais recente para o mais antigo.

- `GET /clima/emergencias`
  - Feed de crises: retorna apenas alertas em `ALERTA` ou `EMERGÊNCIA` das últimas 24 horas.

## Regras de Severidade

Os alertas são categorizados em quatro níveis:

- `INFORMATIVO` — Clima seguro.
- `ATENÇÃO` — Mudança que exige vigilância.
- `ALERTA` — Risco iminente de danos ou alagamentos.
- `EMERGÊNCIA` — Perigo de vida, desastre severo ou evacuação necessária.

## Lógica de Análise

O motor de regras do serviço avalia:

- Ventos fortes e rajadas
- Temperaturas e precipitação
- Simulação de sensor sísmico com escala Richter

### Exemplos de regras

- vento 25–40 km/h → `ATENÇÃO`
- vento > 40 km/h → `ALERTA`
- rajada > 60 km/h → `EMERGÊNCIA`
- chuva > 10 mm → `ALERTA`
- sismo simulado > 3.5 → `EMERGÊNCIA`

## Agendamento

O cron job `WeatherCron` roda automaticamente a cada 30 minutos e persiste novos alertas no MongoDB.

## Como testar manualmente

1. Inicie o serviço:
   ```bash
   pnpm run start:dev
   ```
2. Consuma o endpoint de current:
   ```bash
   curl http://localhost:3000/clima/atual
   ```
3. Veja histórico:
   ```bash
   curl http://localhost:3000/clima/alertas
   ```
4. Veja feed de emergências:
   ```bash
   curl http://localhost:3000/clima/emergencias
   ```

## Desenvolvimento

- Mantenha a separação entre domínio, infraestrutura e controller.
- O `weather.service.ts` representa o cerne das regras de negócio.
- O `weather.controller.ts` expõe apenas as operações necessárias para a Defesa Civil.

## Notas finais

Este microsserviço já está estruturado para evolução futura:
- integração com alertas por SMS/Push;
- adição de fontes de terremoto reais;
- dashboards de crise em tempo real;
- métricas e alertas automatizados para equipes de resposta.
