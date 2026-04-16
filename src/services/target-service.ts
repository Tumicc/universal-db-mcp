import type { DbConfig, PermissionMode, PermissionType } from '../types/adapter.js';
import type {
  SavedTargetConnectionPayload,
  SavedTargetRecord,
  SavedTargetSummary,
  TargetEnvironment,
} from '../types/targets.js';
import { CryptoService } from './crypto-service.js';
import { SavedTargetRepository } from '../store/saved-target-repository.js';
import { TargetPermissionResolver } from './target-permission-resolver.js';

export { TargetPermissionError } from './target-permission-resolver.js';

const CONTROL_FIELDS = new Set([
  'remember',
  'alias',
  'target',
  'environment',
  'description',
]);

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|token|secret)/i;
const PERMISSION_MODES: PermissionMode[] = ['safe', 'readwrite', 'full', 'custom'];
const PERMISSION_TYPES: PermissionType[] = ['read', 'insert', 'update', 'delete', 'ddl'];

const DEFAULT_PERMISSION_BY_ENV: Record<TargetEnvironment, PermissionMode> = {
  test: 'readwrite',
  prod: 'safe',
};

export class TargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetValidationError';
  }
}

export class TargetConflictError extends Error {
  constructor(alias: string) {
    super(`连接别名已存在: ${alias}`);
    this.name = 'TargetConflictError';
  }
}

export class TargetNotFoundError extends Error {
  constructor(alias: string) {
    super(`连接别名不存在: ${alias}`);
    this.name = 'TargetNotFoundError';
  }
}

interface TargetPatchInput {
  description?: string | null;
  environment?: TargetEnvironment;
  defaultPermissionMode?: PermissionMode;
}

export class TargetService {
  private readonly permissionResolver: TargetPermissionResolver;

  constructor(
    private readonly repository: SavedTargetRepository,
    private readonly cryptoService: CryptoService
  ) {
    this.permissionResolver = new TargetPermissionResolver();
  }

  saveTargetFromConnectRequest(payload: Record<string, unknown>): SavedTargetSummary {
    const alias = this.parseAlias(payload.alias);
    this.validateAlias(alias);

    if (payload.target) {
      throw new TargetValidationError('remember=true 时不能使用 target/alias 直连模式，请直接传入连接参数');
    }

    const environment = this.resolveEnvironment(payload.environment, alias);
    const connectionPayload = this.extractConnectionPayload(payload);

    if (!connectionPayload.dbType) {
      throw new TargetValidationError('保存连接时必须提供 type');
    }

    const defaultPermissionMode = this.resolveDefaultPermissionMode(
      environment,
      payload.permissionMode,
      payload.permissions
    );

    connectionPayload.connection.permissionMode = defaultPermissionMode;
    if (environment === 'prod') {
      connectionPayload.connection.permissions = undefined;
      connectionPayload.connection.allowWrite = false;
    }

    const now = new Date().toISOString();
    const record: SavedTargetRecord = {
      alias,
      dbType: connectionPayload.dbType,
      environment,
      description: this.parseDescription(payload.description),
      defaultPermissionMode,
      connectionJson: JSON.stringify(connectionPayload.connection),
      encryptedSecrets: this.cryptoService.encrypt(JSON.stringify(connectionPayload.secrets)),
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.repository.create(record);
    } catch (error) {
      const dbError = error as { code?: string; message?: string };
      if (dbError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || dbError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new TargetConflictError(alias);
      }
      if (dbError.message?.includes('UNIQUE constraint failed')) {
        throw new TargetConflictError(alias);
      }
      throw error;
    }

    return this.toSummary(record);
  }

  resolveConnectConfigFromTarget(aliasOrTarget: string, overrides: Record<string, unknown>): DbConfig {
    const alias = this.parseAlias(aliasOrTarget);
    const record = this.repository.getByAlias(alias);
    if (!record) {
      throw new TargetNotFoundError(alias);
    }

    const connection = this.parseJson(record.connectionJson, '连接配置损坏，无法加载');
    const secrets = this.parseJson(
      this.cryptoService.decrypt(record.encryptedSecrets),
      '连接凭据损坏，无法解密'
    );

    const config: Record<string, unknown> = {
      ...connection,
      ...secrets,
      type: record.dbType,
    };

    this.applyPermissionPolicy(record, config, overrides);
    return config as unknown as DbConfig;
  }

  listTargets(): SavedTargetSummary[] {
    return this.repository.list().map(record => this.toSummary(record));
  }

  getTarget(aliasOrTarget: string): SavedTargetSummary {
    const alias = this.parseAlias(aliasOrTarget);
    const record = this.repository.getByAlias(alias);
    if (!record) {
      throw new TargetNotFoundError(alias);
    }
    return this.toSummary(record);
  }

  updateTarget(aliasOrTarget: string, patch: TargetPatchInput): SavedTargetSummary {
    const alias = this.parseAlias(aliasOrTarget);
    const existing = this.repository.getByAlias(alias);
    if (!existing) {
      throw new TargetNotFoundError(alias);
    }

    const nextEnvironment = patch.environment ?? existing.environment;
    if (patch.environment && patch.environment !== 'test' && patch.environment !== 'prod') {
      throw new TargetValidationError('environment 仅支持 test 或 prod');
    }

    const requestedPermissionMode = patch.defaultPermissionMode;
    if (requestedPermissionMode && !PERMISSION_MODES.includes(requestedPermissionMode)) {
      throw new TargetValidationError(`defaultPermissionMode 无效，仅支持: ${PERMISSION_MODES.join(', ')}`);
    }

    let nextDefaultPermissionMode = requestedPermissionMode ?? existing.defaultPermissionMode;
    if (patch.environment && requestedPermissionMode === undefined) {
      nextDefaultPermissionMode = DEFAULT_PERMISSION_BY_ENV[nextEnvironment];
    }

    if (nextEnvironment === 'prod' && nextDefaultPermissionMode !== 'safe') {
      throw new TargetValidationError('prod 环境的默认权限必须为 safe');
    }

    const updated = this.repository.update(alias, {
      description: patch.description,
      environment: nextEnvironment,
      defaultPermissionMode: nextDefaultPermissionMode,
    });

    if (!updated) {
      throw new TargetNotFoundError(alias);
    }
    return this.toSummary(updated);
  }

  deleteTarget(aliasOrTarget: string): boolean {
    const alias = this.parseAlias(aliasOrTarget);
    return this.repository.delete(alias);
  }

  close(): void {
    this.repository.close();
  }

  private applyPermissionPolicy(
    record: SavedTargetRecord,
    config: Record<string, unknown>,
    overrides: Record<string, unknown>
  ): void {
    const explicitPermissionMode = this.parsePermissionMode(overrides.permissionMode);
    const explicitPermissions = this.parsePermissions(overrides.permissions);
    const explicitAllowWrite = this.parseAllowWrite(overrides.allowWrite);
    this.permissionResolver.apply(config, {
      environment: record.environment,
      defaultPermissionMode: record.defaultPermissionMode,
      explicitPermissionMode,
      explicitPermissions,
      explicitAllowWrite,
    });
  }

  private resolveEnvironment(environmentInput: unknown, alias: string): TargetEnvironment {
    if (environmentInput === 'test' || environmentInput === 'prod') {
      return environmentInput;
    }
    if (alias.endsWith('-prod')) {
      return 'prod';
    }
    if (alias.endsWith('-test')) {
      return 'test';
    }
    return 'test';
  }

  private resolveDefaultPermissionMode(
    environment: TargetEnvironment,
    permissionModeInput: unknown,
    permissionsInput: unknown
  ): PermissionMode {
    if (environment === 'prod') {
      return 'safe';
    }

    const explicitMode = this.parsePermissionMode(permissionModeInput);
    if (explicitMode) {
      return explicitMode;
    }

    const explicitPermissions = this.parsePermissions(permissionsInput);
    if (explicitPermissions && explicitPermissions.length > 0) {
      return 'custom';
    }

    return DEFAULT_PERMISSION_BY_ENV[environment];
  }

  private parsePermissionMode(value: unknown): PermissionMode | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value !== 'string' || !PERMISSION_MODES.includes(value as PermissionMode)) {
      throw new TargetValidationError(`permissionMode 无效，仅支持: ${PERMISSION_MODES.join(', ')}`);
    }
    return value as PermissionMode;
  }

  private parsePermissions(value: unknown): PermissionType[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      throw new TargetValidationError('permissions 必须是数组');
    }
    const unique = Array.from(new Set(value.map(item => String(item))));
    const invalid = unique.filter(item => !PERMISSION_TYPES.includes(item as PermissionType));
    if (invalid.length > 0) {
      throw new TargetValidationError(`permissions 包含非法值: ${invalid.join(', ')}`);
    }
    return unique as PermissionType[];
  }

  private parseAllowWrite(value: unknown): boolean | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return Boolean(value);
  }

  private extractConnectionPayload(payload: Record<string, unknown>): SavedTargetConnectionPayload {
    const connection: Record<string, unknown> = {};
    const secrets: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || CONTROL_FIELDS.has(key)) {
        continue;
      }
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        secrets[key] = value;
      } else {
        connection[key] = value;
      }
    }

    const dbType = connection.type as DbConfig['type'] | undefined;
    if (!dbType || typeof dbType !== 'string') {
      throw new TargetValidationError('连接配置缺少 type');
    }

    return {
      dbType,
      connection,
      secrets,
    };
  }

  private parseAlias(aliasInput: unknown): string {
    if (typeof aliasInput !== 'string') {
      throw new TargetValidationError('alias 必须是字符串');
    }
    return aliasInput.trim().toLowerCase();
  }

  private parseDescription(descriptionInput: unknown): string | undefined {
    if (descriptionInput === undefined || descriptionInput === null || descriptionInput === '') {
      return undefined;
    }
    if (typeof descriptionInput !== 'string') {
      throw new TargetValidationError('description 必须是字符串');
    }
    return descriptionInput.trim();
  }

  private validateAlias(alias: string): void {
    if (alias.length < 4 || alias.length > 63) {
      throw new TargetValidationError('alias 长度必须在 4 到 63 个字符之间');
    }

    if (!alias.includes('-')) {
      throw new TargetValidationError('alias 格式不合法，建议使用 <dbType>-<env>，例如 dm-test');
    }

    const pattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    if (!pattern.test(alias) || alias.includes('--')) {
      throw new TargetValidationError('alias 仅支持小写字母、数字和短横线，且不能连续使用短横线');
    }
  }

  private toSummary(record: SavedTargetRecord): SavedTargetSummary {
    const connection = this.parseJson(record.connectionJson, '连接配置损坏，无法读取摘要');
    return {
      alias: record.alias,
      dbType: record.dbType,
      environment: record.environment,
      description: record.description,
      defaultPermissionMode: record.defaultPermissionMode,
      host: this.maskHost(connection.host),
      user: this.maskUser(connection.user),
      port: this.asNumber(connection.port),
      database: this.asString(connection.database),
      filePath: this.maskFilePath(connection.filePath),
      hasSecrets: this.hasSecrets(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private hasSecrets(record: SavedTargetRecord): boolean {
    try {
      const secrets = this.parseJson(this.cryptoService.decrypt(record.encryptedSecrets), '解密失败');
      return Object.keys(secrets).length > 0;
    } catch {
      return true;
    }
  }

  private parseJson(raw: string, errorMessage: string): Record<string, unknown> {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid shape');
      }
      return value as Record<string, unknown>;
    } catch {
      throw new TargetValidationError(errorMessage);
    }
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private maskHost(host: unknown): string | undefined {
    const value = this.asString(host);
    if (!value) {
      return undefined;
    }
    if (value.length <= 4) {
      return `${value[0] ?? ''}***`;
    }
    return `${value.slice(0, 2)}***${value.slice(-1)}`;
  }

  private maskUser(user: unknown): string | undefined {
    const value = this.asString(user);
    if (!value) {
      return undefined;
    }
    if (value.length <= 2) {
      return `${value[0] ?? ''}*`;
    }
    return `${value[0]}***${value.slice(-1)}`;
  }

  private maskFilePath(filePath: unknown): string | undefined {
    const value = this.asString(filePath);
    if (!value) {
      return undefined;
    }
    if (value.length <= 8) {
      return '***';
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }
}
