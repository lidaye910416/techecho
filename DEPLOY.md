# Tech Echo - 部署指南

## 快速开始（推荐）

### 一键部署脚本（自动完成所有配置）

```bash
# 1. 上传代码到服务器
scp -r . root@你的服务器:/opt/techecho/

# 2. SSH 登录并执行部署脚本
ssh root@你的服务器IP
cd /opt/techecho
chmod +x scripts/setup_server.sh
sudo ./scripts/setup_server.sh --domain=你的域名.com
```

> 脚本会自动安装依赖、配置 Nginx、申请 SSL、设置开机自启

---

## 手动部署

### 1. 服务器环境要求

- Ubuntu 20.04+ / CentOS 8+
- Python 3.10+
- Nginx
- 域名（需要备案） + SSL 证书

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env  # 填入 MINIMAX_API_KEY 等
```

### 4. 创建目录

```bash
mkdir -p logs data/audio
```

### 5. 启动服务

```bash
# API 服务 (端口 8001)
nohup uvicorn src.main:app --host 0.0.0.0 --port 8001 > logs/api.log 2>&1 &

# 或使用 systemd (见 scripts/setup_server.sh)
```

### 6. 配置 Nginx + HTTPS

```bash
# 申请 SSL
certbot --nginx -d your-domain.com

# 或手动配置 Nginx (见 DEPLOY_WECHAT.md)
```

### 7. 定时任务

```bash
# 每天 8:30 自动收集新闻
crontab -e
30 8 * * * cd /opt/techecho && python3 scripts/collect_news.py >> logs/collect.log 2>&1
```

---

## 部署文件说明

| 文件 | 说明 |
|------|------|
| `requirements.txt` | Python 依赖 |
| `scripts/setup_server.sh` | **一键部署脚本** |
| `scripts/deploy_server.sh` | 服务器基础配置脚本 |
| `scripts/collect_news.py` | 新闻收集脚本 |
| `scripts/daily_workflow.sh` | 每日工作流脚本 |
| `DEPLOY_WECHAT.md` | 微信小程序完整部署指南 |
| `.env.example` | 环境变量模板 |

---

## 常见问题

### MiniMax API 配额用尽

- 预生成 TTS 会失败，但不影响新闻收集
- 前端点击朗读时会发起新请求

### 数据库锁定

- SQLite 不支持并发写入
- 确保只有一个新闻收集任务在运行

### 服务无法启动

```bash
# 查看日志
journalctl -u techecho -n 50
# 或
cat logs/api_error.log
```
