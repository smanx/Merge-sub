# Merge Subscription Worker

## 项目概述

这是一个基于 Cloudflare Workers 的订阅合并服务，用于合并多个代理订阅链接和节点，并支持 Cloudflare 优选 IP/端口替换功能。

### 主要功能

- **订阅合并**: 支持添加多个订阅链接，自动获取并合并所有节点
- **节点管理**: 支持直接添加、删除代理节点
- **优选 IP 替换**: 可配置 Cloudflare 优选 IP 和端口，自动替换符合条件的节点地址
- **Base64 解码**: 自动检测并解码 base64 编码的节点
- **Web 管理界面**: 提供简洁的 Web UI 进行订阅和节点管理
- **RESTful API**: 提供完整的 API 接口用于程序化操作
- **Basic Auth 认证**: 支持管理员账号密码保护（可选）

### 技术栈

- **运行环境**: Cloudflare Workers
- **存储**: Cloudflare KV (键值存储)
- **语言**: JavaScript (ES6+)
- **协议支持**: vmess, vless, trojan, ss, ssr, snell, juicity, hysteria, hysteria2, tuic, anytls, wireguard, socks5, http, https

## 环境变量配置

### 必需配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SUB_KV` | KV 命名空间绑定，用于存储订阅和节点数据 | - |

### 可选配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `USERNAME` | 管理员用户名 | `admin` |
| `PASSWORD` | 管理员密码 | `admin` |
| `API_URL` | 订阅转换服务地址 | `https://sublink.eooce.com` |
| `CFIP` | Cloudflare 优选 IP | - |
| `CFPORT` | Cloudflare 优选端口 | - |
| `SUB_TOKEN` | 订阅访问令牌（未设置时自动生成） | 自动生成 20 位随机字符串 |

## 数据结构

### KV 存储格式

```javascript
{
  subscriptions: string[],  // 订阅链接数组
  nodes: string             // 节点字符串（换行分隔）
}
```

## API 接口

### 公开接口（无需认证）

#### 获取订阅令牌
```
GET /get-sub-token
```
**响应**:
```json
{
  "token": "merge-sub-default-token"
}
```

#### 获取 API URL
```
GET /get-apiurl
```
**响应**:
```json
{
  "ApiUrl": "https://sublink.eooce.com"
}
```

#### 获取合并订阅
```
GET /{SUB_TOKEN}
GET /{SUB_TOKEN}?CFIP={ip}&CFPORT={port}
```
**响应**: Base64 编码的合并订阅内容（文本/plain）

### 管理接口（需要 Basic Auth）

#### 获取当前数据
```
GET /admin/data
Authorization: Basic {base64(username:password)}
```
**响应**:
```json
{
  "subscriptions": ["https://sub1.com", "https://sub2.com"],
  "nodes": ["vmess://...", "vless://..."]
}
```

#### 添加订阅
```
POST /admin/add-subscription
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "subscription": "https://sub1.com\nhttps://sub2.com"
}
```

#### 删除订阅
```
POST /admin/delete-subscription
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "subscription": "https://sub1.com"
}
```

#### 添加节点
```
POST /admin/add-node
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "node": "vmess://...\nvless://..."
}
```

#### 删除节点
```
POST /admin/delete-node
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "node": "vmess://..."
}
```

### API 路由（无需认证）

这些接口用于程序化操作，不需要 Basic Auth 认证：

#### 添加订阅
```
POST /api/add-subscriptions
Content-Type: application/json

{
  "subscription": "https://sub1.com"
}
```

#### 添加节点
```
POST /api/add-nodes
Content-Type: application/json

{
  "nodes": "vmess://...\nvless://..."
}
```

#### 删除订阅
```
DELETE /api/delete-subscriptions
Content-Type: application/json

{
  "subscription": "https://sub1.com"
}
```

#### 删除节点
```
DELETE /api/delete-nodes
Content-Type: application/json

{
  "nodes": "vmess://..."
}
```

## 优选 IP 替换规则

系统会自动替换符合以下条件的节点地址：

1. **VMess**: `net` 为 `ws` 或 `xhttp` 且 `tls` 为 `tls`，且 `host` 不等于 `add`
2. **VLESS/Trojan**: 包含 `type=ws` 或 `type=xhttp` 且包含 `security=tls`，且 `host` 不等于地址

## 部署说明

### Cloudflare Workers 部署

1. 创建 KV 命名空间
2. 在 Worker 设置中绑定 KV 命名空间为 `SUB_KV`
3. 配置环境变量（可选）
4. 部署 `_worker.js` 文件

### 订阅链接格式

部署后可获取以下格式的订阅链接：

- **默认订阅**: `https://your-worker-domain.com/{SUB_TOKEN}`
- **带优选 IP**: `https://your-worker-domain.com/{SUB_TOKEN}?CFIP=time.is&CFPORT=443`
- **Clash 订阅**: `https://sublink.eooce.com/clash?config=https://your-worker-domain.com/{SUB_TOKEN}`
- **Sing-box 订阅**: `https://sublink.eooce.com/singbox?config=https://your-worker-domain.com/{SUB_TOKEN}`

## 开发约定

### 代码风格

- 使用 ES6+ 语法
- 函数命名采用驼峰命名法（camelCase）
- 常量使用全大写命名（UPPER_SNAKE_CASE）
- 异步操作使用 async/await

### 错误处理

- 所有可能失败的异步操作都使用 try-catch 包裹
- 错误信息记录到 console.error
- API 错误返回适当的 HTTP 状态码和 JSON 错误信息

### 安全考虑

- 敏感操作（管理接口）需要 Basic Auth 认证
- 支持通过环境变量配置认证信息
- 未配置认证时跳过验证（仅用于开发环境）
- CORS 支持跨域请求

## 文件说明

### `_worker.js`

主 Worker 文件，包含所有路由处理逻辑、数据管理、订阅合并等功能。

主要模块：
- `verifyAuth()`: 验证 Basic Auth 凭证
- `loadData()`: 从 KV 加载数据
- `saveData()`: 保存数据到 KV
- `fetchSubscriptionContent()`: 获取订阅内容
- `generateMergedSubscription()`: 生成合并订阅
- `replaceAddressAndPort()`: 替换节点地址和端口