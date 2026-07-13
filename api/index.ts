import * as dns from 'node:dns/promises';

// Mesmo workaround de src/main.ts: sem isso, a resolução SRV do MongoDB Atlas
// falha em alguns ambientes (incluindo funções serverless).
dns.setServers(['1.1.1.1', '8.8.8.8']);

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
// Importa o módulo já compilado (dist/), não o fonte TS: o bundler serverless do
// Vercel (esbuild) não emite metadata de decorators, o que quebraria a injeção
// de dependência do Nest se compilássemos as classes decoradas aqui. O `nest build`
// (rodado antes, via buildCommand) já resolveu os decorators corretamente.
import { AppModule } from '../dist/modules/app.module.js';
import { configureApp } from '../dist/app.setup.js';

const server = express();
let bootstrapPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  configureApp(app);
  await app.init();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  await bootstrapPromise;
  server(req, res);
}
