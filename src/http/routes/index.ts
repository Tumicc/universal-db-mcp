/**
 * Routes Index
 * Aggregates all route setup functions
 */

import type { FastifyInstance } from 'fastify';
import { ConnectionManager } from '../../core/connection-manager.js';
import { TargetService } from '../../services/target-service.js';
import { setupHealthRoutes } from './health.js';
import { setupConnectionRoutes } from './connection.js';
import { setupQueryRoutes } from './query.js';
import { setupSchemaRoutes } from './schema.js';
import { setupMcpSseRoutes } from './mcp-sse.js';
import { setupTargetRoutes } from './targets.js';

/**
 * Setup all routes
 */
export async function setupRoutes(
  fastify: FastifyInstance,
  connectionManager: ConnectionManager,
  targetService: TargetService
): Promise<void> {
  // Health and info routes (no auth required)
  await setupHealthRoutes(fastify);

  // MCP SSE routes (no auth required, uses its own session management)
  await setupMcpSseRoutes(fastify);

  // Connection routes
  await setupConnectionRoutes(fastify, connectionManager, targetService);

  // Saved targets routes
  await setupTargetRoutes(fastify, targetService);

  // Query routes
  await setupQueryRoutes(fastify, connectionManager);

  // Schema routes
  await setupSchemaRoutes(fastify, connectionManager);
}
