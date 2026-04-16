import type { PermissionMode, PermissionType } from '../types/adapter.js';
import type { TargetEnvironment } from '../types/targets.js';

export class TargetPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetPermissionError';
  }
}

interface PermissionResolutionInput {
  environment: TargetEnvironment;
  defaultPermissionMode: PermissionMode;
  explicitPermissionMode?: PermissionMode;
  explicitPermissions?: PermissionType[];
  explicitAllowWrite?: boolean;
}

export class TargetPermissionResolver {
  apply(config: Record<string, unknown>, input: PermissionResolutionInput): void {
    const {
      environment,
      defaultPermissionMode,
      explicitPermissionMode,
      explicitPermissions,
      explicitAllowWrite,
    } = input;

    const hasExplicitOverride =
      explicitPermissionMode !== undefined ||
      explicitPermissions !== undefined ||
      explicitAllowWrite !== undefined;

    if (environment === 'prod') {
      if (hasExplicitOverride && this.isEscalationRequest(explicitPermissionMode, explicitPermissions, explicitAllowWrite)) {
        throw new TargetPermissionError('prod 连接别名默认禁止升权；请使用 safe 权限连接');
      }
      config.permissionMode = 'safe';
      config.permissions = undefined;
      config.allowWrite = false;
      return;
    }

    if (explicitPermissionMode !== undefined) {
      config.permissionMode = explicitPermissionMode;
    } else if (explicitPermissions === undefined) {
      config.permissionMode = defaultPermissionMode;
    }

    if (explicitPermissions !== undefined) {
      config.permissions = explicitPermissions;
    }

    if (explicitAllowWrite !== undefined) {
      config.allowWrite = explicitAllowWrite;
    }
  }

  private isEscalationRequest(
    permissionMode?: PermissionMode,
    permissions?: PermissionType[],
    allowWrite?: boolean
  ): boolean {
    if (allowWrite === true) {
      return true;
    }
    if (permissionMode && permissionMode !== 'safe') {
      return true;
    }
    if (permissions && permissions.some(permission => permission !== 'read')) {
      return true;
    }
    return false;
  }
}

