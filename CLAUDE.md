# CLAUDE.md

> **当前分支**: `feature/ai-analysis`  
> **当前版本**: v0.2.0 — TechEcho 科技资讯播报平台

---

## 产品概述

**TechEcho** — 科技资讯 AI 播报平台。自动收集中英文科技新闻，AI 分析趋势，TTS 语音播报。

| 维度 | 说明 |
|------|------|
| 目标用户 | 科技从业者、资讯追踪者 |
| 核心链路 | RSS 采集 → 质量评分 → AI 分析 → TTS 语音播报 |
| 多端支持 | **H5 SPA** (主力) → Taro 打包微信小程序 |
| 前端入口 | `app/index.html` (纯 HTML/CSS/JS，~2168 行单文件) |

---

## 分支目标 (feature/ai-analysis) ✅ 全部完成 (2026-05-09)

收藏新闻 **AI 分析 + 语音播报**：

### H5 核心功能
| Story | 内容 | 状态 |
|-------|------|:--:|
| US-001 | `POST /api/favorites/analyze` — AI 分析收藏新闻 | ✅ |
| US-002 | `POST /api/favorites/tts` — 分析文本转语音 | ✅ |
| US-003 | H5 收藏页 — AI 分析按钮 + 五区块结果展示 | ✅ |
| US-004 | H5 音频播放器 — 进度条/语速/下载/跳过 | ✅ |

### 微信小程序
| Story | 内容 | 状态 |
|-------|------|:--:|
| US-011 | Tab Bar 重新配置 — 对齐 H5「首页」+「收藏」 | ✅ |
| US-012 | 首页 — H5 逐组件对标 + 下拉刷新 + 音频生命周期 | ✅ |
| US-013 | 收藏页 — H5 对标 + ⚠️ CRITICAL BUG ×2 修复 + 进度条 | ✅ |
| US-014 | Taro 编译验证 + 端到端功能测试 | ✅ |

> 📋 原始验收标准: `ralph/prd.json`　📝 实施记录: `ralph/progress.txt`

---

## 开发准则 (Karpathy)

### 1. Think Before Coding
- 写代码前先说明假设和方案选择
- 有多种理解时，列出选项而非默认选一个
- 发现更简单方案时主动提出

### 2. Simplicity First
- 只实现需求范围内的功能，不做"将来可能"的抽象
- 能 50 行解决的不要写 200 行
- 不为单次使用的代码建抽象层

### 3. Surgical Changes
- 只改自己负责的代码，不改相邻代码的风格/格式
- 发现无关的死代码 → 提出来，不擅自删除
- 每行改动都能追溯到需求

### 4. Goal-Driven Execution
- 把任务转成可验证的验收条件
- 多步骤任务先出计划，再逐步验证
- 变更后一定验证功能是否正常

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.13+ / FastAPI / SQLite (sqlite3) |
| H5 前端 | 纯 HTML/CSS/JS 单页应用 (无框架，无构建) |
| 小程序框架 | Taro 3.6 / React 18 / TypeScript |
| AI 服务 | MiniMax API (TTS: `speech-2.8-hd`, Chat: `MiniMax-M2.7`) |
| 新闻采集 | feedparser (RSS) / httpx |
| 定时任务 | APScheduler (每日 08:30) |

---

## 项目结构

```
├── app/                          # 前端
│   ├── index.html                # ★ H5 SPA 主应用 (收藏/AI分析/播放器)
│   ├── package.json              # Taro 依赖
│   ├── src/
│   │   ├── api/index.ts          # 前端 API 客户端
│   │   ├── app.config.ts         # Taro 页面路由 (★ 缺 read/news 页注册)
│   │   ├── pages/
│   │   │   ├── index/index.tsx   # 首页 (新闻列表/统计) ✅
│   │   │   ├── news/news.tsx     # 新闻列表页 ✅
│   │   │   ├── read/read.tsx     # 新闻详情+播放器 ✅
│   │   │   └── mine/mine.tsx     # ★ 我的页面 (登录/语音/偏好设置) ✅
│   │   └── components/           # NewsCard/CategoryTabs/DatePicker
│   └── config/
│
├── src/                          # 后端
│   ├── main.py                   # FastAPI 入口 (端口 8001)
│   ├── api/
│   │   ├── routes.py             # 主路由 (/api 前缀，注册所有子路由)
│   │   ├── favorites_api.py      # ★ 收藏分析 + TTS API
│   │   ├── news_api.py           # 新闻 CRUD API
│   │   └── users.py              # (空文件)
│   ├── models/
│   │   ├── __init__.py           # 导出 NewsItem, QualityScore
│   │   └── news_bilingual.py     # ★ 双语新闻 dataclass (采集用)
│   ├── services/
│   │   ├── minimax_client.py     # ★ MiniMax TTS/Chat/Video 客户端
│   │   ├── news_collector_v2.py  # RSS 双语新闻采集器
│   │   ├── news_database.py      # ★ SQLite 新闻存储 (唯一数据库)
│   │   ├── news_ai_calibrator.py # AI 质量校准器
│   │   ├── scheduler_service.py  # 定时采集 → 写入数据库
│   │   ├── tts_service.py        # 统一 TTS 服务
│   │   └── voice_config.py       # 语音配置
│   └── config/
│       ├── __init__.py           # 全局配置 + 环境变量
│       └── sources.py            # RSS 源/分类/评分关键词
│
├── shared/                       # 前后端共享类型
│   ├── constants.ts
│   ├── models/index.ts
│   └── services/quality.ts
│
├── ralph/                        # 产品设计
│   ├── prd.json                  # ★ PRD 验收标准
│   └── progress.txt
│
├── scripts/
│   ├── collect_news.py           # 手动新闻采集
│   └── generate_icons.py
│
├── data/database.db              # 新闻数据库 (SQLite)
├── pyproject.toml
└── .env.example
```

---

## 开发命令

```bash
# === 后端 ===
python -m uvicorn src.main:app --reload --port 8001   # 启动 API
curl http://localhost:8001/health                      # 健康检查
curl http://localhost:8001/api/status                  # API 状态
open http://localhost:8001/docs                        # Swagger 文档

# === 新闻采集 ===
python scripts/collect_news.py                         # 手动采集

# === H5 前端 (无需构建) ===
open app/index.html                                    # 直接浏览器打开
python -m http.server 8080 -d app/                     # 或用 HTTP 服务器

# === Taro 小程序 ===
cd app && npm run build:weapp                          # 编译微信小程序 → dist/
# 然后用微信开发者工具打开 app/dist/ 预览

# ⚠️ dist/ 是编译产物，禁止直接修改。只改 app/src/ 下的源码。
```

---

## API 端点

### 新闻 (News)
| 方法 | 路径 | 说明 | H5 使用 |
|------|------|------|:--:|
| GET | `/api/news` | 新闻列表 (lang/category/date/min_quality) | ❌ |
| GET | `/api/news/stats` | 统计 (总数/等级分布/分类) | ❌ |
| GET | `/api/news/dates` | 有数据的日期列表 | ❌ |
| GET | `/api/news/{id}` | 单条详情 | ❌ |
| POST | `/api/news/{id}/read` | 朗读 (空壳, 返回 audio_url:null) | ❌ |

### 收藏分析 (核心)
| 方法 | 路径 | 说明 | H5 使用 |
|------|------|------|:--:|
| POST | `/api/favorites/analyze` | ★ AI 分析收藏新闻 | ✅ |
| POST | `/api/favorites/tts` | ★ 文本转语音 | ✅ |
| GET | `/api/favorites/analyze-and-tts` | 一站式分析+TTS | ❌ |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/voices` | 语音列表 |
| GET | `/api/voices/presets` | 语音预设 |
| POST | `/api/voices/test` | TTS 测试 |
| GET | `/api/status` | API 状态 (TTS/Chat 可用性) |

---

## 数据库操作注意事项

### 清除新闻数据 vs 删除数据库

| 操作 | 命令 | 结果 |
|------|------|------|
| **清除新闻数据** | `DELETE FROM news_items;` | 删除所有记录，**保留表结构** |
| **删除数据库** | `rm data/database.db` | 删除整个文件，包含表结构 |
| **误操作修复** | 重新 `touch data/database.db` + 启动服务自动建表 | |

> ⚠️ **重要**：用户要求清除数据时，只清除新闻记录，**不要删除数据库文件或表结构**。
> 
> 错误做法：`rm data/database.db`  
> 正确做法：`DELETE FROM news_items;`

---

## 🚨 核心规则

> **① 新闻数据流铁律**：后端采集的新闻 → 质量检查通过 → **存入数据库** (`data/database.db`)。
> 前端通过 `/api/news` 接口读取。**禁止**写入 JSON 文件作为前端数据源。

> **② Taro 源码铁律**：**只修改 `app/src/` 下的源码，禁止直接修改 `app/dist/`。**
> `dist/` 是 Taro 编译产物，每次 `npm run build:weapp` 都会被**完全覆盖**。
> 改 `dist/` 里的文件 = 下次编译白改。
```
正确:  app/src/pages/mine/mine.tsx  ← 编辑这里
错误:  app/dist/pages/mine/mine.js  ← 不能动
```

## 数据流

```
定时任务 (08:30)                     H5 SPA (浏览器)
    │                                    │
news_collector_v2.py  ← RSS           index.html → loadNews()
    │ 采集+评分                          │ fetch('/api/news')
    ▼                                    ▼
news_ai_calibrator.py                 allNews[] ──filterAndRender()──► 首页卡片
    │ AI 校准                           │
    ▼                                   ├─ toggleFavorite() → localStorage
save_news_to_db()                      ├─ openDetail() → 详情弹窗
    │ 写入 SQLite                       ├─ handleSpeak() → /api/favorites/tts
    ▼                                   │
data/database.db ◄── /api/news ────────┘
                                        └─ switchTab('collection')
                                             │
                                             ▼
                                       handleAnalyze()
                                         │ POST /api/favorites/analyze
                                         ▼
                                       MiniMax-M2.7 AI 分析
                                         │ POST /api/favorites/tts
                                         ▼
                                       Audio 播放器 (seek/语速/下载)
```

---

## 已知问题清单

| # | 问题 | 严重度 |
|---|------|:--:|
| 1 | ~~`app/data/` 目录不存在~~ → 已修复 | ✅ |
| 2 | ~~双数据库~~ → 已删除 SQLAlchemy，统一 sqlite3 | ✅ |
| 3 | ~~Chat API 不可用~~ → 已修复 (`v1/chat/completions` + `MiniMax-M2.7`) | ✅ |
| 4 | ~~`.env.example` 拼写~~ → 已修复 | ✅ |
| 5 | ~~H5 切换 Tab 不停止音频~~ → 已修复 | ✅ |
| 6 | ~~H5 详情弹窗无质量评分~~ → 已修复 | ✅ |
| 7 | ~~H5 数据源为 JSON 文件~~ → 已改为 `/api/news` | ✅ |
| 8 | `summary_zh/en` Taro 前端引用但后端不返回 | 🟡 |

---

## 环境变量

```bash
# .env (从 .env.example 复制)
MINIMAX_API_KEY=xxx        # ★ 必需 — MiniMax TTS/Chat API
WECHAT_APPID=xxx           # 微信小程序 AppID (正式发布时填写)
WECHAT_SECRET=xxx          # 微信小程序 Secret (正式发布时填写)
# DATABASE_URL=sqlite:///data/database.db
# BASE_URL=http://localhost:8001
```

当前状态: TTS 可用 (`speech-2.8-hd`)，Chat API 可用 (`MiniMax-M2.7` → `v1/chat/completions`)。

---

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature-slug>/`. One feature per directory. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` at repo root, one `docs/adr/` directory. See `docs/agents/domain.md`.
