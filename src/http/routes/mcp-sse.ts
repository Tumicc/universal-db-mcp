/**
 * MCP SSE Routes
 * 提供 MCP over SSE/Streamable HTTP 传输支持
 * 使 Dify 等平台可以通过 MCP 协议直接调用
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseMCPServer } from '../../mcp/mcp-server.js';
import type { DbConfig, PermissionType, PermissionMode } from '../../types/adapter.js';
import { createAdapter } from '../../utils/adapter-factory.js';

// 支持的数据库类型
type DbType = DbConfig['type'];
const SUPPORTED_DB_TYPES: DbType[] = [
  'mysql', 'postgres', 'redis', 'oracle', 'dm', 'sqlserver', 'mongodb', 'sqlite',
  'kingbase', 'gaussdb', 'oceanbase', 'tidb', 'clickhouse', 'polardb', 'vastbase', 'highgo', 'goldendb'
];

// 存储活跃的 SSE 传输实例（按 sessionId）
const sseTransports: Map<string, SSEServerTransport> = new Map();

// 存储活跃的 Streamable HTTP 传输实例（按 sessionId）
const streamableTransports: Map<string, StreamableHTTPServerTransport> = new Map();

// 存储 MCP 服务器实例（按 sessionId）
const mcpServers: Map<string, DatabaseMCPServer> = new Map();

/**
 * 验证数据库类型
 */
function isValidDbType(type: string): type is DbType {
  return SUPPORTED_DB_TYPES.includes(type as DbType);
}

/**
 * 从请求中解析数据库配置
 */
function parseDbConfigFromQuery(query: Record<string, unknown>): DbConfig | null {
  const type = query.type as string;
  if (!type || !isValidDbType(type)) return null;

  // 解析 permissions 数组
  const permissionsStr = query.permissions as string;
  const permissions = permissionsStr
    ? permissionsStr.split(',').map(p => p.trim()) as PermissionType[]
    : undefined;

  return {
    type,
    host: query.host as string,
    port: query.port ? parseInt(query.port as string, 10) : undefined,
    user: query.user as string,
    password: query.password as string,
    database: query.database as string,
    filePath: query.filePath as string,
    allowWrite: query.allowWrite === 'true',
    permissionMode: query.permissionMode as PermissionMode,
    permissions,
    oracleClientPath: query.oracleClientPath as string,
  };
}

/**
 * 创建并初始化 MCP 服务器
 */
async function createMcpServer(config: DbConfig): Promise<DatabaseMCPServer> {
  const mcpServer = new DatabaseMCPServer(config);
  const adapter = createAdapter(config);
  mcpServer.setAdapter(adapter);
  await mcpServer.connectDatabase();
  return mcpServer;
}

/**
 * 清理会话资源
 */
async function cleanupSession(sessionId: string): Promise<void> {
  const mcpServer = mcpServers.get(sessionId);
  if (mcpServer) {
    await mcpServer.stop();
    mcpServers.delete(sessionId);
  }
  sseTransports.delete(sessionId);
  streamableTransports.delete(sessionId);
}

/**
 * 设置 MCP SSE 路由
 */
export async function setupMcpSseRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * SSE 端点 - 用于建立 SSE 连接（传统 SSE 模式）
   * GET /sse?type=mysql&host=localhost&port=3306&user=root&password=xxx&database=mydb
   */
  fastify.get('/sse', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const config = parseDbConfigFromQuery(query);

    if (!config) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_CONFIG',
          message: 'Missing required database configuration. Please provide at least "type" parameter.',
        },
      });
    }

    try {
      // 创建 MCP 服务器
      const mcpServer = await createMcpServer(config);

      // 获取原始的 Node.js response 对象
      const res = reply.raw;

      // 创建 SSE 传输
      const transport = new SSEServerTransport('/sse/message', res);
      const sessionId = transport.sessionId;

      // 存储实例
      sseTransports.set(sessionId, transport);
      mcpServers.set(sessionId, mcpServer);

      // 设置关闭处理
      transport.onclose = async () => {
        console.error(`SSE session ${sessionId} closed`);
        await cleanupSession(sessionId);
      };

      // 连接 MCP 服务器到传输层（connect 会自动调用 transport.start()）
      await mcpServer.getServer().connect(transport);

      console.error(`🔗 SSE session started: ${sessionId}`);

      // SSE 连接需要保持打开，不返回任何内容
      // Fastify 会自动处理，因为 response 已经被 SSE transport 接管
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ SSE connection error: ${errorMessage}`);
      // 只有在 headers 还没发送时才返回错误
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          success: false,
          error: {
            code: 'CONNECTION_ERROR',
            message: errorMessage,
          },
        });
      }
    }
  });

  /**
   * SSE 消息端点 - 接收客户端发送的消息（传统 SSE 模式）
   * POST /sse/message?sessionId=xxx
   */
  fastify.post('/sse/message', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const sessionId = query.sessionId as string;

    if (!sessionId) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
      });
    }

    const transport = sseTransports.get(sessionId);
    if (!transport) {
      return reply.code(404).send({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found or expired',
        },
      });
    }

    try {
      // 获取原始的 Node.js request/response 对象
      const req = request.raw;
      const res = reply.raw;

      await transport.handlePostMessage(req, res, request.body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ SSE message error: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'MESSAGE_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  /**
   * Streamable HTTP 端点 - MCP 2025 新规范
   * POST /mcp
   *
   * 数据库配置通过请求头传递：
   * X-DB-Type, X-DB-Host, X-DB-Port, X-DB-User, X-DB-Password, X-DB-Database, X-DB-Allow-Write
   */
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const headers = request.headers;
    const body = request.body;

    // 从请求头解析数据库类型
    const dbType = headers['x-db-type'] as string;

    try {
      // 检查是否有现有会话
      const sessionId = headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && streamableTransports.has(sessionId)) {
        // 复用现有传输
        transport = streamableTransports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(body)) {
        // 新的初始化请求
        if (!dbType || !isValidDbType(dbType)) {
          return reply.code(400).send({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Missing or invalid database configuration. Please provide valid X-DB-Type header.',
            },
            id: null,
          });
        }

        // 构建数据库配置
        const permissionsHeader = headers['x-db-permissions'] as string;
        const config: DbConfig = {
          type: dbType,
          host: headers['x-db-host'] as string,
          port: headers['x-db-port'] ? parseInt(headers['x-db-port'] as string, 10) : undefined,
          user: headers['x-db-user'] as string,
          password: headers['x-db-password'] as string,
          database: headers['x-db-database'] as string,
          filePath: headers['x-db-filepath'] as string,
          allowWrite: headers['x-db-allow-write'] === 'true',
          permissionMode: headers['x-db-permission-mode'] as PermissionMode,
          permissions: permissionsHeader ? permissionsHeader.split(',').map(p => p.trim()) as PermissionType[] : undefined,
          oracleClientPath: headers['x-db-oracle-client-path'] as string,
        };

        // 创建 MCP 服务器
        const mcpServer = await createMcpServer(config);

        // 创建 Streamable HTTP 传输
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.error(`🔗 MCP session initialized: ${newSessionId}`);
            streamableTransports.set(newSessionId, transport);
            mcpServers.set(newSessionId, mcpServer);
          },
        });

        // 连接 MCP 服务器到传输层（使用 getServer() 避免重复调用 start）
        await mcpServer.getServer().connect(transport);

        // 处理请求
        await transport.handleRequest(request.raw, reply.raw, body);
        return;
      } else {
        // 无效请求
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
      }

      // 使用现有传输处理请求
      await transport.handleRequest(request.raw, reply.raw, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ MCP request error: ${errorMessage}`);
      if (!reply.sent) {
        return reply.code(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: errorMessage,
          },
          id: null,
        });
      }
    }
  });

  /**
   * Streamable HTTP GET 端点 - 用于 SSE 流
   * GET /mcp
   */
  fastify.get('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.headers['mcp-session-id'] as string;

    if (!sessionId || !streamableTransports.has(sessionId)) {
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    }

    const transport = streamableTransports.get(sessionId)!;
    await transport.handleRequest(request.raw, reply.raw);
  });

  /**
   * 删除会话端点
   * DELETE /mcp?sessionId=xxx
   */
  fastify.delete('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const sessionId = query.sessionId as string || request.headers['mcp-session-id'] as string;

    if (!sessionId) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
      });
    }

    await cleanupSession(sessionId);

    return reply.send({
      success: true,
      message: 'Session closed',
    });
  });

  console.error('📡 MCP SSE/Streamable HTTP routes registered');
}
