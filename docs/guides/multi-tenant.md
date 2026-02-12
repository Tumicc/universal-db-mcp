# 多租户场景使用指南

本指南介绍如何在多租户场景下使用 MCP 数据库连接器，特别是当您的表中使用 `company_id` 等字段来区分租户时。

## 📋 目录

- [基本使用方式](#基本使用方式)
- [方案 1：使用数据库视图（推荐，最安全）](#方案-1使用数据库视图推荐最安全)
- [方案 2：使用对话上下文](#方案-2使用对话上下文)
- [方案 3：使用专用数据库（最彻底的隔离）](#方案-3使用专用数据库最彻底的隔离)
- [推荐配置](#推荐配置)
- [多租户配置示例](#多租户配置示例)
- [最佳实践](#最佳实践)

---

## 基本使用方式

在多租户场景下，您有几种方式来处理租户隔离：

### 方式 1：在对话中明确指定租户 ID（推荐）

每次查询时，在对话中明确告诉 Claude 要查询哪个租户的数据：

```
你：查询 company_id = 1001 的所有订单
```

Claude 会自动生成带租户过滤的 SQL：
```sql
SELECT * FROM orders WHERE company_id = 1001;
```

或者：
```
你：帮我统计租户 1001 最近 7 天的订单数量
```

Claude 会生成：
```sql
SELECT COUNT(*) FROM orders
WHERE company_id = 1001
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
```

### 方式 2：设置对话上下文（更方便）

在对话开始时，先告诉 Claude 当前的租户上下文：

```
你：我现在要查询租户 1001 的数据，接下来所有查询都针对这个租户。
```

然后后续的查询就可以简化：

```
你：查询所有订单
```

Claude 会记住上下文，自动生成：
```sql
SELECT * FROM orders WHERE company_id = 1001;
```

```
你：统计用户数量
```

Claude 会生成：
```sql
SELECT COUNT(*) FROM users WHERE company_id = 1001;
```

### 方式 3：使用更自然的语言

您也可以用更自然的方式表达：

```
你：帮我看看公司 1001 的订单情况
你：查询属于租户 1001 的所有用户
你：统计 company_id 为 1001 的销售额
```

### 方式 4：批量查询多个租户

如果需要对比多个租户的数据：

```
你：对比租户 1001、1002、1003 的订单数量
```

Claude 会生成：
```sql
SELECT company_id, COUNT(*) as order_count
FROM orders
WHERE company_id IN (1001, 1002, 1003)
GROUP BY company_id;
```

---

## 方案 1：使用数据库视图（推荐，最安全）

这是**最安全**的方案，通过数据库层面的视图和权限控制来实现租户隔离。

### 步骤 1：在数据库中为租户创建视图

以 OceanBase/MySQL 为例：

```sql
-- 为租户 1001 创建专用视图
CREATE VIEW tenant_1001_orders AS
SELECT * FROM orders WHERE company_id = 1001;

CREATE VIEW tenant_1001_users AS
SELECT * FROM users WHERE company_id = 1001;

CREATE VIEW tenant_1001_products AS
SELECT * FROM products WHERE company_id = 1001;

-- 为租户创建专用用户
CREATE USER 'tenant_1001'@'%' IDENTIFIED BY 'secure_password';

-- 只授予视图的访问权限
GRANT SELECT ON mydb.tenant_1001_orders TO 'tenant_1001'@'%';
GRANT SELECT ON mydb.tenant_1001_users TO 'tenant_1001'@'%';
GRANT SELECT ON mydb.tenant_1001_products TO 'tenant_1001'@'%';

FLUSH PRIVILEGES;
```

### 步骤 2：配置 Claude Desktop

编辑 Claude Desktop 配置文件：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "oceanbase-tenant-1001": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1001@test",
        "--password", "secure_password",
        "--database", "mydb"
      ]
    }
  }
}
```

### 步骤 3：使用

```
你：查询 tenant_1001_orders 视图中的所有订单
你：统计 tenant_1001_users 视图中的用户数量
```

### 优缺点

**优点**：
- ✅ 数据库层面强制隔离，最安全
- ✅ 用户无法访问其他租户数据
- ✅ 视图名称明确，不会混淆
- ✅ 适合生产环境

**缺点**：
- ⚠️ 需要为每个表创建视图
- ⚠️ 视图名称不同于原表名
- ⚠️ 需要数据库管理员权限

---

## 方案 2：使用对话上下文

这是**最简单**的方案，通过在对话中设置上下文来实现租户过滤。

### 步骤 1：创建租户专用用户（可选）

```sql
-- 创建租户 1001 的用户
CREATE USER 'tenant_1001'@'%' IDENTIFIED BY 'secure_password';

-- 授予表的查询权限
GRANT SELECT ON mydb.orders TO 'tenant_1001'@'%';
GRANT SELECT ON mydb.users TO 'tenant_1001'@'%';
GRANT SELECT ON mydb.products TO 'tenant_1001'@'%';

FLUSH PRIVILEGES;
```

### 步骤 2：配置 Claude Desktop

```json
{
  "mcpServers": {
    "oceanbase-tenant-1001": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1001@test",
        "--password", "secure_password",
        "--database", "mydb"
      ]
    }
  }
}
```

### 步骤 3：在对话中设置上下文

```
你：我现在使用的是租户 1001，所有查询都要加上 WHERE company_id = 1001 的条件。

Claude：好的，我会记住这个上下文，后续所有查询都会自动添加 company_id = 1001 的过滤条件。

你：查询所有订单

Claude 执行：
SELECT * FROM orders WHERE company_id = 1001;
```

### 优缺点

**优点**：
- ✅ 使用原表名，不需要创建视图
- ✅ 配置简单，快速上手
- ✅ 灵活，可以随时切换租户
- ✅ 适合开发和测试环境

**缺点**：
- ⚠️ 依赖对话上下文，可能被遗忘
- ⚠️ 没有数据库层面的强制隔离
- ⚠️ 需要在每次对话开始时重新设置

---

## 方案 3：使用专用数据库（最彻底的隔离）

这是**隔离最彻底**的方案，为每个租户创建独立的数据库。

### 步骤 1：创建租户专用数据库

```sql
-- 创建租户 1001 的专用数据库
CREATE DATABASE tenant_1001_db;

-- 在专用数据库中创建表（只包含该租户的数据）
USE tenant_1001_db;

CREATE TABLE orders AS
SELECT * FROM mydb.orders WHERE company_id = 1001;

CREATE TABLE users AS
SELECT * FROM mydb.users WHERE company_id = 1001;

CREATE TABLE products AS
SELECT * FROM mydb.products WHERE company_id = 1001;

-- 创建用户并授权
CREATE USER 'tenant_1001'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT ON tenant_1001_db.* TO 'tenant_1001'@'%';

FLUSH PRIVILEGES;
```

### 步骤 2：配置 Claude Desktop

```json
{
  "mcpServers": {
    "oceanbase-tenant-1001": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1001@test",
        "--password", "secure_password",
        "--database", "tenant_1001_db"
      ]
    }
  }
}
```

### 步骤 3：使用

```
你：查询所有订单
你：统计用户数量
```

直接使用原表名，无需指定租户 ID。

### 优缺点

**优点**：
- ✅ 完全隔离，最安全
- ✅ 使用原表名，无需修改查询
- ✅ 性能最好（无需过滤）
- ✅ 适合大型企业客户

**缺点**：
- ⚠️ 需要数据同步机制
- ⚠️ 存储空间占用更多
- ⚠️ 维护成本较高

---

## 推荐配置

如果您想要**最简单且安全**的配置，推荐这样做：

### 1. 创建租户专用数据库用户

```sql
-- 为租户 1001 创建用户
CREATE USER 'tenant_1001'@'%' IDENTIFIED BY 'password_1001';

-- 授予查询权限
GRANT SELECT ON mydb.* TO 'tenant_1001'@'%';

FLUSH PRIVILEGES;
```

### 2. 配置 Claude Desktop（为租户命名）

```json
{
  "mcpServers": {
    "oceanbase-tenant-1001": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1001@test",
        "--password", "password_1001",
        "--database", "mydb"
      ]
    }
  }
}
```

### 3. 在对话开始时设置上下文

```
你：我现在要查询租户 1001 的数据（company_id = 1001），请在所有查询中自动添加这个过滤条件。

Claude：好的，我已记录。后续所有查询都会自动添加 WHERE company_id = 1001 的条件。

你：查询最近 10 条订单

Claude 执行：
SELECT * FROM orders
WHERE company_id = 1001
ORDER BY created_at DESC
LIMIT 10;
```

---

## 多租户配置示例

如果您有多个租户，可以这样配置：

```json
{
  "mcpServers": {
    "oceanbase-tenant-1001": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1001@test",
        "--password", "password_1001",
        "--database", "mydb"
      ]
    },
    "oceanbase-tenant-1002": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1002@test",
        "--password", "password_1002",
        "--database", "mydb"
      ]
    },
    "oceanbase-tenant-1003": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "tenant_1003@test",
        "--password", "password_1003",
        "--database", "mydb"
      ]
    }
  }
}
```

然后在对话中，Claude 会看到多个连接，您可以明确指定使用哪个。

---

## 最佳实践

### 1. 根据环境选择方案

| 环境 | 推荐方案 | 原因 |
|------|---------|------|
| 开发/测试 | 方案 2（对话上下文） | 简单快速，灵活切换 |
| 生产环境 | 方案 1（数据库视图） | 安全可靠，强制隔离 |
| 严格隔离需求 | 方案 3（专用数据库） | 完全隔离，性能最优 |

### 2. 安全建议

#### 使用只读用户

为了安全，建议为每个租户创建只读用户：

```sql
-- 创建只读用户
CREATE USER 'tenant_1001_readonly'@'%' IDENTIFIED BY 'password';

-- 只授予查询权限
GRANT SELECT ON mydb.* TO 'tenant_1001_readonly'@'%';

FLUSH PRIVILEGES;
```

#### 限制网络访问

- 使用防火墙限制数据库端口访问
- 仅允许可信 IP 地址连接
- 在生产环境中使用 VPN 或专线

#### 使用强密码

- 为每个租户使用不同的强密码
- 定期更换密码
- 使用密码管理工具

### 3. 实际使用示例

#### 场景 1：日常数据查询

```
你：我要查询租户 1001 的数据

Claude：好的，我会在后续查询中自动添加 company_id = 1001 的过滤条件。

你：查看最近 10 条订单

Claude 执行：
SELECT * FROM orders
WHERE company_id = 1001
ORDER BY created_at DESC
LIMIT 10;
```

#### 场景 2：数据分析

```
你：帮我分析租户 1001 最近一个月的销售趋势

Claude 会：
1. 查询该租户的订单数据
2. 按日期分组统计
3. 生成趋势分析报告

执行的 SQL：
SELECT
    DATE(created_at) as date,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
FROM orders
WHERE company_id = 1001
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at)
ORDER BY date;
```

#### 场景 3：跨租户对比

```
你：对比租户 1001 和 1002 的活跃用户数

Claude 执行：
SELECT
    company_id,
    COUNT(DISTINCT user_id) as active_users
FROM user_activities
WHERE company_id IN (1001, 1002)
  AND activity_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY company_id;
```

### 4. 注意事项

#### MCP 连接器本身不需要特殊配置
- MCP 连接器只是执行 SQL，不需要特殊的租户配置
- 租户隔离在 SQL 层面或数据库层面实现

#### 在对话中明确指定租户 ID
- 每次对话开始时设置租户上下文
- Claude 会智能地在 SQL 中添加过滤条件

#### 生产环境建议使用数据库级别的权限控制
- 为每个租户创建独立用户
- 使用视图或专用数据库实现强制隔离
- 定期审计访问日志

---

## 总结

**核心要点**：

1. **MCP 连接器本身不需要特殊配置**，它只是执行 SQL
2. **租户隔离在 SQL 层面实现**，通过 WHERE company_id = xxx 条件
3. **在对话中明确指定租户 ID**，Claude 会自动在 SQL 中添加过滤条件
4. **可以设置对话上下文**，让 Claude 记住当前操作的租户
5. **生产环境建议使用数据库级别的权限控制**，为每个租户创建独立用户

这种方式既灵活又安全，Claude 会智能地理解您的意图并生成正确的 SQL 查询。

---

## 常见问题

### Q1: 如何确保 Claude 不会忘记租户上下文？

**A**: 在每次对话开始时重新设置上下文，或者使用方案 1（数据库视图）在数据库层面强制隔离。

### Q2: 可以同时查询多个租户的数据吗？

**A**: 可以。在对话中明确指定多个租户 ID，Claude 会生成包含 `IN (1001, 1002, 1003)` 的 SQL。

### Q3: 如何防止误操作其他租户的数据？

**A**: 使用方案 1（数据库视图）或方案 3（专用数据库），在数据库层面强制隔离，用户无法访问其他租户的数据。

### Q4: 支持哪些数据库？

**A**: 本指南适用于所有支持的数据库：MySQL、PostgreSQL、OceanBase、TiDB、ClickHouse 等。具体 SQL 语法可能略有不同。

### Q5: 如何在写入模式下使用多租户？

**A**: 在配置中添加 `--permission-mode readwrite` 或 `--permission-mode full` 参数，并在对话中明确指定租户 ID。建议在生产环境中谨慎使用写入模式。

---

**如果您有其他问题或建议，欢迎在 GitHub Issues 中反馈！**
