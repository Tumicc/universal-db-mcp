import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { PermissionMode } from '../types/adapter.js';
import type { SavedTargetRecord, TargetEnvironment } from '../types/targets.js';

interface SavedTargetRow {
  alias: string;
  db_type: string;
  environment: string;
  description: string | null;
  default_permission_mode: string;
  connection_json: string;
  encrypted_secrets: string;
  created_at: string;
  updated_at: string;
}

interface SavedTargetPatch {
  description?: string | null;
  environment?: TargetEnvironment;
  defaultPermissionMode?: PermissionMode;
}

export class SavedTargetRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const absoluteDbPath = path.resolve(dbPath);
    const dbDir = path.dirname(absoluteDbPath);
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });

    this.db = new Database(absoluteDbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.initializeSchema();

    // 最佳努力设置权限，避免连接模板数据库被其他用户读取
    try {
      fs.chmodSync(absoluteDbPath, 0o600);
    } catch {
      // ignore
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_targets (
        alias TEXT PRIMARY KEY,
        db_type TEXT NOT NULL,
        environment TEXT NOT NULL CHECK (environment IN ('test', 'prod')),
        description TEXT,
        default_permission_mode TEXT NOT NULL CHECK (default_permission_mode IN ('safe', 'readwrite', 'full', 'custom')),
        connection_json TEXT NOT NULL,
        encrypted_secrets TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_saved_targets_environment ON saved_targets(environment);
      CREATE INDEX IF NOT EXISTS idx_saved_targets_updated_at ON saved_targets(updated_at);
    `);
  }

  create(record: SavedTargetRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO saved_targets (
        alias, db_type, environment, description, default_permission_mode,
        connection_json, encrypted_secrets, created_at, updated_at
      ) VALUES (
        @alias, @dbType, @environment, @description, @defaultPermissionMode,
        @connectionJson, @encryptedSecrets, @createdAt, @updatedAt
      )
    `);

    stmt.run({
      alias: record.alias,
      dbType: record.dbType,
      environment: record.environment,
      description: record.description ?? null,
      defaultPermissionMode: record.defaultPermissionMode,
      connectionJson: record.connectionJson,
      encryptedSecrets: record.encryptedSecrets,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  list(): SavedTargetRecord[] {
    const stmt = this.db.prepare(`
      SELECT alias, db_type, environment, description, default_permission_mode,
             connection_json, encrypted_secrets, created_at, updated_at
      FROM saved_targets
      ORDER BY alias ASC
    `);

    return (stmt.all() as SavedTargetRow[]).map(row => this.toRecord(row));
  }

  getByAlias(alias: string): SavedTargetRecord | null {
    const stmt = this.db.prepare(`
      SELECT alias, db_type, environment, description, default_permission_mode,
             connection_json, encrypted_secrets, created_at, updated_at
      FROM saved_targets
      WHERE alias = ?
      LIMIT 1
    `);
    const row = stmt.get(alias) as SavedTargetRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  update(alias: string, patch: SavedTargetPatch): SavedTargetRecord | null {
    const existing = this.getByAlias(alias);
    if (!existing) {
      return null;
    }

    const nextDescription = patch.description !== undefined ? patch.description : existing.description ?? null;
    const nextEnvironment = patch.environment ?? existing.environment;
    const nextDefaultPermissionMode = patch.defaultPermissionMode ?? existing.defaultPermissionMode;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE saved_targets
      SET description = @description,
          environment = @environment,
          default_permission_mode = @defaultPermissionMode,
          updated_at = @updatedAt
      WHERE alias = @alias
    `);

    stmt.run({
      alias,
      description: nextDescription,
      environment: nextEnvironment,
      defaultPermissionMode: nextDefaultPermissionMode,
      updatedAt: now,
    });

    return this.getByAlias(alias);
  }

  delete(alias: string): boolean {
    const stmt = this.db.prepare('DELETE FROM saved_targets WHERE alias = ?');
    const result = stmt.run(alias);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private toRecord(row: SavedTargetRow): SavedTargetRecord {
    return {
      alias: row.alias,
      dbType: row.db_type as SavedTargetRecord['dbType'],
      environment: row.environment as TargetEnvironment,
      description: row.description ?? undefined,
      defaultPermissionMode: row.default_permission_mode as PermissionMode,
      connectionJson: row.connection_json,
      encryptedSecrets: row.encrypted_secrets,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

