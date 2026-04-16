import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/http/server.js';
import type { AppConfig } from '../../src/types/http.js';

const testConfig: AppConfig = {
  mode: 'http',
  http: {
    port: 3010,
    host: '127.0.0.1',
    apiKeys: ['test-key'],
    cors: {
      origins: '*',
      credentials: false,
    },
    rateLimit: {
      max: 100,
      window: '1m',
    },
    logging: {
      level: 'error',
      pretty: false,
    },
    session: {
      timeout: 3600000,
      cleanupInterval: 300000,
    },
  },
};

function authHeaders() {
  return { 'X-API-Key': 'test-key' };
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

describe('Saved Targets Integration', () => {
  let tempDir: string;
  let targetsDbPath: string;
  let prodDbPath: string;
  let server: Awaited<ReturnType<typeof createHttpServer>>;
  let oldTargetsPath: string | undefined;
  let oldMasterKey: string | undefined;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udm-targets-'));
    targetsDbPath = path.join(tempDir, 'saved-targets.db');
    prodDbPath = path.join(tempDir, 'prod-safe.db');
    oldTargetsPath = process.env.TARGETS_SQLITE_PATH;
    oldMasterKey = process.env.UNIVERSAL_DB_MASTER_KEY;
    process.env.TARGETS_SQLITE_PATH = targetsDbPath;
    process.env.UNIVERSAL_DB_MASTER_KEY = 'test-master-key-for-targets';

    server = await createHttpServer(testConfig);
  });

  afterAll(async () => {
    await server.close();
    if (oldTargetsPath === undefined) {
      delete process.env.TARGETS_SQLITE_PATH;
    } else {
      process.env.TARGETS_SQLITE_PATH = oldTargetsPath;
    }
    if (oldMasterKey === undefined) {
      delete process.env.UNIVERSAL_DB_MASTER_KEY;
    } else {
      process.env.UNIVERSAL_DB_MASTER_KEY = oldMasterKey;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save target successfully when remember=true', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: ':memory:',
        allowWrite: true,
        remember: true,
        alias: 'sqlite-test',
        environment: 'test',
        description: 'test sqlite target',
        password: 'super-secret-password',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);

    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: body.data.sessionId },
    });
  });

  it('should not persist sensitive fields in plaintext', () => {
    const db = new Database(targetsDbPath, { readonly: true });
    const row = db
      .prepare('SELECT connection_json, encrypted_secrets FROM saved_targets WHERE alias = ?')
      .get('sqlite-test') as { connection_json: string; encrypted_secrets: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.connection_json).not.toContain('super-secret-password');
    expect(row!.connection_json).not.toContain('"password"');
    expect(row!.encrypted_secrets).not.toContain('super-secret-password');
  });

  it('should connect successfully through target alias', async () => {
    const connectResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: { target: 'sqlite-test' },
    });
    expect(connectResp.statusCode).toBe(200);
    const connectBody = parseBody(connectResp);

    const queryResp = await server.inject({
      method: 'POST',
      url: '/api/query',
      headers: authHeaders(),
      payload: {
        sessionId: connectBody.data.sessionId,
        query: 'SELECT 1 as ok',
      },
    });
    expect(queryResp.statusCode).toBe(200);
    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: connectBody.data.sessionId },
    });
  });

  it('should apply safe permission by default for prod target', async () => {
    const saveResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: prodDbPath,
        allowWrite: true,
        permissionMode: 'full',
        remember: true,
        alias: 'sqlite-prod',
        environment: 'prod',
      },
    });
    expect(saveResp.statusCode).toBe(200);
    const saveBody = parseBody(saveResp);
    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: saveBody.data.sessionId },
    });

    const connectResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: { target: 'sqlite-prod' },
    });
    expect(connectResp.statusCode).toBe(200);
    const connectBody = parseBody(connectResp);

    const writeResp = await server.inject({
      method: 'POST',
      url: '/api/execute',
      headers: authHeaders(),
      payload: {
        sessionId: connectBody.data.sessionId,
        query: 'INSERT INTO no_table(id) VALUES (1)',
      },
    });
    expect(writeResp.statusCode).toBe(500);
    expect(parseBody(writeResp).error.message).toContain('操作被拒绝');

    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: connectBody.data.sessionId },
    });
  });

  it('should reject explicit permission escalation for prod target', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        target: 'sqlite-prod',
        permissionMode: 'full',
      },
    });

    expect(resp.statusCode).toBe(403);
    const body = parseBody(resp);
    expect(body.error.code).toBe('TARGET_PERMISSION_DENIED');
  });

  it('should use readwrite permission by default for test target', async () => {
    const saveResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: ':memory:',
        allowWrite: true,
        remember: true,
        alias: 'sqlite-test-rw',
        environment: 'test',
      },
    });
    expect(saveResp.statusCode).toBe(200);
    const saveBody = parseBody(saveResp);
    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: saveBody.data.sessionId },
    });

    const connectResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: { target: 'sqlite-test-rw' },
    });
    expect(connectResp.statusCode).toBe(200);
    const connectBody = parseBody(connectResp);

    const writeResp = await server.inject({
      method: 'POST',
      url: '/api/execute',
      headers: authHeaders(),
      payload: {
        sessionId: connectBody.data.sessionId,
        query: 'INSERT INTO no_table(id) VALUES (1)',
      },
    });
    expect(writeResp.statusCode).toBe(500);
    expect(parseBody(writeResp).error.message).not.toContain('操作被拒绝');

    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: connectBody.data.sessionId },
    });
  });

  it('should not leak sensitive fields in /api/targets response', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/api/targets',
      headers: authHeaders(),
    });
    expect(resp.statusCode).toBe(200);
    const body = parseBody(resp);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('super-secret-password');
    expect(serialized).not.toContain('"password"');
    expect(body.data.targets.length).toBeGreaterThan(0);
  });

  it('should return conflict when alias already exists', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: ':memory:',
        allowWrite: true,
        remember: true,
        alias: 'sqlite-test',
        environment: 'test',
      },
    });

    expect(resp.statusCode).toBe(409);
    const body = parseBody(resp);
    expect(body.error.code).toBe('TARGET_ALIAS_CONFLICT');
  });

  it('should not connect via alias after target deletion', async () => {
    const saveResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: ':memory:',
        allowWrite: true,
        remember: true,
        alias: 'sqlite-delete',
        environment: 'test',
      },
    });
    expect(saveResp.statusCode).toBe(200);
    const saveBody = parseBody(saveResp);
    await server.inject({
      method: 'POST',
      url: '/api/disconnect',
      headers: authHeaders(),
      payload: { sessionId: saveBody.data.sessionId },
    });

    const deleteResp = await server.inject({
      method: 'DELETE',
      url: '/api/targets/sqlite-delete',
      headers: authHeaders(),
    });
    expect(deleteResp.statusCode).toBe(200);

    const connectResp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: { target: 'sqlite-delete' },
    });
    expect(connectResp.statusCode).toBe(404);
    expect(parseBody(connectResp).error.code).toBe('TARGET_NOT_FOUND');
  });
});

describe('Saved Targets Master Key Handling', () => {
  let tempDir: string;
  let targetsDbPath: string;
  let server: Awaited<ReturnType<typeof createHttpServer>>;
  let oldTargetsPath: string | undefined;
  let oldMasterKey: string | undefined;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udm-targets-nokey-'));
    targetsDbPath = path.join(tempDir, 'saved-targets.db');
    oldTargetsPath = process.env.TARGETS_SQLITE_PATH;
    oldMasterKey = process.env.UNIVERSAL_DB_MASTER_KEY;
    process.env.TARGETS_SQLITE_PATH = targetsDbPath;
    delete process.env.UNIVERSAL_DB_MASTER_KEY;
    server = await createHttpServer(testConfig);
  });

  afterAll(async () => {
    await server.close();
    if (oldTargetsPath === undefined) {
      delete process.env.TARGETS_SQLITE_PATH;
    } else {
      process.env.TARGETS_SQLITE_PATH = oldTargetsPath;
    }
    if (oldMasterKey === undefined) {
      delete process.env.UNIVERSAL_DB_MASTER_KEY;
    } else {
      process.env.UNIVERSAL_DB_MASTER_KEY = oldMasterKey;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail remember save clearly when master key is missing', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/api/connect',
      headers: authHeaders(),
      payload: {
        type: 'sqlite',
        filePath: ':memory:',
        allowWrite: true,
        remember: true,
        alias: 'sqlite-nokey',
        environment: 'test',
      },
    });
    expect(resp.statusCode).toBe(400);
    const body = parseBody(resp);
    expect(body.error.code).toBe('MASTER_KEY_REQUIRED');
    expect(body.error.message).toContain('UNIVERSAL_DB_MASTER_KEY');
  });
});
