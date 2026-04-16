/**
 * HTTP Server Setup
 * Fastify server configuration with middleware and routes
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import type { AppConfig } from '../types/http.js';
import { ConnectionManager } from '../core/connection-manager.js';
import { authMiddleware, setupErrorHandler } from './middleware/index.js';
import { setupRoutes } from './routes/index.js';
import { SavedTargetRepository } from '../store/saved-target-repository.js';
import { CryptoService } from '../services/crypto-service.js';
import { TargetService } from '../services/target-service.js';

/**
 * Create and configure HTTP server
 */
export async function createHttpServer(config: AppConfig) {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: config.http?.logging.level || 'info',
      transport: config.http?.logging.pretty
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  // Setup CORS
  await fastify.register(cors, {
    origin: config.http?.cors.origins || '*',
    credentials: config.http?.cors.credentials || false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  });

  // Setup rate limiting
  await fastify.register(rateLimit, {
    max: config.http?.rateLimit.max || 100,
    timeWindow: config.http?.rateLimit.window || '1m',
    keyGenerator: (request) => {
      // Use API key if available, otherwise use IP
      return (request as any).apiKey || request.ip;
    },
    errorResponseBuilder: (request) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    }),
  });

  // Setup authentication middleware
  fastify.addHook('onRequest', async (request, reply) => {
    await authMiddleware(request, reply, config);
  });

  // Create connection manager
  const connectionManager = new ConnectionManager(
    config.http?.session.timeout || 3600000,
    config.http?.session.cleanupInterval || 300000
  );

  const sqlitePath = process.env.TARGETS_SQLITE_PATH || path.join(process.cwd(), 'data', 'saved-targets.db');
  const targetRepository = new SavedTargetRepository(sqlitePath);
  const targetService = new TargetService(
    targetRepository,
    new CryptoService(process.env.UNIVERSAL_DB_MASTER_KEY)
  );

  // Store connection manager in fastify instance for access in routes
  fastify.decorate('connectionManager', connectionManager);

  // Setup routes
  await setupRoutes(fastify, connectionManager, targetService);

  // Setup error handler
  setupErrorHandler(fastify);

  // Graceful shutdown handler
  fastify.addHook('onClose', async () => {
    await connectionManager.disconnectAll();
    targetService.close();
  });

  return fastify;
}
