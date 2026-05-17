# API 重构计划：合并 news_api.py 和 collect_api.py

## 问题分析

### 当前状态
| 文件 | 功能 | 问题 |
|------|------|------|
| `news_api.py` | 新闻 CRUD + collect 接口 | ✅ 有 source_limit |
| `collect_api.py` | collect 接口 + 状态查询 | ❌ 缺少 source_limit |

### 重复问题
1. 两个文件都注册 `/news` 前缀
2. `/news/collect` 接口重复（功能相同）
3. `collect_api.py` 缺少 `source_limit` 参数
4. 状态查询功能在 `collect_api.py` 中，但 collect 逻辑在 `news_api.py` 中

## 解决方案

**合并方案**：保留 `news_api.py`，将 `collect_api.py` 的状态查询功能移入，然后删除 `collect_api.py`

### 具体步骤

1. **修改 news_api.py**
   - 添加 `GET /news/collect/status` 端点
   - 完善 `POST /news/collect` 的文档注释
   - 确保 source_limit 参数传递

2. **删除 collect_api.py**
   - 文件不再需要

3. **修改 routes.py**
   - 移除 `collect_api.py` 的导入和注册

## 文件变更

| 操作 | 文件 |
|------|------|
| 修改 | `src/api/news_api.py` |
| 删除 | `src/api/collect_api.py` |
| 修改 | `src/api/routes.py` |

## E2E 测试方案

```bash
# 1. 启动后端服务
cd /Users/jasonlee/techecho/worktrees/api-refactor
python -m uvicorn src.main:app --reload --port 8000 &

# 2. 等待服务启动
sleep 3

# 3. 测试 collect 接口
curl -X POST "http://localhost:8000/api/news/collect?source_limit=2&limit=3"

# 4. 查看状态
curl "http://localhost:8000/api/news/collect/status"

# 5. 验证新闻列表
curl "http://localhost:8000/api/news?limit=5"
```

## 工作单元

### Unit 1: 修改 news_api.py
- 添加 `/collect/status` GET 端点
- 完善 `/collect` POST 端点的参数和文档
- 测试接口功能

### Unit 2: 修改 routes.py 并删除 collect_api.py
- 移除 collect_api 导入
- 删除 collect_api.py 文件

### Unit 3: E2E 测试
- 启动服务
- 测试 collect 触发
- 验证状态查询
- 确认新闻列表
