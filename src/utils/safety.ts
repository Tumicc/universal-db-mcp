/**
 * 安全检查工具
 * 用于防止误操作删库等危险行为
 */

import type { DbConfig, PermissionType } from '../types/adapter.js';

/**
 * 操作类型到 SQL 关键字的映射
 */
const OPERATION_KEYWORDS: Record<Exclude<PermissionType, 'read'>, readonly string[]> = {
  insert: ['INSERT', 'REPLACE'],
  update: ['UPDATE'],
  delete: ['DELETE', 'TRUNCATE'],
  ddl: ['CREATE', 'ALTER', 'DROP', 'RENAME'],
} as const;

/**
 * 预设权限模式
 */
const PERMISSION_PRESETS: Record<string, readonly PermissionType[]> = {
  safe: ['read'],
  readwrite: ['read', 'insert', 'update'],
  full: ['read', 'insert', 'update', 'delete', 'ddl'],
} as const;

/**
 * 解析配置得到最终权限列表
 */
export function resolvePermissions(config: DbConfig): PermissionType[] {
  // 向后兼容：allowWrite=true 且未设置新参数时，等价于 full
  if (config.allowWrite === true && !config.permissionMode && !config.permissions) {
    return [...PERMISSION_PRESETS.full];
  }

  // 直接指定 permissions 数组（优先级最高）
  if (config.permissions?.length) {
    const perms = new Set<PermissionType>(['read', ...config.permissions]);
    return Array.from(perms);
  }

  // 使用预设模式
  if (config.permissionMode && config.permissionMode !== 'custom') {
    return [...PERMISSION_PRESETS[config.permissionMode]];
  }

  // 默认安全模式
  return [...PERMISSION_PRESETS.safe];
}

/**
 * 检查 SQL 语句是否以指定关键字开头
 */
function startsWithKeyword(query: string, keyword: string): boolean {
  const pattern = new RegExp(`^(\\s|--.*|/\\*.*?\\*/)*${keyword}\\b`, 'i');
  return pattern.test(query);
}

/**
 * 检查 SQL 语句是否包含写操作
 * @param query - 待检查的 SQL 语句
 * @returns 如果包含写操作返回 true
 */
export function isWriteOperation(query: string): boolean {
  const upperQuery = query.trim().toUpperCase();
  for (const keywords of Object.values(OPERATION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (startsWithKeyword(upperQuery, keyword)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检测查询的操作类型
 */
function detectOperationType(query: string): { type: Exclude<PermissionType, 'read'>; keyword: string } | null {
  const upperQuery = query.trim().toUpperCase();
  for (const [opType, keywords] of Object.entries(OPERATION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (startsWithKeyword(upperQuery, keyword)) {
        return { type: opType as Exclude<PermissionType, 'read'>, keyword };
      }
    }
  }
  return null;
}

/**
 * 验证查询是否允许执行
 * @param query - 待执行的查询
 * @param configOrAllowWrite - DbConfig 对象或 allowWrite 布尔值（向后兼容）
 * @throws 如果查询被拒绝，抛出带有中文提示的错误
 */
export function validateQuery(query: string, configOrAllowWrite: DbConfig | boolean): void {
  // 向后兼容：支持旧的 boolean 参数
  let permissions: PermissionType[];
  if (typeof configOrAllowWrite === 'boolean') {
    permissions = configOrAllowWrite ? [...PERMISSION_PRESETS.full] : [...PERMISSION_PRESETS.safe];
  } else {
    permissions = resolvePermissions(configOrAllowWrite);
  }

  const detected = detectOperationType(query);
  if (detected && !permissions.includes(detected.type)) {
    const permissionLabels: Record<string, string> = {
      insert: '插入(insert)',
      update: '更新(update)',
      delete: '删除(delete)',
      ddl: 'DDL(ddl)',
    };
    throw new Error(
      `❌ 操作被拒绝：当前权限不允许 ${detected.keyword} 操作。\n` +
      `需要的权限：${permissionLabels[detected.type]}\n` +
      `当前权限：${permissions.join(', ')}\n` +
      `如需更多权限，请使用 --permission-mode 或 --permissions 参数。`
    );
  }
}

/**
 * 获取查询中的危险关键字（用于日志记录）
 * @param query - SQL 查询语句
 * @returns 找到的危险关键字数组
 */
export function getDangerousKeywords(query: string): string[] {
  const upperQuery = query.trim().toUpperCase();
  const allKeywords = Object.values(OPERATION_KEYWORDS).flat();
  return allKeywords.filter(keyword => upperQuery.includes(keyword));
}

/**
 * 格式化权限列表用于显示
 */
export function formatPermissions(permissions: PermissionType[]): string {
  const labels: Record<PermissionType, string> = {
    read: '读取',
    insert: '插入',
    update: '更新',
    delete: '删除',
    ddl: 'DDL',
  };
  return permissions.map(p => `${labels[p]}(${p})`).join(', ');
}
