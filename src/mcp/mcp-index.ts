#!/usr/bin/env node

/**
 * MCP 数据库万能连接器 - MCP 模式入口
 */

import { Command } from 'commander';
import { DatabaseMCPServer } from './mcp-server.js';
import type { DbConfig, PermissionType, PermissionMode } from '../types/adapter.js';
import { createAdapter, normalizeDbType } from '../utils/adapter-factory.js';
import { resolvePermissions, formatPermissions } from '../utils/safety.js';

/**
 * Start MCP server
 */
export async function startMcpServer(): Promise<void> {
  const program = new Command();

  program
    .name('universal-db-mcp')
    .description('MCP 数据库万能连接器 - 让 Claude Desktop 直接连接你的数据库')
    .version('1.0.0')
    .requiredOption('--type <type>', '数据库类型 (mysql|postgres|redis|oracle|dm|sqlserver|mssql|mongodb|sqlite|kingbase|gaussdb|opengauss|oceanbase|tidb|clickhouse|polardb|vastbase|highgo|goldendb)')
    .option('--host <host>', '数据库主机地址')
    .option('--port <port>', '数据库端口', parseInt)
    .option('--user <user>', '用户名')
    .option('--password <password>', '密码')
    .option('--database <database>', '数据库名称')
    .option('--file <file>', 'SQLite 数据库文件路径')
    .option('--auth-source <authSource>', 'MongoDB 认证数据库（默认为 admin）')
    .option('--oracle-client-path <path>', 'Oracle Instant Client 路径（启用 Thick 模式以支持 11g）')
    .option('--danger-allow-write', '启用完全写入模式（危险！等价于 --permission-mode=full）', false)
    .option('--permission-mode <mode>', '权限模式: safe(只读) | readwrite(读写不删) | full(完全控制)', 'safe')
    .option('--permissions <list>', '自定义权限列表，逗号分隔: read,insert,update,delete,ddl')
    .action(async (options) => {
      try {
        // Normalize database type
        const dbType = normalizeDbType(options.type);

        // Parse permissions from command line
        const parsedPermissions = options.permissions
          ? options.permissions.split(',').map((p: string) => p.trim()) as PermissionType[]
          : undefined;

        // Build configuration
        const config: DbConfig = {
          type: dbType as any,
          host: options.host,
          port: options.port,
          user: options.user,
          password: options.password,
          database: options.database,
          filePath: options.file,
          allowWrite: options.dangerAllowWrite,
          permissionMode: options.dangerAllowWrite ? 'full' : options.permissionMode as PermissionMode,
          permissions: parsedPermissions,
        };

        // Add MongoDB-specific config
        if (dbType === 'mongodb' && options.authSource) {
          (config as any).authSource = options.authSource;
        }

        // Add Oracle-specific config
        if (dbType === 'oracle' && options.oracleClientPath) {
          config.oracleClientPath = options.oracleClientPath;
        }

        // Resolve and display permissions
        const permissions = resolvePermissions(config);
        const isSafeMode = permissions.length === 1 && permissions[0] === 'read';

        console.error('🔧 配置信息:');
        console.error(`   数据库类型: ${config.type}`);
        if (config.type === 'sqlite') {
          console.error(`   数据库文件: ${config.filePath}`);
        } else {
          console.error(`   主机地址: ${config.host}:${config.port}`);
          console.error(`   数据库名: ${config.database || '(默认)'}`);
        }
        console.error(`   权限模式: ${isSafeMode ? '✅ 只读模式' : '⚠️  ' + formatPermissions(permissions)}`);
        console.error('');

        // Create server
        const server = new DatabaseMCPServer(config);

        // Create adapter using factory
        const adapter = createAdapter(config);

        // Set adapter and start server
        server.setAdapter(adapter);
        await server.start();

        // Graceful shutdown
        process.on('SIGINT', async () => {
          console.error('\n⏹️  收到退出信号，正在关闭服务器...');
          await server.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          console.error('\n⏹️  收到终止信号，正在关闭服务器...');
          await server.stop();
          process.exit(0);
        });

      } catch (error) {
        console.error('❌ 启动失败:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  program.parse();
}

// If running directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer();
}
