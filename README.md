# São Luís Weather Watch — Sistema de Inteligência Climática e Resiliência para a Defesa Civil

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)

![Build Status](https://github.com/seu-usuario/nome-do-repo/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)

## O Problema

Sistemas de alerta climático para Defesa Civil não têm margem para falha silenciosa. Se a API meteorológica externa cair, atrasar ou timeout — no meio de uma tempestade — o serviço não pode simplesmente parar de responder. É exatamente quando o risco é maior que a infraestrutura de monitoramento mais precisa ficar de pé.

**São Luís Weather Watch** é uma API construída em NestJS que consome dados meteorológicos em tempo real, aplica um motor de regras de severidade (vento, chuva, sismo) e converte isso em alertas acionáveis — com **zoneamento por bairro**, **notificação automática via webhook** e **disponibilidade contínua mesmo quando a fonte de dados externa falha**.

Para o gestor público: o sistema garante que a última informação confiável nunca desaparece — se a Open-Meteo cair, a API responde com o último dado válido em cache, sinalizado como tal, em vez de retornar erro ou nada.

Para o time técnico: a resiliência não é um detalhe de implementação, é a arquitetura — retry com backoff exponencial, circuit breaker com fallback para MongoDB e logs estruturados que isolam causa raiz (DNS, timeout ou indisponibilidade real) em segundos.

## Funcionalidades

### Motor de Alertas
- Avaliação de severidade em 4 níveis: `INFORMATIVO`, `ATENÇÃO`, `ALERTA`, `EMERGÊNCIA`, a partir de vento, rajadas, precipitação e simulação de sensor sísmico.
- **Geofencing lógico**: cada alerta carrega `zonasAfetadas`, mapeando automaticamente bairros de risco (Orla Marítima, Península, Cohab, Centro Histórico, entre outros) conforme o tipo e a severidade do evento.
- Persistência histórica de todos os alertas no MongoDB.

### Resiliência de Rede
- **Retry com backoff exponencial** (RxJS `retry` + `defer`): falhas transitórias — como HTTP 503 e timeout — são reexecutadas automaticamente (até 3 tentativas, 300ms → 600ms → 1200ms), sem re-emitir a mesma requisição já resolvida.
- **Classificação de falhas**: cada erro externo é categorizado como `DNS`, `TIMEOUT`, `INDISPONIVEL` ou `CANCELADO` via `axios.isAxiosError`, decidindo automaticamente o que vale a pena reexecutar e o que deve falhar rápido.
- **Circuit Breaker com fallback**: se todas as tentativas contra a Open-Meteo se esgotarem, o serviço recupera o último alerta salvo no MongoDB, marca a resposta com `[MODO CONTINGÊNCIA - DADO EM CACHE]` e a retorna normalmente — o cliente nunca recebe um erro genérico de indisponibilidade.
- **Logs estruturados**: cada falha é logada no formato `[origem=Open-Meteo tipo=TIMEOUT codigo=ETIMEDOUT tentativa=2/3] mensagem`, grepável e pronto para dashboards de observabilidade.

### Notificação e Analytics
- **Webhook assíncrono e não-bloqueante**: alertas de severidade `ALERTA` ou `EMERGÊNCIA` disparam um POST para o endpoint da Defesa Civil em paralelo, sem travar a resposta ao cliente e com try/catch isolado.
- **Pipeline de agregação (média móvel)**: cálculo da precipitação média das últimas 3 horas via MongoDB Aggregation Framework, sinalizando risco de inundação súbita quando a média ultrapassa 10mm.
- Agendamento automático (`@Cron`) executando a análise climática a cada 30 minutos.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 |
| Linguagem | TypeScript 5.7 |
| Cliente HTTP | Axios + `@nestjs/axios` |
| Reatividade / Resiliência | RxJS 7 (`retry`, `defer`, `timer`) |
| Persistência | MongoDB + Mongoose |
| Configuração | `@nestjs/config` (variáveis de ambiente) |
| Agendamento | `@nestjs/schedule` |
| Documentação | Swagger (`@nestjs/swagger`) |
| Testes | Jest + `@nestjs/testing` |

## Arquitetura do Projeto

O código é organizado em camadas por responsabilidade técnica:

```
src/
├── main.ts                  # Bootstrap da aplicação e configuração do Swagger
├── controllers/             # Camada HTTP — validação de entrada e formatação de resposta
│   ├── app.controller.ts
│   └── weather.controller.ts
├── services/                # Regras de negócio: motor de severidade, resiliência, webhook
│   ├── weather.service.ts
│   └── weather.cron.ts
├── modules/                 # Composição de dependências (Nest DI)
│   ├── app.module.ts
│   └── weather.module.ts
└── schemas/                 # Modelos Mongoose
    └── weather.schema.ts
```

## Como Rodar

### Pré-requisitos
- Node.js 20+ (recomendado 22 LTS ou superior)
- [pnpm](https://pnpm.io/)
- Uma instância MongoDB (local ou Atlas)

### Instalação

```bash
pnpm install
```

### Configuração de ambiente

Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp .env.example .env
```

Variáveis obrigatórias no `.env`:

```env
MONGODB_URI=mongodb+srv://<usuario>:<senha>@<cluster>/sao-luis-weather-watch
OPENWEATHER_API_KEY=<sua-chave-openweathermap>
```

> `MONGODB_URI` é obrigatória — a aplicação falha ao subir sem ela. `OPENWEATHER_API_KEY` é carregada via `ConfigService` e reservada para uma futura fonte de dados secundária; a fonte principal de clima em tempo real (Open-Meteo) não exige chave.

### Executando

```bash
pnpm run start:dev
```

O servidor sobe em `http://localhost:3000`.

## Documentação da API

A documentação interativa (Swagger) fica disponível em:

```
http://localhost:3000/api
```

### Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/` | Executa a análise climática atual e retorna o alerta vigente. |
| `GET` | `/clima/atual` | Consulta a Open-Meteo, avalia as regras de severidade, persiste e retorna o alerta atual. |
| `GET` | `/clima/alertas` | Histórico completo de alertas, do mais recente ao mais antigo. |
| `GET` | `/clima/emergencias` | Feed de crises: alertas `ALERTA`/`EMERGÊNCIA` das últimas 24 horas. |
| `GET` | `/clima/tendencia` | Média móvel de precipitação das últimas 3 horas e sinalização de risco de inundação súbita. |

## Testes Automatizados

```bash
pnpm test          # suíte de testes unitários (Jest)
pnpm run test:cov  # com relatório de cobertura
pnpm run test:e2e  # testes end-to-end
```

A suíte cobre, entre outros cenários:
- Geração correta de severidade `EMERGÊNCIA` e zoneamento por vento acima de 60km/h.
- Ativação do circuit breaker e fallback para o último registro em cache quando a API externa falha.
- Retry automático em erro 503 com sucesso na tentativa seguinte, e não-retentativa em falhas de DNS.
- Cálculo correto da média móvel de precipitação via pipeline de agregação do MongoDB.

## Roadmap

- Integração com canais de notificação por SMS/Push para a população.
- Dashboard de crise em tempo real para operadores da Defesa Civil.
- Métricas de observabilidade (Prometheus/Grafana) a partir dos logs estruturados já existentes.
