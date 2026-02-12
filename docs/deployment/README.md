# 部署指南

本目录包含 Universal DB MCP 的各种部署方式文档。

## 部署方式概览

| 部署方式 | 适用场景 | 复杂度 | 推荐指数 |
|----------|----------|--------|----------|
| [本地部署](./local.md) | 开发测试、个人使用 | 低 | ⭐⭐⭐⭐⭐ |
| [Docker 部署](./docker.md) | 生产环境、团队使用 | 中 | ⭐⭐⭐⭐⭐ |
| [云服务部署](./cloud/) | 企业级、高可用 | 高 | ⭐⭐⭐⭐ |

## 选择建议

### 开发测试

推荐使用**本地部署**：
- 快速启动
- 方便调试
- 无需额外配置

### 生产环境

推荐使用 **Docker 部署**：
- 环境隔离
- 易于管理
- 支持自动重启

### 企业级部署

推荐使用**云服务部署**：
- 高可用
- 弹性扩展
- 专业运维

## 部署文档

### 基础部署

- [本地部署](./local.md) - Node.js、PM2、systemd
- [Docker 部署](./docker.md) - Dockerfile、Docker Compose
- [HTTPS 配置](./https-domain.md) - 域名和 SSL 证书

### 云服务部署

- [华为云部署](./cloud/huaweicloud.md) - Flexus 服务器
- [阿里云部署](./cloud/aliyun.md) - 函数计算 FC
- [腾讯云部署](./cloud/tencent.md) - 云函数 SCF
- [AWS 部署](./cloud/aws.md) - Lambda

### HTTP API 部署

HTTP API 模式的详细部署文档请参考：

- [HTTP API 部署指南](../http-api/DEPLOYMENT.md)
- [HTTP API 部署指南（中文）](../http-api/DEPLOYMENT.zh-CN.md)

## 快速开始

### 最简单的方式

```bash
# 安装
npm install -g universal-db-mcp

# 启动 MCP 模式
universal-db-mcp --type mysql --host localhost --port 3306 --user root --password xxx --database mydb

# 启动 HTTP API 模式
MODE=http HTTP_PORT=3000 API_KEYS=your-key universal-db-mcp
```

### Docker 方式

```bash
# 使用 Docker Compose
cd docker
docker-compose up -d

# 或直接运行
docker run -p 3000:3000 \
  -e MODE=http \
  -e API_KEYS=your-key \
  universal-db-mcp
```

## 安全建议

无论选择哪种部署方式，请确保：

1. **使用只读模式** - 生产环境使用默认的 `safe` 模式，或根据需要使用 `readwrite` 模式
2. **配置 API Key** - HTTP API 模式必须配置强密钥
3. **网络隔离** - 数据库不要直接暴露到公网
4. **定期更新** - 及时更新到最新版本

详细安全配置请参考 [安全指南](../guides/security.md)。
