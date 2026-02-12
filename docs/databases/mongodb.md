# MongoDB 数据库使用指南

本指南详细介绍如何使用 MCP 数据库万能连接器连接和操作 MongoDB 数据库。

## 📋 目录

- [快速开始](#快速开始)
- [连接配置](#连接配置)
- [查询语法](#查询语法)
- [常见操作示例](#常见操作示例)
- [高级功能](#高级功能)
- [故障排查](#故障排查)
- [最佳实践](#最佳实践)

---

## 快速开始

### 前置要求

- Node.js >= 20
- Claude Desktop 应用
- MongoDB 4.0 或更高版本

### 安装

```bash
npm install -g universal-db-mcp
```

### 基础配置

编辑 Claude Desktop 配置文件：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

添加以下配置：

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mongodb",
        "--host", "localhost",
        "--port", "27017",
        "--user", "admin",
        "--password", "your_password",
        "--database", "myapp"
      ]
    }
  }
}
```

重启 Claude Desktop 即可使用。

---

## 连接配置

### 本地 MongoDB（无认证）

适用于开发环境：

```json
{
  "mcpServers": {
    "mongodb-local": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mongodb",
        "--host", "localhost",
        "--port", "27017",
        "--database", "test"
      ]
    }
  }
}
```

### 本地 MongoDB（带认证）

```json
{
  "mcpServers": {
    "mongodb-auth": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mongodb",
        "--host", "localhost",
        "--port", "27017",
        "--user", "myuser",
        "--password", "mypassword",
        "--database", "myapp"
      ]
    }
  }
}
```

**注意**: 默认认证数据库为 `admin`。如果需要使用其他认证数据库，可以通过环境变量设置。

### 连接 MongoDB Atlas

MongoDB Atlas 是 MongoDB 的云服务：

```json
{
  "mcpServers": {
    "mongodb-atlas": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mongodb",
        "--host", "cluster0.xxxxx.mongodb.net",
        "--port", "27017",
        "--user", "atlasuser",
        "--password", "atlaspassword",
        "--database", "production"
      ]
    }
  }
}
```

**提示**:
- 从 Atlas 控制台获取连接字符串中的主机名
- 确保 IP 地址已添加到 Atlas 白名单
- 使用数据库用户凭据，不是 Atlas 账号密码

### 连接副本集

```json
{
  "mcpServers": {
    "mongodb-replica": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mongodb",
        "--host", "replica-primary.example.com",
        "--port", "27017",
        "--user", "replicauser",
        "--password", "replicapassword",
        "--database", "myapp"
      ]
    }
  }
}
```

**注意**: 当前版本连接到主节点，副本集自动故障转移功能将在未来版本支持。

---

## 查询语法

MongoDB 适配器支持两种查询格式：

### 1. JSON 格式（推荐）

完整的 JSON 格式，支持所有参数：

```json
{
  "collection": "users",
  "operation": "find",
  "query": {"age": {"$gt": 18}},
  "options": {"limit": 10, "sort": {"name": 1}}
}
```

**字段说明**:
- `collection`: 集合名称（必需）
- `operation`: 操作名称（必需）
- `query`: 查询条件（可选，默认为 `{}`）
- `update`: 更新内容（update 操作需要）
- `pipeline`: 聚合管道（aggregate 操作需要）
- `options`: 额外选项（可选）

### 2. 简化格式

类似 MongoDB Shell 的语法：

```javascript
db.users.find({"age": {"$gt": 18}})
```

**限制**: 简化格式只支持基本查询，不支持复杂选项。

---

## 常见操作示例

### 查询操作

#### 查询所有文档

```json
{
  "collection": "users",
  "operation": "find",
  "query": {}
}
```

或简化格式：
```javascript
db.users.find({})
```

#### 条件查询

查询年龄大于 18 的用户：

```json
{
  "collection": "users",
  "operation": "find",
  "query": {"age": {"$gt": 18}}
}
```

#### 查询单个文档

```json
{
  "collection": "users",
  "operation": "findOne",
  "query": {"email": "user@example.com"}
}
```

#### 限制返回数量

```json
{
  "collection": "users",
  "operation": "find",
  "query": {},
  "options": {"limit": 10}
}
```

#### 排序

按创建时间倒序：

```json
{
  "collection": "orders",
  "operation": "find",
  "query": {},
  "options": {"sort": {"createdAt": -1}, "limit": 20}
}
```

#### 统计文档数量

```json
{
  "collection": "users",
  "operation": "count",
  "query": {"status": "active"}
}
```

#### 获取不同值

获取所有不同的城市：

```json
{
  "collection": "users",
  "operation": "distinct",
  "query": {},
  "options": {"field": "city"}
}
```

### 聚合操作

#### 分组统计

统计每个城市的用户数量：

```json
{
  "collection": "users",
  "operation": "aggregate",
  "pipeline": [
    {"$group": {"_id": "$city", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
  ]
}
```

#### 复杂聚合

计算每个类别的平均价格：

```json
{
  "collection": "products",
  "operation": "aggregate",
  "pipeline": [
    {"$match": {"status": "active"}},
    {"$group": {
      "_id": "$category",
      "avgPrice": {"$avg": "$price"},
      "count": {"$sum": 1}
    }},
    {"$sort": {"avgPrice": -1}}
  ]
}
```

### 写入操作（需要 --permission-mode readwrite 或 full）

#### 插入单个文档

```json
{
  "collection": "users",
  "operation": "insertOne",
  "query": {
    "name": "张三",
    "email": "zhangsan@example.com",
    "age": 25,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### 插入多个文档

```json
{
  "collection": "users",
  "operation": "insertMany",
  "query": [
    {"name": "李四", "age": 30},
    {"name": "王五", "age": 28}
  ]
}
```

#### 更新单个文档

```json
{
  "collection": "users",
  "operation": "updateOne",
  "query": {"email": "user@example.com"},
  "update": {"$set": {"age": 26, "updatedAt": "2024-01-02T00:00:00Z"}}
}
```

#### 更新多个文档

```json
{
  "collection": "users",
  "operation": "updateMany",
  "query": {"status": "inactive"},
  "update": {"$set": {"status": "archived"}}
}
```

#### 删除单个文档

```json
{
  "collection": "users",
  "operation": "deleteOne",
  "query": {"_id": "507f1f77bcf86cd799439011"}
}
```

#### 删除多个文档

```json
{
  "collection": "logs",
  "operation": "deleteMany",
  "query": {"createdAt": {"$lt": "2023-01-01T00:00:00Z"}}
}
```

---

## 高级功能

### 复杂查询条件

#### 逻辑运算符

使用 `$and`, `$or`, `$not`:

```json
{
  "collection": "users",
  "operation": "find",
  "query": {
    "$or": [
      {"age": {"$gt": 30}},
      {"city": "北京"}
    ]
  }
}
```

#### 数组查询

查询包含特定标签的文档：

```json
{
  "collection": "posts",
  "operation": "find",
  "query": {"tags": {"$in": ["技术", "编程"]}}
}
```

#### 正则表达式

查询名称包含"张"的用户：

```json
{
  "collection": "users",
  "operation": "find",
  "query": {"name": {"$regex": "张", "$options": "i"}}
}
```

### 聚合管道高级用法

#### Lookup（类似 JOIN）

```json
{
  "collection": "orders",
  "operation": "aggregate",
  "pipeline": [
    {
      "$lookup": {
        "from": "users",
        "localField": "userId",
        "foreignField": "_id",
        "as": "userInfo"
      }
    },
    {"$unwind": "$userInfo"},
    {"$limit": 10}
  ]
}
```

#### 投影（选择字段）

```json
{
  "collection": "users",
  "operation": "aggregate",
  "pipeline": [
    {
      "$project": {
        "name": 1,
        "email": 1,
        "age": 1,
        "_id": 0
      }
    }
  ]
}
```

---

## 故障排查

### 连接失败

**错误**: `MongoDB 连接失败: connect ECONNREFUSED`

**解决方案**:
1. 确认 MongoDB 服务正在运行：
   ```bash
   # Linux/Mac
   sudo systemctl status mongod

   # 或检查进程
   ps aux | grep mongod
   ```

2. 检查端口是否正确（默认 27017）

3. 检查防火墙规则

### 认证失败

**错误**: `MongoDB 连接失败: Authentication failed`

**解决方案**:
1. 确认用户名和密码正确

2. 检查用户是否有访问指定数据库的权限：
   ```javascript
   // 在 MongoDB Shell 中
   use admin
   db.auth("username", "password")

   // 查看用户权限
   db.getUser("username")
   ```

3. 创建用户并授权：
   ```javascript
   use admin
   db.createUser({
     user: "myuser",
     pwd: "mypassword",
     roles: [
       { role: "readWrite", db: "myapp" }
     ]
   })
   ```

### 写操作被拒绝

**错误**: `操作被拒绝：当前处于只读安全模式`

**解决方案**:
- 根据需要使用 `--permission-mode readwrite` 或 `--permission-mode full`
- **警告**: 仅在开发环境使用！

### Atlas 连接问题

**错误**: `MongoDB 连接失败: connection timeout`

**解决方案**:
1. 检查 IP 白名单：
   - 登录 MongoDB Atlas
   - 进入 Network Access
   - 添加当前 IP 地址或使用 `0.0.0.0/0`（仅测试用）

2. 确认连接字符串正确：
   - 从 Atlas 控制台复制连接字符串
   - 提取主机名（不包括 `mongodb://` 和参数）

3. 检查用户权限：
   - 在 Database Access 中确认用户存在
   - 确认用户有访问目标数据库的权限

---

## 最佳实践

### 安全建议

1. **生产环境只读**:
   - 永远不要在生产环境启用 `--permission-mode full`
   - 使用只读用户连接生产数据库

2. **最小权限原则**:
   ```javascript
   // 创建只读用户
   use admin
   db.createUser({
     user: "readonly",
     pwd: "secure_password",
     roles: [
       { role: "read", db: "production" }
     ]
   })
   ```

3. **网络安全**:
   - 使用 VPN 或 SSH 隧道连接远程数据库
   - 限制 IP 白名单
   - 启用 TLS/SSL 加密连接

4. **密码管理**:
   - 不要在配置文件中明文存储密码
   - 考虑使用环境变量或密钥管理服务

### 性能优化

1. **使用索引**:
   - 为常用查询字段创建索引
   - 使用 `explain()` 分析查询性能

2. **限制返回数量**:
   - 始终使用 `limit` 限制返回文档数量
   - 避免查询大量数据

3. **投影字段**:
   - 只查询需要的字段
   - 使用 `$project` 减少数据传输

4. **聚合优化**:
   - 在管道早期使用 `$match` 过滤数据
   - 合理使用 `$limit` 和 `$skip`

### 查询建议

1. **使用 JSON 格式**:
   - JSON 格式更清晰，支持所有功能
   - 便于调试和维护

2. **避免全表扫描**:
   - 始终使用查询条件
   - 为常用字段创建索引

3. **处理大数据集**:
   - 使用分页（`skip` 和 `limit`）
   - 考虑使用游标（未来版本支持）

4. **日期处理**:
   - 使用 ISO 8601 格式存储日期
   - 使用 `$gte` 和 `$lte` 进行范围查询

---

## 支持的 MongoDB 版本

- MongoDB 4.0+
- MongoDB 5.0+
- MongoDB 6.0+
- MongoDB 7.0+
- MongoDB Atlas（所有版本）

---

## 常见问题

### Q: 支持 MongoDB 连接字符串吗？

A: 当前版本使用独立参数配置。完整连接字符串支持将在未来版本添加。

### Q: 支持副本集和分片集群吗？

A: 支持连接到副本集的主节点。完整的副本集和分片集群支持将在未来版本添加。

### Q: 如何查看集合的结构？

A: 使用 `get_schema` 工具，它会采样文档并推断字段结构。由于 MongoDB 是无模式数据库，结构信息是基于采样的。

### Q: ObjectId 如何处理？

A: 查询结果中的 ObjectId 会自动转换为字符串格式，便于阅读和使用。

### Q: 支持事务吗？

A: 当前版本不支持事务。事务支持将在未来版本添加。

---

## 更多资源

- [MongoDB 官方文档](https://docs.mongodb.com/)
- [MongoDB 查询语法](https://docs.mongodb.com/manual/tutorial/query-documents/)
- [聚合管道](https://docs.mongodb.com/manual/core/aggregation-pipeline/)
- [项目 GitHub](https://github.com/Anarkh-Lee/universal-db-mcp)

---

**如果遇到问题，欢迎提交 Issue 或查看项目文档获取更多帮助！**
