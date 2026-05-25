# TechEcho

> 科技资讯 AI 播报平台 — 自动收集中英文科技新闻，AI 分析趋势，TTS 语音播报

---

## 快速开始

### 1. 后端（Docker）

```bash
# 拉取最新 zip 包，解压
unzip techecho-backend.zip -d techecho-backend
cd techecho-backend

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 MINIMAX_API_KEY

# 构建并运行
docker build -t techecho:latest .
docker run -d -p 8090:8000 --env-file .env techecho:latest
```

### 2. 后端（本地开发）

```bash
# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 MINIMAX_API_KEY

# 启动服务
python -m uvicorn src.main:app --reload --port 8000
```

### 3. 前端

```bash
# H5（浏览器直接打开）
open app/index.html

# 微信小程序
cd app && npm run dev:weapp
# 用微信开发者工具打开 app/dist/
```

---

## 部署方式

### Docker 本地部署

```bash
./scripts/test-docker.sh              # 完整测试流程
./scripts/test-docker.sh --daemon     # 测试 + 保持运行（按 Ctrl+C 清理）
./scripts/test-docker.sh --reuse     # 使用已有镜像测试
```

### 微信云托管部署

1. 打包后端：`zip -r techecho-backend.zip Dockerfile requirements.txt pyproject.toml .env.example src/ scripts/`
2. 上传到微信云托管控制台
3. 配置环境变量：`MINIMAX_API_KEY`
4. 部署容器

---

## 项目结构

```
techecho-backend.zip (可分发后端包)
├── Dockerfile              # Docker 镜像构建
├── requirements.txt        # Python 依赖
├── src/                    # 后端源码
│   ├── main.py            # FastAPI 入口
│   ├── api/               # API 路由
│   ├── services/          # 业务服务
│   └── config/           # 配置
└── scripts/              # 工具脚本

app/                       # 前端
├── index.html            # H5 SPA
├── src/                   # Taro 小程序源码
└── dist/                  # 编译产物
```

---

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `MINIMAX_API_KEY` | ✅ | MiniMax API（用于 TTS 和 AI 分析） |
| `WECHAT_APPID` | | 微信小程序 AppID |
| `WECHAT_SECRET` | | 微信小程序 Secret |

---

## API 文档

启动服务后访问：
- 本地：http://localhost:8000/docs
- 云托管：https://your-domain.sh.run.tcloudbase.com/docs