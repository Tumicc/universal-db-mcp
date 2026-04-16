import type { DbConfig, PermissionMode } from './adapter.js';

export type TargetEnvironment = 'test' | 'prod';

export interface SavedTargetRecord {
  alias: string;
  dbType: DbConfig['type'];
  environment: TargetEnvironment;
  description?: string;
  defaultPermissionMode: PermissionMode;
  connectionJson: string;
  encryptedSecrets: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedTargetConnectionPayload {
  dbType: DbConfig['type'];
  connection: Record<string, unknown>;
  secrets: Record<string, unknown>;
}

export interface SavedTargetSummary {
  alias: string;
  dbType: DbConfig['type'];
  environment: TargetEnvironment;
  description?: string;
  defaultPermissionMode: PermissionMode;
  host?: string;
  user?: string;
  port?: number;
  database?: string;
  filePath?: string;
  hasSecrets: boolean;
  createdAt: string;
  updatedAt: string;
}

