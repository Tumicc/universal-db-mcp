/**
 * Connection Routes
 * Database connection and disconnection endpoints
 */

import type { FastifyInstance } from 'fastify';
import type {
  ConnectRequest,
  ConnectResponse,
  DisconnectRequest,
  DisconnectResponse,
  ApiResponse,
} from '../../types/http.js';
import { ConnectionManager } from '../../core/connection-manager.js';
import type { DbConfig } from '../../types/adapter.js';
import { MissingMasterKeyError } from '../../services/crypto-service.js';
import {
  TargetConflictError,
  TargetNotFoundError,
  TargetPermissionError,
  TargetService,
  TargetValidationError,
} from '../../services/target-service.js';

export async function setupConnectionRoutes(
  fastify: FastifyInstance,
  connectionManager: ConnectionManager,
  targetService: TargetService
): Promise<void> {
  /**
   * POST /api/connect
   * Connect to a database
   */
  fastify.post<{
    Body: ConnectRequest;
    Reply: ApiResponse<ConnectResponse>;
  }>('/api/connect', {
    schema: {
      body: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          alias: { type: 'string' },
          type: { type: 'string' },
          host: { type: 'string' },
          port: { type: 'number' },
          user: { type: 'string' },
          password: { type: 'string' },
          database: { type: 'string' },
          filePath: { type: 'string' },
          authSource: { type: 'string' },
          allowWrite: { type: 'boolean' },
          permissionMode: { type: 'string', enum: ['safe', 'readwrite', 'full', 'custom'] },
          permissions: { type: 'array', items: { type: 'string', enum: ['read', 'insert', 'update', 'delete', 'ddl'] } },
          oracleClientPath: { type: 'string' },
          remember: { type: 'boolean', default: false },
          environment: { type: 'string', enum: ['test', 'prod'] },
          description: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const payload = request.body as ConnectRequest & Record<string, unknown>;
      const hasType = typeof payload.type === 'string' && payload.type.trim() !== '';
      const targetAlias =
        (typeof payload.target === 'string' && payload.target.trim() !== '' ? payload.target : undefined) ||
        (typeof payload.alias === 'string' &&
        payload.alias.trim() !== '' &&
        !hasType &&
        payload.remember !== true
          ? payload.alias
          : undefined);

      let connectConfig: DbConfig;
      if (targetAlias) {
        connectConfig = targetService.resolveConnectConfigFromTarget(targetAlias, payload);
      } else {
        connectConfig = buildDirectConnectConfig(payload);
      }

      // Connect to database
      const sessionId = await connectionManager.connect(connectConfig);

      if (payload.remember === true) {
        try {
          targetService.saveTargetFromConnectRequest(payload);
        } catch (saveError) {
          await connectionManager.disconnect(sessionId).catch(() => undefined);
          throw saveError;
        }
      }

      return {
        success: true,
        data: {
          sessionId,
          databaseType: connectConfig.type,
          connected: true,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      const { statusCode, errorCode } = mapConnectionError(error);
      reply.code(statusCode);
      return {
        success: false,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Failed to connect to database',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * POST /api/disconnect
   * Disconnect from a database
   */
  fastify.post<{
    Body: DisconnectRequest;
    Reply: ApiResponse<DisconnectResponse>;
  }>('/api/disconnect', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId } = request.body;

      // Disconnect from database
      await connectionManager.disconnect(sessionId);

      return {
        success: true,
        data: {
          disconnected: true,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'DISCONNECTION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to disconnect from database',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });
}

function buildDirectConnectConfig(payload: ConnectRequest & Record<string, unknown>): DbConfig {
  if (!payload.type || typeof payload.type !== 'string') {
    throw new TargetValidationError('连接参数缺失：请提供 type，或使用 target/alias 直连');
  }

  const config: DbConfig = {
    type: payload.type as DbConfig['type'],
    host: typeof payload.host === 'string' ? payload.host : undefined,
    port: typeof payload.port === 'number' ? payload.port : undefined,
    user: typeof payload.user === 'string' ? payload.user : undefined,
    password: typeof payload.password === 'string' ? payload.password : undefined,
    database: typeof payload.database === 'string' ? payload.database : undefined,
    filePath: typeof payload.filePath === 'string' ? payload.filePath : undefined,
    allowWrite: typeof payload.allowWrite === 'boolean' ? payload.allowWrite : undefined,
    permissionMode: payload.permissionMode,
    permissions: payload.permissions,
    oracleClientPath: typeof payload.oracleClientPath === 'string' ? payload.oracleClientPath : undefined,
  };

  if (typeof payload.authSource === 'string') {
    (config as unknown as { authSource?: string }).authSource = payload.authSource;
  }

  return config;
}

function mapConnectionError(error: unknown): { statusCode: number; errorCode: string } {
  if (error instanceof TargetValidationError) {
    return { statusCode: 400, errorCode: 'INVALID_CONNECT_REQUEST' };
  }
  if (error instanceof TargetConflictError) {
    return { statusCode: 409, errorCode: 'TARGET_ALIAS_CONFLICT' };
  }
  if (error instanceof TargetNotFoundError) {
    return { statusCode: 404, errorCode: 'TARGET_NOT_FOUND' };
  }
  if (error instanceof TargetPermissionError) {
    return { statusCode: 403, errorCode: 'TARGET_PERMISSION_DENIED' };
  }
  if (error instanceof MissingMasterKeyError) {
    return { statusCode: 400, errorCode: 'MASTER_KEY_REQUIRED' };
  }
  return { statusCode: 500, errorCode: 'CONNECTION_FAILED' };
}
