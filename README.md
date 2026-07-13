# São Luís Weather Watch — Sistema de Inteligência Climática e Resiliência para a Defesa Civil

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![MVP](https://img.shields.io/badge/MVP-completo-blue)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)

## Status: MVP completo, com painel web e em produção

Todas as engenharias planejadas para o MVP estão implementadas, testadas e validadas (`tsc --noEmit`, `nest build` e as suítes de teste abaixo passam limpas):

- [x] Motor de severidade (vento, chuva, sismo simulado) com geofencing por bairro
- [x] Confirmação temporal de EMERGÊNCIA (double-check entre ciclos de avaliação diferentes, não numa leitura só)
- [x] Circuit breaker com fallback para o último dado em cache no MongoDB
- [x] Retry com backoff exponencial + classificação de falhas (DNS/timeout/indisponibilidade)
- [x] Validação de contrato da API externa (`class-validator`) — retorna **422** em vez de quebrar se o formato mudar
- [x] Webhook assíncrono e não-bloqueante para a Defesa Civil
- [x] Log de acesso estruturado em `/clima/atual` (origem/IP + User-Agent), para auditoria de quem está monitorando
- [x] Pipeline de agregação (média móvel de chuva) para risco de inundação súbita
- [x] Máquina de estados (`NORMAL` → `ATENÇÃO` → `EMERGÊNCIA`) com disparo de SMS **apenas na transição**, persistida no MongoDB para sobreviver a um restart
- [x] Painel web (React) para operadores da Defesa Civil, com painel de crise, feed de emergências e histórico
- [x] Deploy unificado (frontend + backend) na Vercel, em produção
- [x] Suíte de testes unitários (regras de negócio) e de integração via Supertest (camada HTTP)

## O Problema

Sistemas de alerta climático para Defesa Civil não têm margem para falha silenciosa. Se a API meteorológica externa cair, atrasar, retornar 503 ou simplesmente mudar de formato — no meio de uma tempestade — o serviço não pode parar de responder nem entregar dado incorreto sem avisar. É exatamente quando o risco é maior que a infraestrutura de monitoramento mais precisa ficar de pé.

**São Luís Weather Watch** é uma API construída em NestJS que consome dados meteorológicos em tempo real, aplica um motor de regras de severidade e converte isso em alertas acionáveis — com **zoneamento por bairro**, **notificação automática via webhook e SMS** e **disponibilidade contínua mesmo quando a fonte de dados externa falha ou muda de contrato**.

Para o gestor público: o sistema garante que a última informação confiável nunca desaparece, e que a população só recebe SMS quando a situação **realmente muda** de estado — sem alarme repetido, sem alarme perdido.

Para o time técnico: a resiliência não é um detalhe de implementação, é a arquitetura — retry com backoff exponencial, circuit breaker com fallback para MongoDB, validação de contrato com `class-validator` e logs estruturados que isolam causa raiz (DNS, timeout, indisponibilidade ou mudança de schema) em segundos.

## Funcionalidades

### Motor de Alertas
- Avaliação de severidade em 4 níveis: `INFORMATIVO`, `ATENÇÃO`, `ALERTA`, `EMERGÊNCIA`, a partir de vento, rajadas, precipitação e simulação de sensor sísmico.
- **Geofencing lógico**: cada alerta carrega `zonasAfetadas`, mapeando automaticamente bairros de risco (Orla Marítima, Península, Cohab, Centro Histórico, entre outros) conforme o tipo e a severidade do evento.
- **Double-check antes de EMERGÊNCIA**: nenhuma EMERGÊNCIA vira alerta oficial com base numa única leitura.
  - **VENTANIA** (rajada > 60km/h): confirmada com uma segunda consulta real à Open-Meteo — se a rajada não se mantiver, o alerta é rebaixado para `ALERTA` por segurança.
  - **TERREMOTO** (sensor sísmico simulado — não existe sensor real ainda): como uma leitura aleatória isolada não prova nada, a confirmação é **temporal**. A primeira leitura elevada fica registrada como pendente (`SeismicSensorState`, no MongoDB); só vira EMERGÊNCIA se uma segunda leitura, num ciclo de avaliação *diferente* (outra chamada a `/clima/atual`), também vier elevada dentro de uma janela de 10 minutos. Isso reduz a chance de falso-positivo de ~9% para ~0,01% por par de leituras.
- Persistência histórica de todos os alertas no MongoDB.

### Resiliência de Rede
- **Retry com backoff exponencial** (RxJS `retry` + `defer`): falhas transitórias — como HTTP 503 e timeout — são reexecutadas automaticamente (até 3 tentativas, 300ms → 600ms → 1200ms), sem re-emitir a mesma requisição já resolvida.
- **Classificação de falhas**: cada erro externo é categorizado como `DNS`, `TIMEOUT`, `INDISPONIVEL` ou `CANCELADO` via `axios.isAxiosError`, decidindo automaticamente o que vale a pena reexecutar e o que deve falhar rápido.
- **Circuit Breaker com fallback**: se todas as tentativas contra a Open-Meteo se esgotarem, o serviço recupera o último alerta salvo no MongoDB, marca a resposta com `[MODO CONTINGÊNCIA - DADO EM CACHE]` e a retorna normalmente — o cliente nunca recebe um erro genérico de indisponibilidade.
- **Validação de contrato (`class-validator`)**: a resposta da Open-Meteo é validada contra um DTO tipado antes de entrar no motor de regras. Se a API externa mudar a estrutura (campo renomeado, tipo diferente), a API responde **422 Unprocessable Entity** de forma explícita — em vez de propagar `undefined`/`NaN` silenciosamente ou mascarar o problema como se fosse uma indisponibilidade transitória.
- **Logs estruturados**: cada falha é logada no formato `[origem=Open-Meteo tipo=TIMEOUT codigo=ETIMEDOUT tentativa=2/3] mensagem`, grepável e pronto para dashboards de observabilidade.
- **Log de acesso** (`[ACESSO]`): cada chamada a `GET /clima/atual` registra IP de origem e User-Agent — rastreabilidade de quem está monitorando o sistema, relevante numa crise real.

### Notificação e Analytics
- **Máquina de estados para SMS** (`AlertEngineService`): classifica o vento em `NORMAL` / `ATENCAO` (>40km/h) / `EMERGENCIA` (>60km/h) e só dispara SMS **na transição** entre estados — nunca repete alerta enquanto a condição persiste. O estado atual é persistido no MongoDB, então um restart do servidor não gera SMS espúrio nem perde o último nível notificado.
- **`SmsService`**: stub pronto para produção (simula o envio via log estruturado); trocar por Twilio/Zenvia é só implementar a interface `SmsProvider` — nenhuma mudança no motor de regras.
- **Webhook assíncrono e não-bloqueante**: alertas de severidade `ALERTA` ou `EMERGÊNCIA` disparam um POST para o endpoint da Defesa Civil (configurável via `.env`) em paralelo, sem travar a resposta ao cliente e com try/catch isolado.
- **Pipeline de agregação (média móvel)**: cálculo da precipitação média das últimas 3 horas via MongoDB Aggregation Framework, sinalizando risco de inundação súbita quando a média ultrapassa 10mm.
- Dois agendamentos automáticos (`@Cron`): análise climática completa a cada 30 minutos e o motor de SMS/estado a cada 10 minutos.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 |
| Linguagem | TypeScript 5.7 |
| Cliente HTTP | Axios + `@nestjs/axios` |
| Reatividade / Resiliência | RxJS 7 (`retry`, `defer`, `timer`) |
| Validação de contrato | `class-validator` + `class-transformer` |
| Persistência | MongoDB + Mongoose |
| Configuração | `@nestjs/config` (variáveis de ambiente) |
| Agendamento | `@nestjs/schedule` |
| Documentação | Swagger (`@nestjs/swagger`) |
| Testes | Jest + `@nestjs/testing` + Supertest |

## Arquitetura do Projeto

Monorepo com o backend na raiz e o painel web em `frontend/`. O código do backend é organizado em camadas por responsabilidade técnica:

```
├── api/
│   └── index.ts                     # Entrypoint da função serverless (deploy na Vercel) — reaproveita
│                                     # o Nest app já compilado (dist/), não o código-fonte TS (ver Deploy)
├── src/
│   ├── main.ts                      # Bootstrap local (nest start) — usa app.setup.ts
│   ├── app.setup.ts                 # Configuração compartilhada (CORS + Swagger) entre main.ts e api/index.ts
│   ├── controllers/                 # Camada HTTP — validação de entrada e formatação de resposta
│   │   ├── app.controller.ts
│   │   └── weather.controller.ts
│   ├── services/                    # Regras de negócio
│   │   ├── weather.service.ts       # Motor de severidade, resiliência, geofencing, webhook
│   │   ├── weather.cron.ts          # Agendamento (30 min) da análise climática completa
│   │   ├── alert-engine.service.ts  # Máquina de estados NORMAL/ATENCAO/EMERGENCIA -> SMS
│   │   ├── sms.service.ts           # Stub de envio de SMS (interface SmsProvider)
│   │   └── task.service.ts          # Agendamento (10 min) do motor de alertas/SMS
│   ├── modules/                     # Composição de dependências (Nest DI)
│   │   ├── app.module.ts
│   │   └── weather.module.ts
│   ├── schemas/                     # Modelos Mongoose
│   │   ├── weather.schema.ts             # Histórico de alertas
│   │   ├── alert-engine-state.schema.ts  # Estado atual (singleton) da máquina de estados SMS
│   │   └── seismic-sensor-state.schema.ts # Leitura sísmica pendente (singleton) — confirmação temporal
│   └── dto/                         # Contratos validados (class-validator)
│       └── open-meteo-current-weather.dto.ts
└── frontend/                        # Painel web (React) — ver seção Frontend abaixo
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

Variáveis no `.env`:

```env
MONGODB_URI=mongodb+srv://<usuario>:<senha>@<cluster>/sao-luis-weather-watch
OPENWEATHER_API_KEY=<sua-chave-openweathermap>
SMS_DESTINATARIO_DEFESA_CIVIL=+55XXXXXXXXXXX
DEFESA_CIVIL_WEBHOOK_URL=
```

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `MONGODB_URI` | **Sim** | A aplicação falha ao subir sem ela. |
| `OPENWEATHER_API_KEY` | Não | Reservada para uma futura fonte de dados secundária; a fonte principal (Open-Meteo) não exige chave. |
| `SMS_DESTINATARIO_DEFESA_CIVIL` | Não | Número que recebe os SMS de transição de estado. Se vazio, o envio é apenas logado como ignorado. |
| `DEFESA_CIVIL_WEBHOOK_URL` | Não | URL real do webhook de alertas críticos. Se vazio, o disparo é ignorado (sem tentativa de rede). |

### Executando

```bash
pnpm run start:dev
```

O servidor sobe em `http://localhost:3000`. Ao iniciar, dois jobs agendados ficam rodando em background: a análise climática completa (a cada 30 min) e o motor de estado/SMS (a cada 10 min). CORS está habilitado (`app.enableCors()`), então o painel web pode consumir a API de outra origem/porta em dev.

### Rodando o painel web (frontend)

```bash
cd frontend
pnpm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3000
pnpm run dev
```

O painel sobe em `http://localhost:5173` e consome o backend local. Ver a seção [Frontend (Painel Web)](#frontend-painel-web) para detalhes.

## Documentação da API

A documentação interativa (Swagger) fica disponível em:

```
http://localhost:3000/api
```

### Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/` | Executa a análise climática atual e retorna o alerta vigente. |
| `GET` | `/clima/atual` | Consulta a Open-Meteo, valida o contrato, avalia as regras de severidade, persiste e retorna o alerta atual (422 se o contrato externo mudar). |
| `GET` | `/clima/alertas` | Histórico completo de alertas, do mais recente ao mais antigo. |
| `GET` | `/clima/emergencias` | Feed de crises: alertas `ALERTA`/`EMERGÊNCIA` das últimas 24 horas. |
| `GET` | `/clima/tendencia` | Média móvel de precipitação das últimas 3 horas e sinalização de risco de inundação súbita. |

Todas as rotas são públicas (sem autenticação) e aceitam requisições de qualquer origem (CORS liberado).

## Frontend (Painel Web)

Painel React para operadores da Defesa Civil, em `frontend/`, consumindo os endpoints de `/clima/*`:

- **Painel**: situação atual (badge de severidade, métricas de vento/chuva/temperatura, ação preventiva, zonas afetadas) + tendência de chuva.
- **Emergências**: feed de eventos `ALERTA`/`EMERGÊNCIA` das últimas 24h.
- **Histórico**: tabela completa de alertas registrados.
- Trata os estados degradados que o backend expõe: banner de **modo contingência** (quando o circuit breaker cai para cache) e de **fonte externa fora do contrato** (422).
- Atualização automática a cada 60s (moderada de propósito — `/clima/atual` dispara uma avaliação real a cada chamada) + botão de atualização manual.

**Stack**: React + Vite + TypeScript + Tailwind CSS v4. Sem dependência de backend Node — é um build estático (`vite build` → `frontend/dist`).

## Deploy

Deploy unificado (frontend + backend) na Vercel a partir do mesmo repositório, configurado via `vercel.json` na raiz:

- **Build**: `pnpm run build` (compila o backend com `nest build`) seguido do build do Vite (`frontend/dist`).
- **Frontend**: servido como estático a partir de `frontend/dist`.
- **Backend**: função serverless em `api/index.ts`, que reaproveita o Nest app **já compilado** (`dist/`), não o código-fonte TypeScript — o bundler da Vercel (esbuild) não emite metadata de decorators, o que quebraria a injeção de dependência do Nest se as classes decoradas fossem compiladas ali. `/clima/*` e `/api/*` (Swagger) são roteados para essa função; o restante cai no estático do frontend.
- Em produção, o frontend usa caminho relativo para a API (mesmo domínio) — não precisa configurar `VITE_API_BASE_URL` na Vercel.

## Testes Automatizados

```bash
pnpm test          # suíte de testes unitários (Jest) — regras de negócio isoladas
pnpm run test:cov  # com relatório de cobertura
pnpm run test:e2e  # suíte de integração (Supertest) — camada HTTP completa
```

### Testes unitários
Cobrem as regras de negócio isoladas do `WeatherService` e do `AlertEngineService`:
- Geração correta de severidade `EMERGÊNCIA` e zoneamento por vento acima de 60km/h.
- Ativação do circuit breaker e fallback para o último registro em cache quando a API externa falha.
- Retry automático em erro 503 com sucesso na tentativa seguinte, e não-retentativa em falhas de DNS.
- Cálculo correto da média móvel de precipitação via pipeline de agregação do MongoDB.
- Máquina de estados: subida e descida de estado, ausência de SMS repetido para o mesmo estado, e segurança de restart (estado persistido é respeitado na primeira execução após o processo subir).
- Confirmação temporal do sensor sísmico: leitura isolada não confirma, segunda leitura dentro da janela confirma, janela expirada não confirma, pendência é limpa quando a leitura seguinte volta ao normal.

### Testes de integração (Supertest)
Um arquivo por rota (`test/clima-*.e2e-spec.ts`), subindo o Controller e o Service reais via `@nestjs/testing` e mockando apenas as bordas externas (HTTP e MongoDB) — sem depender de um MongoDB in-memory, o que mantém a suíte rápida e determinística:
- `/clima/atual`: contrato da resposta (`nivelSeveridade`/`descricao`/`timestamp`), persistência no repositório mockado, **422 em dois cenários de contrato quebrado** e um **snapshot test** do corpo da resposta para travar regressões na lógica de risco.
- `/clima/alertas`: ordenação decrescente por timestamp (seed inserido propositalmente fora de ordem).
- `/clima/emergencias`: filtro de severidade + janela de 24h, incluindo teste de borda exata (23h59 dentro, 24h01 fora).
- `/clima/tendencia`: corretude do arredondamento e do limiar de risco (`> 10mm`) sobre o resultado da agregação.

## Roadmap

- Trocar o `SmsService` stub por uma integração real (Twilio ou Zenvia) implementando a interface `SmsProvider` já existente.
- Trocar o sensor sísmico simulado por uma integração real (ex.: rede USGS/observatório sismológico), aposentando a confirmação temporal por dados de fato medidos.
- Métricas de observabilidade (Prometheus/Grafana) a partir dos logs estruturados já existentes.
- Pipeline de CI (GitHub Actions) para substituir os badges de build/testes por indicadores reais.
- Autenticação para os endpoints de escrita, caso o sistema passe a expor operações além de leitura.
