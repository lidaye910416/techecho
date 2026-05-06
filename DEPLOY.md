# TechEcho Pro 部署指南

## 环境要求

- Python 3.10+
- Node.js 18+
- SQLite3

## 1. 安装依赖

```bash
# Python 依赖
pip install fastapi uvicorn httpx feedparser python-dotenv apscheduler

# Node 依赖
npm install
```

## 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# MiniMax API (用于AI校准，可选)
MINIMAX_API_KEY=your_api_key_here
MINIMax_API_KEY=your_api_key_here
```

## 3. 数据库初始化

```bash
# 数据库会在首次运行时自动创建
# 表结构已在新版本中更新
```

## 4. 启动服务

### 开发环境

```bash
# 后端 API
PYTHONPATH=. python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload

# 前端 (另一个终端)
cd app && npm run dev:h5
```

### 生产环境

```bash
# 1. 构建前端
cd app && npm run build:h5

# 2. 启动后端
PYTHONPATH=. nohup python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8001 > uvicorn.log 2>&1 &

# 3. 使用 nginx 反向代理前端
```

## 5. 定时任务

后端服务已内置定时任务：
- **每日 08:30** 自动收集新闻
- 自动保存到数据库
- 自动生成 JSON 备份

无需额外配置 crontab。

## 6. API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/news` | GET | 获取新闻列表 |
| `/api/news/{id}` | GET | 获取新闻详情 |
| `/api/news/stats` | GET | 获取统计信息 |
| `/api/news/categories` | GET | 获取分类列表 |
| `/api/news/dates` | GET | 获取可用日期 |

### 查询参数

- `lang` - 语言筛选 (zh/en)
- `category` - 分类筛选 (ai/tools/news/product)
- `date` - 日期筛选 (YYYY-MM-DD)
- `min_quality` - 最低质量分
- `limit` - 限制数量

## 7. 目录结构

```
.
├── app/                    # 前端 (Taro)
│   ├── index.html          # 主页面 (完整HTML，可直接部署)
│   ├── data/
│   │   └── news.json       # 新闻JSON备份
│   └── src/                # 源码
├── data/
│   └── database.db         # SQLite 数据库
├── src/
│   ├── api/                # API 端点
│   ├── services/           # 业务逻辑
│   │   ├── news_collector_v2.py   # 新闻收集
│   │   ├── news_ai_calibrator.py  # AI校准
│   │   ├── news_database.py        # 数据库服务
│   │   └── scheduler_service.py    # 定时任务
│   └── config/
│       └── sources.py     # 新闻源配置
├── scripts/
│   └── collect_news.py     # 手动收集脚本
└── DEPLOY.md               # 本文档
```

## 8. 前端部署

前端 `app/index.html` 是完整的单页应用，可直接部署：

```bash
# 方式1: 使用 nginx
server {
    listen 80;
    root /path/to/project/app;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://localhost:8001;
    }
}

# 方式2: 使用 Python 简单服务器
cd app && python3 -m http.server 8080
```

## 9. 手动收集新闻

```bash
# 收集所有新闻
PYTHONPATH=. python3 scripts/collect_news.py

# 指定参数
PYTHONPATH=. python3 scripts/collect_news.py --min-quality 60 --limit 20
```

## 10. 常见问题

### Q: 前端显示空白
A: 检查 API 地址配置 `app/src/api/index.ts`，确保 `BASE_URL` 指向正确的后端地址

### Q: 新闻未收集到数据库
A: 检查 `src/services/scheduler_service.py` 是否正常启动，查看日志输出

### Q: AI 校准失败
A: 确保配置了 `MINIMAX_API_KEY`，或者系统会自动降级到规则截断模式
