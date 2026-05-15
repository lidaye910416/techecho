# Tech Echo - 微信小程序部署指南

> 使用一键部署脚本，最快 10 分钟完成部署 🚀

---

## 推荐方式：一键部署（10分钟搞定）

### 第一步：上传代码到服务器

```bash
# Mac/Linux 打开终端
scp -r . root@你的服务器IP:/opt/techecho/
```

### 第二步：执行一键部署

```bash
# SSH 登录服务器
ssh root@你的服务器IP

# 进入项目目录
cd /opt/techecho

# 执行一键部署（带上你的域名）
chmod +x scripts/setup_server.sh
sudo ./scripts/setup_server.sh --domain=你的域名.com
```

脚本会自动完成：
- ✅ 安装系统依赖 (Nginx, Python, Git)
- ✅ 安装 Python 依赖
- ✅ 配置 Systemd 服务 (开机自启)
- ✅ 配置 Nginx 反向代理
- ✅ 申请 SSL 证书
- ✅ 配置定时任务 (每天 8:30 收集新闻)
- ✅ 启动服务

### 第三步：编辑配置文件

```bash
nano /opt/techecho/.env
```

填入你的密钥：
```bash
MINIMAX_API_KEY=你的MiniMax密钥
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序Secret
```

### 第四步：验证部署

```bash
# 测试新闻收集
python3 scripts/collect_news.py --limit 3

# 检查 API 是否正常运行
curl https://你的域名.com/health
```

---

## 详细步骤（如果一键部署失败）

### 1. 购买云服务器

| 推荐配置 | 说明 |
|---------|------|
| **机型** | 2核2G 以上 |
| **系统** | Ubuntu 20.04 LTS |
| **带宽** | 5Mbps 以上 |
| **推荐商家** | 阿里云/腾讯云/华为云 |

### 2. 连接服务器

```bash
ssh root@你的服务器IP
```

### 3. 安装依赖

```bash
apt update && apt upgrade -y
apt install -y curl wget git nginx certbot python3-pip
```

### 4. 安装 Python 依赖

```bash
cd /opt/techecho
pip install -r requirements.txt
```

### 5. 配置环境变量

```bash
cp .env.example .env
nano .env
```

### 6. 配置 Nginx

```bash
nano /etc/nginx/sites-available/techecho
```

写入：
```nginx
server {
    listen 80;
    server_name 你的域名.com;
    
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/techecho /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

### 7. 申请 SSL

```bash
certbot --nginx -d 你的域名.com
```

### 8. 启动服务

```bash
systemctl enable nginx
systemctl restart nginx

# 启动 API
nohup uvicorn src.main:app --host 127.0.0.1 --port 8001 &
```

---

## 微信小程序配置

### 1. 配置服务器域名

登录 [微信公众平台](https://mp.weixin.qq.com/)：

1. 开发 → 开发管理 → 开发设置
2. 服务器域名 → 添加：
   - `request 合法域名`: `https://你的域名.com`
   - `wsrequest 合法域名`: `wss://你的域名.com`

### 2. 修改小程序 API 地址

编辑 `app/src/api/index.ts`：

```typescript
const BASE_URL = 'https://你的域名.com'
```

### 3. 编译上传

```bash
cd app
yarn taro build --type weapp
```

在微信开发者工具导入 `app/dist` 目录，上传审核。

---

## 定时任务

```bash
crontab -e

# 添加：
30 8 * * * cd /opt/techecho && python3 scripts/collect_news.py >> logs/collect.log 2>&1
```

---

## 快速检查清单

```bash
# 1. Python 版本
python3 --version  # ✓ Python 3.10+

# 2. 依赖安装
pip3 list | grep fastapi  # ✓ fastapi 已安装

# 3. Nginx 运行
nginx -t  # ✓ syntax is ok

# 4. API 服务运行
curl localhost:8001/health  # ✓ {"status": "healthy"}

# 5. HTTPS 可用
curl https://你的域名.com/health

# 6. 新闻收集
python3 scripts/collect_news.py --limit 3

# 7. 定时任务
crontab -l | grep collect_news
```

---

## 目录结构

```
/opt/techecho/
├── src/                    # 后端代码
├── scripts/
│   ├── setup_server.sh    # 一键部署脚本 ← 用这个！
│   ├── collect_news.py    # 新闻收集
│   └── daily_workflow.sh  # 每日工作流
├── app/                    # 小程序前端
├── data/                   # 数据目录
├── logs/                   # 日志目录
├── requirements.txt        # Python 依赖
├── .env                    # 环境变量
└── DEPLOY_WECHAT.md       # 本文件
```

---

## 常见问题

| 问题 | 解决 |
|------|------|
| API 返回 502 | 检查服务：`systemctl status techecho` |
| 域名无法访问 | 检查防火墙和 Nginx |
| 小程序报错"不在合法域名" | 微信公众平台添加服务器域名 |
| 新闻收集失败 | 检查 `.env` 中 `MINIMAX_API_KEY` |

### 查看日志

```bash
# API 日志
journalctl -u techecho -f

# 收集日志
tail -f /opt/techecho/logs/collect_*.log

# Nginx 日志
tail -f /var/log/nginx/error.log
```

---

## 成本估算

| 项目 | 费用 |
|------|------|
| 云服务器 (2核2G) | ¥50-100/月 |
| 域名 (.com) | ¥50-60/年 |
| SSL | 免费 |
| MiniMax API | ¥10-50/月 |
| **总计** | **¥60-150/月** |

---

**有问题？**
- 查看日志: `journalctl -u techecho -n 50`
- 重启服务: `systemctl restart techecho`
- 查看状态: `systemctl status techecho`
