/**
 * HTTP Server Entry Point
 * Starts the HTTP API server
 */

import type { AppConfig } from '../types/http.js';
import { createHttpServer } from './server.js';

/**
 * Start HTTP server
 */
export async function startHttpServer(config: AppConfig): Promise<void> {
  try {
    // Create server
    const server = await createHttpServer(config);

    // Get configuration
    const port = config.http?.port || 3000;
    const host = config.http?.host || '0.0.0.0';

    // Start listening
    await server.listen({ port, host });

    console.log('');
    console.log('🚀 HTTP API Server started successfully!');
    console.log('');
    console.log(`📍 Server URL: http://${host}:${port}`);
    console.log(`📊 Supported databases: 17 types`);
    console.log(`🛡️  Security: API Key authentication ${config.http?.apiKeys.length ? 'enabled' : 'disabled (WARNING!)'}`);
    console.log(`⚡ Rate limiting: ${config.http?.rateLimit.max} requests per ${config.http?.rateLimit.window}`);
    console.log('');
    console.log('📖 API Endpoints:');
    console.log('   GET  /api/health          - Health check');
    console.log('   GET  /api/info            - Service information');
    console.log('   POST /api/connect         - Connect to database');
    console.log('   POST /api/disconnect      - Disconnect from database');
    console.log('   GET  /api/targets         - List saved targets');
    console.log('   GET  /api/targets/:alias  - Get saved target');
    console.log('   PATCH /api/targets/:alias - Update saved target');
    console.log('   DELETE /api/targets/:alias- Delete saved target');
    console.log('   POST /api/query           - Execute query');
    console.log('   POST /api/execute         - Execute write operation');
    console.log('   GET  /api/tables          - List tables');
    console.log('   GET  /api/schema          - Get database schema');
    console.log('   GET  /api/schema/:table   - Get table information');
    console.log('');

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);
        await server.close();
        console.log('👋 Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start HTTP server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
