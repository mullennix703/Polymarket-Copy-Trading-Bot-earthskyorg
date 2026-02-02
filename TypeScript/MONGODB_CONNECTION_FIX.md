# MongoDB连接问题解决方案

> ⚠️ **注意：此问题仅在家用PC使用代理（v2rayN/clash等）时出现**  
> 如果您在服务器或VPS上部署，或者不使用代理，通常不会遇到此问题。

---

## 📋 问题描述

**症状：** 启动应用时MongoDB连接超时
```
⚠ MongoDB disconnected. Driver will attempt to reconnect...
⚠ Database marked as unavailable - DB operations will be skipped
✗ MongoDB connection error: querySrv ETIMEOUT _mongodb._tcp.cluster0.i1z6ep2.mongodb.net
```

**原因：** 家用PC使用 **v2rayN/Clash TUN模式代理** 时，本地DNS服务器无法正确解析MongoDB的DNS SRV记录（`_mongodb._tcp.xxx.mongodb.net`）。

**影响范围：**
- ✅ **会遇到**：家用PC + v2rayN/Clash TUN模式
- ❌ **不会遇到**：
  - 服务器/VPS直连部署
  - 无代理环境
  - 使用系统代理模式（非TUN模式）

---

## ✅ 解决方案

### **修改 `.env` 文件中的MongoDB连接字符串**

**修改前（无法工作）：**
```bash
MONGO_URI='mongodb+srv://username:password@cluster0.xxx.mongodb.net/...'
```

**修改后（已修复）：**
```bash
MONGO_URI='mongodb://username:password@node1.mongodb.net:27017,node2.mongodb.net:27017,node3.mongodb.net:27017/?ssl=true&replicaSet=xxx-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0'
```

### **关键变更：**
1. ✅ `mongodb+srv://` → `mongodb://` （绕过DNS SRV查询）
2. ✅ 直接指定副本集节点地址（3个节点）
3. ✅ 显式设置副本集名称和认证参数

---

## 🔧 获取正确的连接参数

如果您需要手动构建连接字符串，使用以下命令：

### **1. 获取副本集节点地址**
```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.xxx.mongodb.net 8.8.8.8
```

**输出示例：**
```
_mongodb._tcp.cluster0.xxx.mongodb.net  SRV service location:
    priority = 0
    weight   = 0
    port     = 27017
    svr hostname = ac-ysnwxtu-shard-00-00.xxx.mongodb.net
    svr hostname = ac-ysnwxtu-shard-00-01.xxx.mongodb.net
    svr hostname = ac-ysnwxtu-shard-00-02.xxx.mongodb.net
```

### **2. 获取副本集名称**
```powershell
nslookup -type=TXT cluster0.xxx.mongodb.net 8.8.8.8
```

**输出示例：**
```
cluster0.xxx.mongodb.net  text = "authSource=admin&replicaSet=atlas-phik1z-shard-0"
```

### **3. 构建连接字符串**
```
mongodb://用户名:密码@节点1:27017,节点2:27017,节点3:27017/?ssl=true&replicaSet=副本集名称&authSource=admin&retryWrites=true&w=majority&appName=Cluster0
```

---

## 🚀 完整修复示例

**本项目的实际修复：**

```bash
# 原连接字符串（失败）
MONGO_URI='mongodb+srv://polyDB:test198404@cluster0.i1z6ep2.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority'

# 修复后的连接字符串（成功）
MONGO_URI='mongodb://polyDB:test198404@ac-ysnwxtu-shard-00-00.i1z6ep2.mongodb.net:27017,ac-ysnwxtu-shard-00-01.i1z6ep2.mongodb.net:27017,ac-ysnwxtu-shard-00-02.i1z6ep2.mongodb.net:27017/?ssl=true&replicaSet=atlas-phik1z-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0'
```

---

## ⚙️ 是否每次启动都要操作？

### ❌ **不需要！**

这是 **一次性配置修改**：
- ✅ `.env` 文件已永久保存
- ✅ 以后启动只需运行：
  ```powershell
  cd "D:\Dev\Polymarket-Copy-Trading-Bot-earthskyorg\TypeScript"
  npm run dev
  ```

### 💡 **唯一需要注意的情况**

MongoDB Atlas 更换服务器节点时（极少发生），需要重新获取节点地址并更新 `.env` 文件。

---

## 🎯 正常启动流程

修复后，每次启动应用只需：

```powershell
cd "D:\Dev\Polymarket-Copy-Trading-Bot-earthskyorg\TypeScript"
npm run dev
```

**成功标志：**
```
✓ MongoDB connected successfully
```

---

## 🔍 备选方案（不推荐）

### **方案A：在v2rayN中添加MongoDB直连规则**

1. 打开 v2rayN 主窗口
2. 菜单：**设置** → **路由设置**
3. 添加规则：
   - 出站Tag: `direct`
   - 域名: `domain:mongodb.net,domain:mongodb.com`
4. 重启v2rayN服务

**缺点：** 即使配置路由规则，TUN模式的DNS仍可能无法解析SRV记录。

### **方案B：禁用TUN模式**

将v2rayN切换为系统代理模式（HTTP/SOCKS5）而非TUN模式。

**缺点：** 影响全局代理体验。

---

## 📝 技术细节

### **为什么 `mongodb+srv://` 在代理环境下失败？**

1. `mongodb+srv://` 需要查询DNS SRV记录来获取副本集节点
2. TUN模式代理的本地DNS服务器（通常是 `172.18.0.x`）无法正确解析SRV记录
3. 查询超时导致连接失败

### **为什么 `mongodb://` 可以工作？**

1. 直接使用标准连接格式，不依赖DNS SRV查询
2. 只需要简单的A记录解析（域名→IP）
3. TUN模式的DNS可以正确处理A记录查询

---

## ✅ 验证修复成功

启动应用后，应该看到：

```
ℹ Connecting to MongoDB... (1/3)
✓ MongoDB connected successfully

╔══════════════════════════════════════════╗
║            PolyCopy Trading Bot          ║
╚══════════════════════════════════════════╝

📊 Tracking Traders: XX
💼 Your Wallet: 0x...
ℹ Overall Status: ✅ Healthy
ℹ Database: ✅ Connected
```

---

## 📞 相关问题

**Q: 部署到服务器/VPS后需要改回 `mongodb+srv://` 吗？**  
A: 不需要。`mongodb://` 格式在任何环境下都能工作，包括服务器。

**Q: 如果看到 `Server selection timed out` 错误？**  
A: 检查副本集名称（`replicaSet=xxx`）是否正确，使用 `nslookup -type=TXT` 命令获取正确名称。

**Q: 其他代理软件（Clash/ShadowsocksR）也会遇到吗？**  
A: 是的，任何使用TUN模式的代理软件都可能遇到此问题。解决方案相同。

---

**最后更新：** 2026年2月2日  
**适用版本：** PolyCopy Trading Bot V3
