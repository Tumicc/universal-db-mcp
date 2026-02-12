# 故障排查指南

本文档介绍 Universal DB MCP 常见问题的排查方法。

## 连接问题

### 无法连接数据库

**症状**：启动时报错 "数据库连接失败"

**排查步骤**：

1. **检查数据库服务是否运行**
   ```bash
   # MySQL
   systemctl status mysql

   # PostgreSQL
   systemctl status postgresql

   # Redis
   systemctl status redis
   ```

2. **验证网络连接**
   ```bash
   # 测试端口连通性
   telnet localhost 3306
   nc -zv localhost 3306
   ```

3. **检查防火墙**
   ```bash
   # UFW
   sudo ufw status

   # iptables
   sudo iptables -L
   ```

4. **验证用户名和密码**
   ```bash
   # MySQL
   mysql -h localhost -u root -p

   # PostgreSQL
   psql -h localhost -U postgres
   ```

### 连接超时

**症状**：连接长时间无响应

**可能原因**：
- 网络延迟
- 数据库负载过高
- 防火墙阻断

**解决方案**：
1. 检查网络延迟：`ping database-host`
2. 检查数据库负载
3. 增加连接超时时间

### 权限不足

**症状**：报错 "Access denied" 或 "permission denied"

**解决方案**：

```sql
-- MySQL
GRANT SELECT ON database.* TO 'user'@'host';
FLUSH PRIVILEGES;

-- PostgreSQL
GRANT SELECT ON ALL TABLES IN SCHEMA public TO user;
```

## 查询问题

### 查询被拒绝

**症状**：报错 "操作被拒绝：当前处于只读安全模式"

**原因**：默认只读模式，拒绝写入操作

**解决方案**：
- 根据需要使用 `--permission-mode readwrite` 或 `--permission-mode full`
- 仅在开发环境使用

### 查询超时

**症状**：查询长时间无响应或超时

**可能原因**：
- 查询复杂度高
- 缺少索引
- 数据量大

**解决方案**：
1. 优化查询语句
2. 添加适当索引
3. 使用 LIMIT 限制结果集

### 结果集过大

**症状**：返回数据量过大，响应缓慢

**解决方案**：
1. 使用 LIMIT 限制返回行数
2. 只选择需要的列
3. 添加过滤条件

## HTTP API 问题

### 401 Unauthorized

**症状**：API 返回 401 错误

**原因**：API Key 无效或缺失

**解决方案**：
1. 检查请求头是否包含 `X-API-Key` 或 `Authorization: Bearer <key>`
2. 确认 API Key 正确
3. 检查 `.env` 文件中的 `API_KEYS` 配置

### 429 Too Many Requests

**症状**：API 返回 429 错误

**原因**：超过速率限制

**解决方案**：
1. 减少请求频率
2. 调整速率限制配置：
   ```bash
   RATE_LIMIT_MAX=200
   RATE_LIMIT_WINDOW=1m
   ```

### 502 Bad Gateway

**症状**：通过 Nginx 访问返回 502

**可能原因**：
- MCP 服务未运行
- 端口配置错误

**排查步骤**：
```bash
# 检查服务状态
docker ps | grep universal-db-mcp

# 检查服务日志
docker logs universal-db-mcp

# 直接测试服务
curl http://localhost:3000/api/health
```

## Docker 问题

### 容器无法启动

**排查步骤**：

```bash
# 查看容器日志
docker logs universal-db-mcp

# 检查配置
docker compose config

# 检查环境变量
cat .env
```

### 无法连接宿主机数据库

**解决方案**：

使用 `host.docker.internal` 作为主机名：

```bash
docker run -e DB_HOST=host.docker.internal ...
```

### 构建失败

**解决方案**：

```bash
# 清理缓存重新构建
docker system prune -a
docker compose build --no-cache
```

## MCP 模式问题

### Claude Desktop 无法连接

**排查步骤**：

1. **检查配置文件格式**
   - 确保 JSON 语法正确
   - 使用 JSON 验证工具检查

2. **重启 Claude Desktop**

3. **查看日志**
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`

4. **手动测试命令**
   ```bash
   npx universal-db-mcp --type mysql --host localhost --port 3306 --user root --password xxx --database test
   ```

### 工具未显示

**可能原因**：
- 配置文件路径错误
- 配置格式错误
- 服务启动失败

**解决方案**：
1. 确认配置文件位置正确
2. 检查 JSON 格式
3. 查看启动日志

## 性能问题

### Schema 获取缓慢

**原因**：表数量多，首次获取需要查询所有表

**解决方案**：
1. 使用 Schema 缓存（默认启用）
2. 强制刷新时使用 `forceRefresh` 参数

### 内存占用过高

**解决方案**：

1. 限制容器内存：
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
   ```

2. 使用 PM2 限制：
   ```javascript
   max_memory_restart: '500M'
   ```

## 日志查看

### Docker 部署

```bash
# 实时日志
docker compose logs -f

# 最近 100 行
docker compose logs --tail 100
```

### PM2 部署

```bash
# 实时日志
pm2 logs universal-db-mcp

# 日志文件
cat /var/log/universal-db-mcp/out.log
```

### systemd 部署

```bash
# 实时日志
sudo journalctl -u universal-db-mcp -f

# 最近 1 小时
sudo journalctl -u universal-db-mcp --since "1 hour ago"
```

## 获取帮助

如果以上方法无法解决问题：

1. **查看文档**：[docs/](../)
2. **提交 Issue**：https://github.com/yourusername/universal-db-mcp/issues
3. **提供信息**：
   - 错误信息
   - 配置文件（隐藏敏感信息）
   - 环境信息（操作系统、Node.js 版本、数据库版本）
   - 复现步骤
