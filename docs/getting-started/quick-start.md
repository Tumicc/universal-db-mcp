# 快速开始

5 分钟快速上手 Universal DB MCP。

## 选择运行模式

Universal DB MCP 支持两种运行模式：

| 模式 | 适用场景 | 启动方式 |
|------|----------|----------|
| **MCP 模式** | Claude Desktop 集成 | `npm start` |
| **HTTP API 模式** | Coze、n8n、Dify 等平台 | `npm run start:http` |

## MCP 模式快速开始

### 1. 安装

```bash
npm install -g universal-db-mcp
```

### 2. 配置 Claude Desktop

编辑 Claude Desktop 配置文件：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

添加数据库配置（以 MySQL 为例）：

```json
{
  "mcpServers": {
    "mysql-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

### 3. 重启 Claude Desktop

重启后，在对话中直接询问：

- "帮我查看 users 表的结构"
- "统计最近 7 天的订单数量"
- "找出消费金额最高的 10 个用户"

Claude 会自动调用数据库工具完成查询！

## HTTP API 模式快速开始

### 1. 配置环境变量

创建 `.env` 文件：

```bash
MODE=http
HTTP_PORT=3000
API_KEYS=your-secret-key
```

### 2. 启动服务

```bash
npm run start:http
```

### 3. 测试 API

```bash
# 健康检查
curl http://localhost:3000/api/health

# 连接数据库
curl -X POST http://localhost:3000/api/connect \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "your_password",
    "database": "your_database"
  }'

# 执行查询（使用返回的 sessionId）
curl -X POST http://localhost:3000/api/query \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "返回的sessionId",
    "query": "SELECT * FROM users LIMIT 10"
  }'
```

## 支持的数据库

| 数据库 | 类型参数 | 默认端口 |
|--------|---------|---------|
| MySQL | `mysql` | 3306 |
| PostgreSQL | `postgres` | 5432 |
| Redis | `redis` | 6379 |
| Oracle | `oracle` | 1521 |
| SQL Server | `sqlserver` | 1433 |
| MongoDB | `mongodb` | 27017 |
| SQLite | `sqlite` | - |
| 达梦 | `dm` | 5236 |
| KingbaseES | `kingbase` | 54321 |
| GaussDB | `gaussdb` | 5432 |
| OceanBase | `oceanbase` | 2881 |
| TiDB | `tidb` | 4000 |
| ClickHouse | `clickhouse` | 8123 |
| PolarDB | `polardb` | 3306 |
| Vastbase | `vastbase` | 5432 |
| HighGo | `highgo` | 5866 |
| GoldenDB | `goldendb` | 3306 |

## 安全模式

默认情况下，工具运行在**只读模式**，会拒绝所有写入操作。

支持细粒度权限控制：

```bash
# 只读模式（默认）
--permission-mode safe

# 读写但不能删除
--permission-mode readwrite

# 自定义权限
--permissions read,insert,update

# 完全控制（危险！）
--permission-mode full
```

## 下一步

- [配置说明](./configuration.md) - 详细配置选项
- [使用示例](./examples.md) - 各数据库使用示例
- [部署指南](../deployment/README.md) - 生产环境部署
