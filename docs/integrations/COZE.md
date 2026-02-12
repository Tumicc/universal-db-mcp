# Coze Integration Guide

This guide shows how to integrate Universal Database MCP Server with Coze platform.

## Overview

Coze is an AI bot development platform. By integrating Universal Database MCP Server, you can enable your Coze bots to query and analyze database data.

## Prerequisites

- Universal Database MCP Server deployed with HTTP API mode
- Coze account
- Database instance (MySQL, PostgreSQL, etc.)

## Setup Steps

### Step 1: Deploy HTTP API Server

Deploy Universal Database MCP Server in HTTP API mode:

```bash
# Using Docker
docker run -d \
  --name universal-db-mcp \
  -p 3000:3000 \
  -e MODE=http \
  -e HTTP_PORT=3000 \
  -e API_KEYS=coze-secret-key \
  -e CORS_ORIGINS=* \
  universal-db-mcp:latest
```

Or deploy to cloud platform (Railway, Render, Fly.io). See [Deployment Guide](../http-api/DEPLOYMENT.md).

### Step 2: Get API Endpoint

Note your API endpoint URL:
- Local: `http://localhost:3000`
- Cloud: `https://your-app.railway.app` (example)

### Step 3: Create Coze Bot

1. Login to [Coze](https://www.coze.com/)
2. Click "Create Bot"
3. Enter bot name and description
4. Click "Create"

### Step 4: Add API Plugin

1. In bot editor, click "Plugins" tab
2. Click "Add Plugin"
3. Select "API Plugin"
4. Configure API:

**Basic Information**:
- Name: `Database Query`
- Description: `Query database using natural language`

**Authentication**:
- Type: `API Key`
- Header Name: `X-API-Key`
- API Key: `coze-secret-key` (your API key)

### Step 5: Configure API Endpoints

#### Endpoint 1: Connect to Database

**Name**: `connect_database`
**Method**: `POST`
**URL**: `https://your-api-url/api/connect`
**Description**: Connect to a database

**Request Body**:
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

**Parameters**:
- `database_type` (string, required): Database type (mysql, postgres, etc.)
- `host` (string, required): Database host
- `port` (number, required): Database port
- `user` (string, required): Username
- `password` (string, required): Password
- `database` (string, required): Database name
- `permission_mode` (string, optional): Permission mode: `safe` (default, read-only), `readwrite` (read/write no delete), `full` (full control)
- `permissions` (array, optional): Custom permissions: `["read", "insert", "update", "delete", "ddl"]`

> ⚠️ **Note**: REST API uses camelCase (`permissionMode`), not hyphenated names.

**Response Example**:
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

#### Endpoint 2: Execute Query

**Name**: `execute_query`
**Method**: `POST`
**URL**: `https://your-api-url/api/query`
**Description**: Execute SQL query

**Request Body**:
```json
{
  "sessionId": "{{session_id}}",
  "query": "{{sql_query}}"
}
```

**Parameters**:
- `session_id` (string, required): Session ID from connect_database
- `sql_query` (string, required): SQL query to execute

**Response Example**:
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

#### Endpoint 3: List Tables

**Name**: `list_tables`
**Method**: `GET`
**URL**: `https://your-api-url/api/tables?sessionId={{session_id}}`
**Description**: List all tables in database

**Parameters**:
- `session_id` (string, required): Session ID from connect_database

**Response Example**:
```json
{
  "success": true,
  "data": {
    "tables": ["users", "orders", "products"]
  }
}
```

#### Endpoint 4: Get Table Schema

**Name**: `get_table_schema`
**Method**: `GET`
**URL**: `https://your-api-url/api/schema/{{table_name}}?sessionId={{session_id}}`
**Description**: Get table structure

**Parameters**:
- `table_name` (string, required): Table name
- `session_id` (string, required): Session ID from connect_database

**Response Example**:
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

### Step 6: Create Bot Skills

Create skills that use the API plugin:

#### Skill 1: Database Connection

**Skill Name**: `Connect to Database`
**Description**: Connect to a database

**Prompt**:
```
When user asks to connect to a database, use the connect_database API.

Ask user for:
- Database type (mysql, postgres, etc.)
- Host
- Port
- Username
- Password
- Database name

After connecting, save the sessionId for future queries.
```

#### Skill 2: Query Data

**Skill Name**: `Query Database`
**Description**: Query database using natural language

**Prompt**:
```
When user asks a question about data:

1. If not connected, ask user to connect first
2. Use list_tables to see available tables
3. Use get_table_schema to understand table structure
4. Generate appropriate SQL query based on user's question
5. Use execute_query to run the query
6. Format and present results to user in a readable way

Example:
User: "Show me all users"
Bot:
- Lists tables to find "users" table
- Gets schema of "users" table
- Generates SQL: "SELECT * FROM users LIMIT 10"
- Executes query
- Presents results in a table format
```

### Step 7: Test Bot

Test your bot with sample queries:

**Example 1: Connect**
```
User: Connect to my MySQL database at localhost:3306, user root, password xxx, database testdb
Bot: [Calls connect_database API]
Bot: Successfully connected! Session ID: abc123
```

**Example 2: Query**
```
User: Show me all users
Bot: [Calls list_tables API]
Bot: [Calls get_table_schema API for "users" table]
Bot: [Generates SQL: SELECT * FROM users LIMIT 10]
Bot: [Calls execute_query API]
Bot: Here are the users:
     1. Alice (alice@example.com)
     2. Bob (bob@example.com)
     ...
```

**Example 3: Complex Query**
```
User: How many orders were placed last month?
Bot: [Analyzes tables and schema]
Bot: [Generates SQL: SELECT COUNT(*) FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)]
Bot: [Executes query]
Bot: There were 1,234 orders placed last month.
```

## Advanced Features

### Session Management

Store session ID in bot memory:

```javascript
// In bot skill
const sessionId = await connectDatabase(params);
bot.memory.set('db_session_id', sessionId);

// Later use
const sessionId = bot.memory.get('db_session_id');
await executeQuery(sessionId, query);
```

### Error Handling

Handle API errors gracefully:

```javascript
try {
  const result = await executeQuery(sessionId, query);
  return formatResults(result);
} catch (error) {
  if (error.code === 'SESSION_EXPIRED') {
    return "Session expired. Please reconnect to database.";
  }
  return `Error: ${error.message}`;
}
```

### Query Optimization

Implement query optimization:

```javascript
// Add LIMIT to prevent large result sets
if (!query.includes('LIMIT')) {
  query += ' LIMIT 100';
}

// Validate query before execution
if (isWriteOperation(query) && !allowWrite) {
  return "Write operations are not allowed in read-only mode.";
}
```

## Security Best Practices

### 1. Secure API Keys

- Use strong, random API keys
- Rotate keys regularly
- Store keys securely in Coze secrets

### 2. Database Credentials

- Never expose database credentials in bot responses
- Use read-only database users when possible
- Implement connection pooling

### 3. Query Validation

- Validate SQL queries before execution
- Prevent SQL injection
- Limit query complexity

### 4. Rate Limiting

- Configure appropriate rate limits
- Monitor API usage
- Implement exponential backoff

## Example Use Cases

### Use Case 1: Customer Support Bot

Bot helps support agents query customer data:

```
User: Find customer with email alice@example.com
Bot: [Queries database]
Bot: Found customer:
     - ID: 123
     - Name: Alice Smith
     - Email: alice@example.com
     - Status: Active
     - Last Order: 2026-01-20
```

### Use Case 2: Analytics Bot

Bot provides business insights:

```
User: What's our revenue this month?
Bot: [Queries orders table]
Bot: Revenue this month: $125,430
     - Total orders: 1,234
     - Average order value: $101.65
     - Top product: Widget Pro
```

### Use Case 3: Data Export Bot

Bot exports data in various formats:

```
User: Export all active users to CSV
Bot: [Queries database]
Bot: Exported 5,432 active users
     [Provides download link]
```

## Troubleshooting

### Issue: Connection Failed

**Symptoms**: Bot cannot connect to database

**Solutions**:
1. Check database is running
2. Verify credentials
3. Check network connectivity
4. Ensure API server is accessible from Coze

### Issue: Query Timeout

**Symptoms**: Queries take too long

**Solutions**:
1. Add indexes to database tables
2. Optimize SQL queries
3. Increase timeout in API configuration
4. Use pagination for large result sets

### Issue: Session Expired

**Symptoms**: "Session expired" error

**Solutions**:
1. Reconnect to database
2. Increase session timeout
3. Implement auto-reconnect logic

## Resources

- [Coze Documentation](https://www.coze.com/docs)
- [API Reference](../http-api/API_REFERENCE.md)
- [Deployment Guide](../http-api/DEPLOYMENT.md)

## Support

For integration issues:
- GitHub Issues: https://github.com/Anarkh-Lee/universal-db-mcp/issues
- Coze Community: https://www.coze.com/community
