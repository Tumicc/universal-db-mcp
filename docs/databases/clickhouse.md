# ClickHouse 数据库使用指南

## 📖 关于 ClickHouse

ClickHouse 是由俄罗斯 Yandex 公司开发的开源列式数据库管理系统（DBMS），专为在线分析处理（OLAP）场景设计。它能够使用 SQL 查询实时生成分析数据报告。

### 主要特点

- **列式存储**：数据按列存储，压缩率高，查询速度快
- **向量化执行**：利用 SIMD 指令加速查询
- **分布式查询**：支持分布式表和分布式查询
- **高性能**：每秒可处理数亿到数十亿行数据
- **实时插入**：支持高并发实时数据插入
- **SQL 支持**：支持标准 SQL 语法（有部分扩展）

## 🚀 快速开始

### 1. 安装 ClickHouse

#### 使用 Docker（推荐）

```bash
# 拉取 ClickHouse 镜像
docker pull clickhouse/clickhouse-server

# 启动 ClickHouse 容器
docker run -d --name clickhouse-server \
  -p 8123:8123 \
  -p 9000:9000 \
  --ulimit nofile=262144:262144 \
  clickhouse/clickhouse-server
```

#### 在 Linux 上安装

```bash
# Ubuntu/Debian
sudo apt-get install -y apt-transport-https ca-certificates dirmngr
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754
echo "deb https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client

# 启动服务
sudo service clickhouse-server start
```

#### 在 macOS 上安装

```bash
# 使用 Homebrew
brew install clickhouse

# 启动服务
clickhouse server
```

### 2. 配置 Claude Desktop

编辑 Claude Desktop 配置文件：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### 基础配置（只读模式）

```json
{
  "mcpServers": {
    "clickhouse-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "clickhouse",
        "--host", "localhost",
        "--port", "8123",
        "--user", "default",
        "--password", "",
        "--database", "default"
      ]
    }
  }
}
```

#### 启用写入模式（开发环境）

```json
{
  "mcpServers": {
    "clickhouse-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--permission-mode", "full",
        "--type", "clickhouse",
        "--host", "localhost",
        "--port", "8123",
        "--user", "default",
        "--password", "",
        "--database", "default"
      ]
    }
  }
}
```

#### 连接 ClickHouse Cloud

```json
{
  "mcpServers": {
    "clickhouse-cloud": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "clickhouse",
        "--host", "your-instance.clickhouse.cloud",
        "--port", "8443",
        "--user", "default",
        "--password", "your_password",
        "--database", "default"
      ]
    }
  }
}
```

### 3. 重启 Claude Desktop

配置完成后，重启 Claude Desktop 使配置生效。

## 💡 使用示例

### 查询数据库结构

```
你：帮我查看 ClickHouse 数据库的所有表
```

Claude 会自动调用 `get_schema` 工具获取数据库结构。

### 查询数据

```
你：查询 events 表中的所有数据
```

Claude 会生成并执行：
```sql
SELECT * FROM events LIMIT 100;
```

### 聚合查询

```
你：统计每个用户的事件数量
```

Claude 会生成并执行：
```sql
SELECT user_id, COUNT(*) as event_count
FROM events
GROUP BY user_id
ORDER BY event_count DESC;
```

### 时序数据分析

```
你：分析最近 7 天每天的事件数量趋势
```

Claude 会生成并执行：
```sql
SELECT
    toDate(timestamp) as date,
    COUNT(*) as event_count
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date;
```

### 复杂分析查询

```
你：找出最近 30 天内活跃度最高的 10 个用户，并统计他们的行为分布
```

Claude 会生成并执行：
```sql
SELECT
    user_id,
    COUNT(*) as total_events,
    countIf(event_type = 'click') as clicks,
    countIf(event_type = 'view') as views,
    countIf(event_type = 'purchase') as purchases
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
GROUP BY user_id
ORDER BY total_events DESC
LIMIT 10;
```

## 🔧 ClickHouse 特性支持

### 1. 表引擎

ClickHouse 支持多种表引擎，最常用的是 MergeTree 系列：

```sql
-- MergeTree 引擎（最常用）
CREATE TABLE events (
    timestamp DateTime,
    user_id UInt64,
    event_type String,
    value Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, timestamp);

-- ReplacingMergeTree（去重）
CREATE TABLE user_profiles (
    user_id UInt64,
    name String,
    email String,
    updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;

-- SummingMergeTree（自动求和）
CREATE TABLE metrics (
    date Date,
    metric_name String,
    value Float64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, metric_name);
```

### 2. 分区表

ClickHouse 支持按时间或其他维度分区：

```sql
CREATE TABLE logs (
    timestamp DateTime,
    level String,
    message String
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)  -- 按天分区
ORDER BY timestamp;
```

### 3. 物化视图

物化视图可以预计算聚合结果，加速查询：

```sql
-- 创建物化视图
CREATE MATERIALIZED VIEW daily_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, user_id)
AS SELECT
    toDate(timestamp) as date,
    user_id,
    COUNT(*) as event_count
FROM events
GROUP BY date, user_id;

-- 查询物化视图
SELECT * FROM daily_stats WHERE date = today();
```

### 4. 数组和嵌套类型

ClickHouse 支持数组和嵌套数据类型：

```sql
CREATE TABLE user_events (
    user_id UInt64,
    event_types Array(String),
    event_times Array(DateTime),
    metadata Nested(
        key String,
        value String
    )
) ENGINE = MergeTree()
ORDER BY user_id;

-- 查询数组
SELECT
    user_id,
    arrayJoin(event_types) as event_type
FROM user_events;
```

### 5. 近似计算

ClickHouse 支持近似算法加速聚合查询：

```sql
-- 近似去重计数
SELECT uniq(user_id) FROM events;  -- 精确
SELECT uniqHLL12(user_id) FROM events;  -- 近似，更快

-- 近似分位数
SELECT quantile(0.95)(response_time) FROM requests;  -- 精确
SELECT quantileTDigest(0.95)(response_time) FROM requests;  -- 近似
```

## 📊 性能优化建议

### 1. 选择合适的排序键

```sql
-- 好的排序键设计
CREATE TABLE events (
    timestamp DateTime,
    user_id UInt64,
    event_type String
) ENGINE = MergeTree()
ORDER BY (user_id, timestamp);  -- 常用查询条件

-- 避免
ORDER BY timestamp;  -- 如果经常按 user_id 查询
```

### 2. 使用 PREWHERE 过滤

```sql
-- 使用 PREWHERE（更快）
SELECT * FROM events
PREWHERE timestamp >= today()
WHERE event_type = 'click';

-- 而不是只用 WHERE
SELECT * FROM events
WHERE timestamp >= today() AND event_type = 'click';
```

### 3. 合理使用分区

```sql
-- 按月分区（推荐）
PARTITION BY toYYYYMM(timestamp)

-- 按天分区（数据量大时）
PARTITION BY toYYYYMMDD(timestamp)

-- 避免过度分区
PARTITION BY toHour(timestamp)  -- 通常不推荐
```

### 4. 选择合适的数据类型

```sql
-- 使用更小的数据类型
user_id UInt32  -- 而不是 UInt64（如果范围足够）
status UInt8    -- 而不是 String（如果是枚举值）

-- 使用 LowCardinality
event_type LowCardinality(String)  -- 对于重复值多的列
```

### 5. 批量插入

```sql
-- 批量插入（推荐）
INSERT INTO events VALUES
    (now(), 1, 'click'),
    (now(), 2, 'view'),
    (now(), 3, 'purchase');

-- 避免单条插入
INSERT INTO events VALUES (now(), 1, 'click');
INSERT INTO events VALUES (now(), 2, 'view');
```

## 🔒 安全建议

### 1. 使用只读模式

默认情况下，MCP 连接器运行在只读模式：

```json
{
  "args": [
    "universal-db-mcp",
    "--type", "clickhouse",
    "--host", "localhost",
    "--port", "8123",
    "--user", "readonly_user",
    "--password", "password",
    "--database", "production"
  ]
}
```

### 2. 创建只读用户

```sql
-- 创建只读用户
CREATE USER readonly_user IDENTIFIED BY 'password';

-- 授予只读权限
GRANT SELECT ON database_name.* TO readonly_user;
```

### 3. 使用 HTTPS

ClickHouse 支持 HTTPS 连接，保护数据传输安全：

```json
{
  "args": [
    "--type", "clickhouse",
    "--host", "your-instance.clickhouse.cloud",
    "--port", "8443"
  ]
}
```

### 4. 限制网络访问

- 使用防火墙限制 ClickHouse 端口访问
- 仅允许可信 IP 地址连接
- 在生产环境中使用 VPN 或专线

## 🐛 常见问题

### 1. 连接失败

**问题**：无法连接到 ClickHouse 数据库

**解决方案**：
- 检查 ClickHouse 服务是否正在运行
- 检查端口是否正确（HTTP: 8123, TCP: 9000）
- 检查防火墙设置
- 验证用户名和密码

### 2. 查询超时

**问题**：大查询执行超时

**解决方案**：
- 增加超时时间：`SET max_execution_time = 600`
- 优化查询，使用 PREWHERE
- 添加合适的索引
- 使用 LIMIT 限制返回结果

### 3. 内存不足

**问题**：查询时内存不足

**解决方案**：
- 增加内存限制：`SET max_memory_usage = 10000000000`
- 优化查询，减少内存使用
- 使用流式查询
- 分批处理数据

### 4. 插入性能问题

**问题**：数据插入速度慢

**解决方案**：
- 使用批量插入
- 增加 `max_insert_block_size`
- 使用异步插入
- 优化表引擎和分区策略

## 📚 参考资源

- [ClickHouse 官方文档](https://clickhouse.com/docs/zh/)
- [ClickHouse 快速开始](https://clickhouse.com/docs/zh/getting-started/quick-start)
- [ClickHouse Cloud](https://clickhouse.cloud/)
- [ClickHouse GitHub](https://github.com/ClickHouse/ClickHouse)
- [ClickHouse 中文社区](https://clickhouse.com/docs/zh/community)

## 🆚 ClickHouse vs 传统数据库

| 特性 | ClickHouse | MySQL | PostgreSQL |
|------|-----------|-------|------------|
| 存储方式 | 列式存储 | 行式存储 | 行式存储 |
| OLAP 性能 | ✅ 极快 | ❌ 慢 | ⚠️ 一般 |
| OLTP 性能 | ❌ 不适合 | ✅ 快 | ✅ 快 |
| 压缩率 | ✅ 高（10-100x） | ⚠️ 一般 | ⚠️ 一般 |
| 实时插入 | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| 事务支持 | ❌ 有限 | ✅ 完整 | ✅ 完整 |
| 更新/删除 | ⚠️ 异步 | ✅ 实时 | ✅ 实时 |
| 分布式 | ✅ 原生支持 | ⚠️ 需要分库分表 | ⚠️ 需要扩展 |

## 💡 最佳实践

### 1. 表设计

- 使用 MergeTree 系列引擎
- 合理设计排序键（ORDER BY）
- 按时间分区（PARTITION BY）
- 选择合适的数据类型

### 2. 查询优化

- 使用 PREWHERE 过滤数据
- 避免 SELECT *
- 使用物化视图预计算
- 合理使用近似算法

### 3. 数据插入

- 批量插入数据
- 使用异步插入
- 避免频繁的小批量插入
- 合理设置 buffer 大小

### 4. 监控和维护

- 监控查询性能
- 定期优化表（OPTIMIZE TABLE）
- 清理过期分区
- 监控磁盘空间使用

### 5. 适用场景

**适合**：
- 大数据分析
- 实时报表
- 日志分析
- 时序数据分析
- 用户行为分析

**不适合**：
- 高频更新/删除
- 事务处理（OLTP）
- 小数据量场景
- 需要强一致性的场景

---

**提示**：ClickHouse 是专为 OLAP 场景设计的数据库，在大数据分析场景下性能卓越，但不适合 OLTP 场景。选择数据库时请根据实际需求决定。
