# Coze 集成指南

本指南展示如何将 Universal Database MCP Server 与 Coze 平台集成。

## 概述

Coze 是一个 AI 机器人开发平台。通过集成 Universal Database MCP Server，您可以让 Coze 机器人查询和分析数据库数据。

## 前置要求

- 部署了 HTTP API 模式的 Universal Database MCP Server
- Coze 账号
- 数据库实例（MySQL、PostgreSQL 等）

## 设置步骤

### 步骤 1: 部署 HTTP API 服务器

以 HTTP API 模式部署 Universal Database MCP Server：

```bash
# 使用 Docker
docker run -d \
  --name universal-db-mcp \
  -p 3000:3000 \
  -e MODE=http \
  -e HTTP_PORT=3000 \
  -e API_KEYS=coze-secret-key \
  -e CORS_ORIGINS=* \
  universal-db-mcp:latest
```

或部署到云平台（Railway、Render、Fly.io）。参见[部署指南](../http-api/DEPLOYMENT.zh-CN.md)。

### 步骤 2: 获取 API 端点

记录您的 API 端点 URL：
- 本地: `http://localhost:3000`
- 云端: `https://your-app.railway.app`（示例）

### 步骤 3: 创建 Coze 机器人

1. 登录 [Coze](https://www.coze.com/)
2. 点击"创建机器人"
3. 输入机器人名称和描述
4. 点击"创建"

### 步骤 4: 添加 API 插件

1. 在机器人编辑器中，点击"插件"标签
2. 点击"添加插件"
3. 选择"API 插件"
4. 配置 API：

**基本信息**:

- 名称: `数据库查询`
- 描述: `使用自然语言查询数据库`

**认证**:
- 类型: `API Key`
- 请求头名称: `X-API-Key`
- API Key: `coze-secret-key`（您的 API Key）

### 步骤 5: 配置 API 端点

#### 端点 1: 连接数据库

**名称**: `connect_database`
**方法**: `POST`
**URL**: `https://your-api-url/api/connect`
**描述**: 连接到数据库

**请求体**:
```json
{
  "type": "{{database_type}}",
  "host": "{{host}}",
  "port": {{port}},
  "user": "{{user}}",
  "password": "{{password}}",
  "database": "{{database}}",
  "permissionMode": "{{permission_mode}}"
}
```

**参数**:
- `database_type` (字符串, 必需): 数据库类型（mysql、postgres 等）
- `host` (字符串, 必需): 数据库主机
- `port` (数字, 必需): 数据库端口
- `user` (字符串, 必需): 用户名
- `password` (字符串, 必需): 密码
- `database` (字符串, 必需): 数据库名称
- `permission_mode` (字符串, 可选): 权限模式：`safe`（默认，只读）、`readwrite`（读写不删）、`full`（完全控制）
- `permissions` (数组, 可选): 自定义权限列表：`["read", "insert", "update", "delete", "ddl"]`

> ⚠️ **注意**：REST API 使用驼峰命名（`permissionMode`），不是连字符命名。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123",
    "databaseType": "mysql",
    "connected": true
  }
}
```

#### 端点 2: 执行查询

**名称**: `execute_query`
**方法**: `POST`
**URL**: `https://your-api-url/api/query`
**描述**: 执行 SQL 查询

**请求体**:
```json
{
  "sessionId": "{{session_id}}",
  "query": "{{sql_query}}"
}
```

**参数**:
- `session_id` (字符串, 必需): 从 connect_database 获取的会话 ID
- `sql_query` (字符串, 必需): 要执行的 SQL 查询

**响应示例**:
```json
{
  "success": true,
  "data": {
    "rows": [
      {"id": 1, "name": "Alice"},
      {"id": 2, "name": "Bob"}
    ],
    "executionTime": 15
  }
}
```

#### 端点 3: 列出表

**名称**: `list_tables`
**方法**: `GET`
**URL**: `https://your-api-url/api/tables?sessionId={{session_id}}`
**描述**: 列出数据库中的所有表

**参数**:
- `session_id` (字符串, 必需): 从 connect_database 获取的会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tables": ["users", "orders", "products"]
  }
}
```

#### 端点 4: 获取表结构

**名称**: `get_table_schema`
**方法**: `GET`
**URL**: `https://your-api-url/api/schema/{{table_name}}?sessionId={{session_id}}`
**描述**: 获取表结构

**参数**:
- `table_name` (字符串, 必需): 表名
- `session_id` (字符串, 必需): 从 connect_database 获取的会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "name": "users",
    "columns": [
      {"name": "id", "type": "int", "nullable": false},
      {"name": "name", "type": "varchar(255)", "nullable": false}
    ]
  }
}
```

### 步骤 6: 创建机器人技能

创建使用 API 插件的技能：

#### 技能 1: 数据库连接

**技能名称**: `连接数据库`
**描述**: 连接到数据库

**提示词**:
```
当用户要求连接数据库时，使用 connect_database API。

询问用户：
- 数据库类型（mysql、postgres 等）
- 主机
- 端口
- 用户名
- 密码
- 数据库名称

连接后，保存 sessionId 以供后续查询使用。
```

#### 技能 2: 查询数据

**技能名称**: `查询数据库`
**描述**: 使用自然语言查询数据库

**提示词**:
```
当用户询问数据相关问题时：

1. 如果未连接，要求用户先连接
2. 使用 list_tables 查看可用表
3. 使用 get_table_schema 了解表结构
4. 根据用户问题生成适当的 SQL 查询
5. 使用 execute_query 运行查询
6. 以可读的方式格式化并呈现结果

示例：
用户："显示所有用户"
机器人：
- 列出表以找到"users"表
- 获取"users"表的结构
- 生成 SQL: "SELECT * FROM users LIMIT 10"
- 执行查询
- 以表格格式呈现结果
```



**附上自己使用过的技能提示词：**

```
# 角色
你是一个专业的数据库查询助手，能够帮助用户连接数据库并使用自然语言查询数据。

# 技能

## 技能1：连接数据库
当用户要求连接数据库时：
1. 询问用户数据库类型（mysql、postgres、sqlite）
2. 询问数据库连接信息（主机、端口、用户名、密码、数据库名）
3. 调用 connect_database 接口连接数据库
4. 保存返回的 sessionId 用于后续查询
5. 告知用户连接结果

## 技能2：查询数据
当用户询问数据相关问题时：
1. 如果还未连接数据库，提示用户先连接
2. 先调用 list_tables 查看有哪些表
3. 调用 get_table_schema 了解相关表的结构
4. 根据用户的自然语言问题，生成合适的 SQL 查询语句
5. 调用 execute_query 执行查询
6. 将查询结果以易读的方式呈现给用户（使用表格或列表）

## 技能3：数据分析
当用户需要数据分析时：
1. 理解用户的分析需求
2. 生成适当的聚合查询（COUNT、SUM、AVG、GROUP BY等）
3. 执行查询并解读结果
4. 提供简洁的分析结论

# 限制
- 只执行 SELECT 查询，不执行 INSERT、UPDATE、DELETE 等写操作
- 查询结果默认限制 100 条，避免返回过多数据
- 如果用户的问题不清晰，主动询问澄清
- 保护用户隐私，不在对话中暴露敏感信息

# 示例对话

用户：连接我的MySQL数据库
助手：好的，请提供以下数据库连接信息：
1. 主机地址（如：localhost 或 IP地址）
2. 端口（MySQL默认3306）
3. 用户名
4. 密码
5. 数据库名称

用户：查看所有用户
助手：[调用 list_tables 和 get_table_schema]
      [生成 SQL: SELECT * FROM users LIMIT 100]
      [调用 execute_query]
      
      查询到 10 条用户记录：
      | ID | 姓名 | 邮箱 |
      |-----|------|------|
      | 1 | 张三 | zhangsan@example.com |
      | 2 | 李四 | lisi@example.com |
      ...

用户：上个月有多少订单？
助手：[分析问题，生成 SQL]
      [执行查询]
      
      上个月共有 1,234 个订单。
```



### 步骤 7: 测试机器人

使用示例查询测试您的机器人：

**示例 1: 连接**
```
用户：连接到我的 MySQL 数据库，地址 localhost:3306，用户 root，密码 xxx，数据库 testdb
机器人：[调用 connect_database API]
机器人：成功连接！会话 ID: abc123
```

**示例 2: 查询**
```
用户：显示所有用户
机器人：[调用 list_tables API]
机器人：[调用 get_table_schema API 获取"users"表]
机器人：[生成 SQL: SELECT * FROM users LIMIT 10]
机器人：[调用 execute_query API]
机器人：这是用户列表：
     1. Alice (alice@example.com)
     2. Bob (bob@example.com)
     ...
```

**示例 3: 复杂查询**
```
用户：上个月下了多少订单？
机器人：[分析表和结构]
机器人：[生成 SQL: SELECT COUNT(*) FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)]
机器人：[执行查询]
机器人：上个月下了 1,234 个订单。
```

## 高级功能

### 会话管理

在机器人内存中存储会话 ID：

```javascript
// 在机器人技能中
const sessionId = await connectDatabase(params);
bot.memory.set('db_session_id', sessionId);

// 稍后使用
const sessionId = bot.memory.get('db_session_id');
await executeQuery(sessionId, query);
```

### 错误处理

优雅地处理 API 错误：

```javascript
try {
  const result = await executeQuery(sessionId, query);
  return formatResults(result);
} catch (error) {
  if (error.code === 'SESSION_EXPIRED') {
    return "会话已过期。请重新连接数据库。";
  }
  return `错误: ${error.message}`;
}
```

### 查询优化

实现查询优化：

```javascript
// 添加 LIMIT 防止大结果集
if (!query.includes('LIMIT')) {
  query += ' LIMIT 100';
}

// 执行前验证查询
if (isWriteOperation(query) && !allowWrite) {
  return "只读模式下不允许写操作。";
}
```

## 安全最佳实践

### 1. 保护 API Keys

- 使用强随机 API Keys
- 定期轮换密钥
- 在 Coze 密钥中安全存储密钥

### 2. 数据库凭据

- 不要在机器人响应中暴露数据库凭据
- 尽可能使用只读数据库用户
- 实现连接池

### 3. 查询验证

- 执行前验证 SQL 查询
- 防止 SQL 注入
- 限制查询复杂度

### 4. 速率限制

- 配置适当的速率限制
- 监控 API 使用情况
- 实现指数退避

## 示例用例

### 用例 1: 客户支持机器人

机器人帮助支持人员查询客户数据：

```
用户：查找邮箱为 alice@example.com 的客户
机器人：[查询数据库]
机器人：找到客户：
     - ID: 123
     - 姓名: Alice Smith
     - 邮箱: alice@example.com
     - 状态: 活跃
     - 最后订单: 2026-01-20
```

### 用例 2: 分析机器人

机器人提供业务洞察：

```
用户：本月收入是多少？
机器人：[查询订单表]
机器人：本月收入: ¥125,430
     - 总订单数: 1,234
     - 平均订单价值: ¥101.65
     - 热销产品: Widget Pro
```

### 用例 3: 数据导出机器人

机器人以各种格式导出数据：

```
用户：导出所有活跃用户到 CSV
机器人：[查询数据库]
机器人：已导出 5,432 个活跃用户
     [提供下载链接]
```

## 故障排除

### 问题：连接失败

**症状**：机器人无法连接到数据库

**解决方案**：
1. 检查数据库是否运行
2. 验证凭据
3. 检查网络连接
4. 确保 API 服务器可从 Coze 访问

### 问题：查询超时

**症状**：查询耗时过长

**解决方案**：
1. 为数据库表添加索引
2. 优化 SQL 查询
3. 增加 API 配置中的超时时间
4. 对大结果集使用分页

### 问题：会话过期

**症状**："会话已过期"错误

**解决方案**：
1. 重新连接数据库
2. 增加会话超时时间
3. 实现自动重连逻辑

## 资源

- [Coze 文档](https://www.coze.com/docs)
- [API 参考](../http-api/API_REFERENCE.zh-CN.md)
- [部署指南](../http-api/DEPLOYMENT.zh-CN.md)

## 支持

如有集成问题：
- GitHub Issues: https://github.com/Anarkh-Lee/universal-db-mcp/issues
- Coze 社区: https://www.coze.com/community
