# Redis 使用指南

## 配置示例

### 基础配置（无密码）

```json
{
  "mcpServers": {
    "redis-cache": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "redis",
        "--host", "localhost",
        "--port", "6379"
      ]
    }
  }
}
```

### 带密码和数据库选择

```json
{
  "mcpServers": {
    "redis-session": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "redis",
        "--host", "localhost",
        "--port", "6379",
        "--password", "redis_password",
        "--database", "1"
      ]
    }
  }
}
```

## 连接参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--host` | Redis 主机地址 | localhost |
| `--port` | Redis 端口 | 6379 |
| `--password` | 密码（可选） | - |
| `--database` | 数据库编号（0-15） | 0 |

## 使用示例

### 查看所有键

```
用户: 查看所有以 "user:" 开头的键

Claude 会执行: KEYS user:*
```

### 获取键值

```
用户: 获取 user:1001 的信息

Claude 会执行: GET user:1001 或 HGETALL user:1001（根据数据类型）
```

### 统计信息

```
用户: 统计缓存中有多少个会话

Claude 会执行: KEYS session:* 并统计数量
```

## 支持的命令

### 只读模式

- `GET` - 获取字符串值
- `HGET` / `HGETALL` - 获取哈希值
- `LRANGE` - 获取列表元素
- `SMEMBERS` - 获取集合成员
- `ZRANGE` - 获取有序集合成员
- `KEYS` - 查找键
- `TYPE` - 获取键类型
- `TTL` - 获取过期时间
- `EXISTS` - 检查键是否存在
- `DBSIZE` - 获取键数量
- `INFO` - 获取服务器信息

### 写入模式（需要 --permission-mode readwrite 或 full）

- `SET` - 设置字符串值
- `HSET` - 设置哈希字段
- `LPUSH` / `RPUSH` - 添加列表元素
- `SADD` - 添加集合成员
- `ZADD` - 添加有序集合成员
- `DEL` - 删除键
- `EXPIRE` - 设置过期时间
- `FLUSHDB` - 清空数据库

## 安全建议

1. **设置密码** - 生产环境必须设置密码
2. **绑定地址** - 不要绑定到 0.0.0.0
3. **禁用危险命令** - 在 redis.conf 中禁用 FLUSHALL、KEYS 等

## 支持的版本

- Redis 5.x
- Redis 6.x
- Redis 7.x

## 注意事项

1. **KEYS 命令** - 在大数据量时可能阻塞，建议使用 SCAN
2. **数据库编号** - Redis 默认有 16 个数据库（0-15）
3. **集群模式** - 当前不支持 Redis Cluster

## 常见问题

### 连接被拒绝

检查 Redis 配置中的 `bind` 和 `protected-mode` 设置。

### 认证失败

确保密码正确，检查 `requirepass` 配置。
