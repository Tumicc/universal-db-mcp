# SQL Server 使用指南

## 简介

universal-db-mcp 现已支持 Microsoft SQL Server（2012+）和 Azure SQL Database！使用 `mssql` 驱动提供完整的 SQL Server 功能支持。

### 支持的版本

- **SQL Server**: 2012, 2014, 2016, 2017, 2019, 2022
- **Azure SQL Database**: 完全支持
- **Azure SQL Managed Instance**: 完全支持

## 安装

### 方法 1: 全局安装（推荐）

```bash
npm install -g universal-db-mcp
```

SQL Server 驱动 `mssql` 会自动安装。

### 方法 2: 本地项目安装

```bash
mkdir my-db-project
cd my-db-project
npm init -y
npm install universal-db-mcp
```

## Claude Desktop 配置

编辑 Claude Desktop 配置文件：
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 基础配置（只读模式）

#### 连接本地 SQL Server

```json
{
  "mcpServers": {
    "sqlserver-local": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "sqlserver",
        "--host", "localhost",
        "--port", "1433",
        "--user", "sa",
        "--password", "YourPassword123",
        "--database", "master"
      ]
    }
  }
}
```

**提示**: 也可以使用 `--type mssql` 作为别名。

#### 连接 Azure SQL Database

```json
{
  "mcpServers": {
    "azure-sql": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "sqlserver",
        "--host", "myserver.database.windows.net",
        "--port", "1433",
        "--user", "myadmin",
        "--password", "MyPassword123!",
        "--database", "mydatabase"
      ]
    }
  }
}
```

**注意**: 连接 Azure SQL Database 时会自动检测并启用加密连接。

### 连接远程 SQL Server

```json
{
  "mcpServers": {
    "sqlserver-prod": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "sqlserver",
        "--host", "sql-server.example.com",
        "--port", "1433",
        "--user", "readonly_user",
        "--password", "secure_password",
        "--database", "ProductionDB"
      ]
    }
  }
}
```

### 启用写入模式（谨慎使用）

```json
{
  "mcpServers": {
    "sqlserver-dev": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "sqlserver",
        "--host", "localhost",
        "--port", "1433",
        "--user", "dev_user",
        "--password", "dev_password",
        "--database", "DevDB",
        "--permission-mode", "full"
      ]
    }
  }
}
```

⚠️ **警告**: 启用写入模式后，Claude 可以修改你的数据库。请仅在开发环境使用！

## 使用示例

### 查看数据库结构

**用户**: "查看数据库中有哪些表？"

**Claude 会自动**:
1. 调用 `get_schema` 工具
2. 返回所有表的列表和基本信息

### 查询数据

**用户**: "查询 Users 表中的所有记录"

**Claude 会自动**:
```sql
SELECT * FROM Users
```

**用户**: "查找最近一周注册的用户"

**Claude 会自动**:
```sql
SELECT * FROM Users
WHERE RegisterDate >= DATEADD(day, -7, GETDATE())
ORDER BY RegisterDate DESC
```

### 数据分析

**用户**: "统计每个部门的员工数量"

**Claude 会自动**:
```sql
SELECT DepartmentID, COUNT(*) as EmployeeCount
FROM Employees
GROUP BY DepartmentID
ORDER BY EmployeeCount DESC
```

**用户**: "计算每个月的销售总额"

**Claude 会自动**:
```sql
SELECT
  YEAR(OrderDate) as Year,
  MONTH(OrderDate) as Month,
  SUM(TotalAmount) as TotalSales
FROM Orders
GROUP BY YEAR(OrderDate), MONTH(OrderDate)
ORDER BY Year DESC, Month DESC
```

### 使用参数化查询

**用户**: "查找用户ID为123的订单"

**Claude 会自动**:
```sql
SELECT * FROM Orders WHERE UserID = @param0
```

参数会自动传递，防止 SQL 注入。

## 连接配置详解

### 端口配置

- **默认端口**: 1433
- **自定义端口**: 使用 `--port` 参数指定

### 身份验证

#### SQL Server 身份验证

使用用户名和密码：

```bash
--user "sa" --password "YourPassword123"
```

#### Windows 身份验证

Windows 身份验证支持将在未来版本中添加。

### 加密连接

- **本地 SQL Server**: 默认不加密（`trustServerCertificate: true`）
- **Azure SQL Database**: 自动检测并启用加密（`encrypt: true`）
- **自定义**: 通过主机名自动判断（包含 `.database.windows.net` 则启用加密）

## 常见问题排查

### 连接失败

**错误**: `SQL Server 连接失败: 无法连接到数据库服务器`

**解决方案**:
1. 检查 SQL Server 服务是否运行
2. 验证主机地址和端口是否正确
3. 检查防火墙规则是否允许 1433 端口
4. 确认 SQL Server 配置允许远程连接（SQL Server Configuration Manager）
5. 检查 TCP/IP 协议是否启用

### 身份验证失败

**错误**: `SQL Server 连接失败: 身份验证失败`

**解决方案**:
1. 确认用户名和密码正确
2. 检查 SQL Server 是否启用了 SQL Server 身份验证模式
3. 确认用户账号未被锁定或禁用
4. 对于 Azure SQL，确认防火墙规则允许你的 IP 地址

### 数据库不存在

**错误**: `SQL Server 连接失败: 数据库不存在`

**解决方案**:
1. 确认数据库名称拼写正确（区分大小写）
2. 使用 `master` 数据库连接后查看所有数据库：
   ```sql
   SELECT name FROM sys.databases
   ```

### 权限不足

**错误**: `查询执行失败: 表或视图不存在`

**解决方案**:
1. 确认用户有访问该表的权限
2. 授予 SELECT 权限：
   ```sql
   GRANT SELECT ON dbo.TableName TO username
   ```
3. 授予访问所有表的权限：
   ```sql
   GRANT SELECT ON SCHEMA::dbo TO username
   ```

### 写操作被拒绝

**错误**: `操作被拒绝：当前处于只读安全模式`

**解决方案**:
- 根据需要使用 `--permission-mode readwrite` 或 `--permission-mode full`
- 仅在开发环境使用！

### Azure SQL 连接超时

**错误**: `ETIMEDOUT` 或连接超时

**解决方案**:
1. 检查 Azure SQL 防火墙规则
2. 在 Azure Portal 中添加你的 IP 地址到防火墙白名单
3. 或启用"允许 Azure 服务访问"选项

## Azure SQL Database 特殊说明

### 防火墙配置

1. 登录 Azure Portal
2. 找到你的 SQL Server 资源
3. 点击"防火墙和虚拟网络"
4. 添加客户端 IP 地址
5. 保存更改

### 连接字符串格式

Azure SQL 主机名格式：
```
<server-name>.database.windows.net
```

示例：
```
mycompany-sql.database.windows.net
```

### 性能层级

- **Basic**: 适合小型应用和开发
- **Standard**: 适合中等负载
- **Premium**: 适合高性能需求
- **Serverless**: 按使用量计费，适合间歇性工作负载

### 最佳实践

1. **使用只读副本**: 对于分析查询，使用只读副本减少主数据库负载
2. **连接池**: 本工具自动使用连接池（最大10个连接）
3. **查询优化**: 使用索引和适当的查询优化
4. **监控**: 使用 Azure Portal 监控查询性能和资源使用

## 安全最佳实践

### ✅ 推荐做法

1. **使用只读账号**: 创建专门的只读用户
   ```sql
   CREATE LOGIN readonly_user WITH PASSWORD = 'SecurePassword123!';
   CREATE USER readonly_user FOR LOGIN readonly_user;
   GRANT SELECT ON SCHEMA::dbo TO readonly_user;
   ```

2. **限制访问范围**: 只授予必要的表访问权限
   ```sql
   GRANT SELECT ON dbo.Users TO readonly_user;
   GRANT SELECT ON dbo.Orders TO readonly_user;
   ```

3. **使用强密码**: 至少12个字符，包含大小写字母、数字和特殊字符

4. **启用审计**: 在 Azure SQL 中启用审计功能

5. **定期更新密码**: 定期轮换数据库密码

### ❌ 避免做法

1. 不要在生产环境启用写入模式
2. 不要使用 `sa` 或 `admin` 账号
3. 不要在配置文件中明文存储密码（考虑使用环境变量）
4. 不要在公共网络直接连接生产数据库
5. 不要授予不必要的权限

## 性能优化建议

### 查询优化

1. **使用索引**: 确保常用查询字段有索引
2. **避免 SELECT ***: 只查询需要的列
3. **使用 TOP 限制结果**:
   ```sql
   SELECT TOP 100 * FROM LargeTable
   ```
4. **使用分页**:
   ```sql
   SELECT * FROM Orders
   ORDER BY OrderDate
   OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY
   ```

### 连接池配置

本工具默认连接池配置：
- 最大连接数: 10
- 最小连接数: 0
- 空闲超时: 30秒

这些配置适合大多数场景，无需手动调整。

## 支持的 SQL Server 特性

### 数据类型

完整支持所有 SQL Server 数据类型：
- 数值类型: INT, BIGINT, DECIMAL, NUMERIC, FLOAT, REAL
- 字符类型: CHAR, VARCHAR, NCHAR, NVARCHAR, TEXT, NTEXT
- 日期时间: DATE, TIME, DATETIME, DATETIME2, DATETIMEOFFSET
- 二进制: BINARY, VARBINARY, IMAGE
- 其他: BIT, UNIQUEIDENTIFIER, XML, JSON

### 系统视图

支持查询所有系统视图：
- INFORMATION_SCHEMA.*
- sys.tables
- sys.columns
- sys.indexes
- sys.databases
- 等等

### T-SQL 功能

支持大部分 T-SQL 功能：
- 聚合函数: SUM, COUNT, AVG, MIN, MAX
- 窗口函数: ROW_NUMBER, RANK, DENSE_RANK
- 字符串函数: CONCAT, SUBSTRING, REPLACE, LEN
- 日期函数: GETDATE, DATEADD, DATEDIFF, FORMAT
- 条件函数: CASE, IIF, COALESCE

## 更多帮助

- 查看 [README.md](../README.md) 了解项目概述
- 查看 [EXAMPLES.md](../EXAMPLES.md) 了解更多使用示例
- 查看 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何贡献
- 提交 Issue: https://github.com/Anarkh-Lee/universal-db-mcp/issues

## 相关资源

- [SQL Server 官方文档](https://docs.microsoft.com/sql/sql-server/)
- [Azure SQL Database 文档](https://docs.microsoft.com/azure/azure-sql/)
- [T-SQL 参考](https://docs.microsoft.com/sql/t-sql/)
- [mssql npm 包](https://www.npmjs.com/package/mssql)
