import type { FastifyInstance } from 'fastify';
import { MissingMasterKeyError } from '../../services/crypto-service.js';
import {
  TargetNotFoundError,
  TargetPermissionError,
  TargetService,
  TargetValidationError,
} from '../../services/target-service.js';
import type { ApiResponse } from '../../types/http.js';
import type { SavedTargetSummary } from '../../types/targets.js';

interface DeleteTargetResponse {
  alias: string;
  deleted: boolean;
}

export async function setupTargetRoutes(
  fastify: FastifyInstance,
  targetService: TargetService
): Promise<void> {
  fastify.get<{ Reply: ApiResponse<{ targets: SavedTargetSummary[] }> }>(
    '/api/targets',
    async (request, reply) => {
      try {
        const targets = targetService.listTargets();
        return {
          success: true,
          data: { targets },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      } catch (error) {
        const mapped = mapTargetError(error);
        reply.code(mapped.statusCode);
        return buildErrorResponse(request.id, mapped.errorCode, error);
      }
    }
  );

  fastify.get<{
    Params: { alias: string };
    Reply: ApiResponse<SavedTargetSummary>;
  }>(
    '/api/targets/:alias',
    async (request, reply) => {
      try {
        const target = targetService.getTarget(request.params.alias);
        return {
          success: true,
          data: target,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      } catch (error) {
        const mapped = mapTargetError(error);
        reply.code(mapped.statusCode);
        return buildErrorResponse(request.id, mapped.errorCode, error);
      }
    }
  );

  fastify.patch<{
    Params: { alias: string };
    Body: {
      description?: string | null;
      environment?: 'test' | 'prod';
      defaultPermissionMode?: 'safe' | 'readwrite' | 'full' | 'custom';
    };
    Reply: ApiResponse<SavedTargetSummary>;
  }>(
    '/api/targets/:alias',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            environment: { type: 'string', enum: ['test', 'prod'] },
            defaultPermissionMode: { type: 'string', enum: ['safe', 'readwrite', 'full', 'custom'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const target = targetService.updateTarget(request.params.alias, request.body || {});
        return {
          success: true,
          data: target,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      } catch (error) {
        const mapped = mapTargetError(error);
        reply.code(mapped.statusCode);
        return buildErrorResponse(request.id, mapped.errorCode, error);
      }
    }
  );

  fastify.delete<{
    Params: { alias: string };
    Reply: ApiResponse<DeleteTargetResponse>;
  }>(
    '/api/targets/:alias',
    async (request, reply) => {
      try {
        const deleted = targetService.deleteTarget(request.params.alias);
        if (!deleted) {
          reply.code(404);
          return buildErrorResponse(request.id, 'TARGET_NOT_FOUND', new TargetNotFoundError(request.params.alias));
        }
        return {
          success: true,
          data: {
            alias: request.params.alias,
            deleted: true,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      } catch (error) {
        const mapped = mapTargetError(error);
        reply.code(mapped.statusCode);
        return buildErrorResponse(request.id, mapped.errorCode, error);
      }
    }
  );
}

function buildErrorResponse<T = unknown>(requestId: string, code: string, error: unknown): ApiResponse<T> {
  return {
    success: false,
    error: {
      code,
      message: error instanceof Error ? error.message : 'Unexpected error',
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

function mapTargetError(error: unknown): { statusCode: number; errorCode: string } {
  if (error instanceof TargetValidationError) {
    return { statusCode: 400, errorCode: 'INVALID_TARGET_REQUEST' };
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
  return { statusCode: 500, errorCode: 'TARGET_OPERATION_FAILED' };
}
