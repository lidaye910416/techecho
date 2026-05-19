# 后端文件存储改造计划

## 问题分析

### 当前问题
1. **音频文件存储在镜像内**：TTS 生成的音频文件存储在 `/app/data/audio/` 目录
2. **镜像部署丢失数据**：每次重新部署镜像，之前生成的音频文件全部丢失
3. **数据不可持久化**：需要重新生成所有 TTS 音频

### 微信云托管存储方案
根据微信云托管文档，有两种方案：

**方案 A：小程序端上传**
- 前端使用 `wx.cloud.uploadFile` 上传音频
- 前端获取 `fileID` 后回调后端保存
- 优点：后端改动小
- 缺点：需要前端配合处理上传逻辑

**方案 B：后端直传云存储**
- 后端使用腾讯云 COS SDK 直传文件到云存储
- 需要获取 COS 凭证（SecretId/SecretKey）
- 优点：后端自动处理，音频生成后立即上传
- 缺点：需要配置 COS 凭证

## 改造计划

### 工作单元划分

| # | 单元 | 文件/目录 | 描述 |
|---|------|---------|------|
| 1 | **云存储客户端封装** | `src/services/cloud_storage.py` | 新建微信云存储客户端，封装上传/下载/获取临时链接 |
| 2 | **配置项添加** | `src/config/settings.py` | 添加云存储相关环境变量配置 |
| 3 | **TTS服务集成云存储** | `src/services/tts/tts_service.py` | 修改 TTS 服务，生成音频后自动上传到云存储 |
| 4 | **静态文件服务移除** | `src/main.py` | 移除 `/data` 静态文件挂载，不再需要本地存储 |
| 5 | **前端音频播放适配** | `app/src/utils/audioManager.ts` | 修改前端音频播放逻辑，优先使用云存储 fileID |
| 6 | **环境变量更新** | `.env.example` | 添加云存储相关配置说明 |

## 详细设计

### 1. 云存储客户端 (`src/services/cloud_storage.py`)

```python
class WeChatCloudStorage:
    """微信云托管存储客户端"""
    
    def __init__(self, secret_id: str, secret_key: str, bucket: str, region: str):
        # 使用腾讯云 COS SDK
        self.cos_client = CosS3Client(CosConfig(...))
        self.bucket = bucket
        self.prefix = "techecho/audio/"
    
    async def upload_file(self, local_path: str, cloud_path: str) -> str:
        """上传文件，返回 cloudFileId"""
        # 上传到腾讯云 COS
        # 返回格式: cloud://{env}/{bucket}/{path}
        
    async def get_temp_url(self, cloud_file_id: str, expires: int = 3600) -> str:
        """获取临时访问链接"""
```

### 2. 配置项 (`src/config/settings.py`)

```python
# 微信云存储配置
WECHAT_CLOUD_SECRET_ID = os.getenv('WECHAT_CLOUD_SECRET_ID', '')
WECHAT_CLOUD_SECRET_KEY = os.getenv('WECHAT_CLOUD_SECRET_KEY', '')
WECHAT_CLOUD_BUCKET = os.getenv('WECHAT_CLOUD_BUCKET', '')
WECHAT_CLOUD_REGION = os.getenv('WECHAT_CLOUD_REGION', 'ap-shanghai')
WECHAT_CLOUD_ENV = os.getenv('WECHAT_CLOUD_ENV', '')  # 环境ID
```

### 3. TTS 服务改造 (`src/services/tts/tts_service.py`)

```python
async def _synthesize_minimax(self, ...):
    # 生成音频后
    audio_file = self._get_cache_path(news_id, voice_id)
    
    # 上传到云存储
    cloud_storage = get_cloud_storage()
    if cloud_storage:
        cloud_path = f"audio/{news_id}_{voice_id}.mp3"
        cloud_file_id = await cloud_storage.upload_file(str(audio_file), cloud_path)
        # 保存 cloud_file_id 到数据库
        save_news_cloud_file_id(news_id, cloud_file_id)
```

### 4. 前端适配 (`app/src/utils/audioManager.ts`)

```typescript
// 修改 downloadAudio 函数
async function downloadAudio(cloudFileId: string, newsId: string): Promise<string> {
  // 优先使用 wx.cloud.downloadFile
  const res = await wx.cloud.downloadFile({
    fileID: cloudFileId,
  })
  return res.tempFilePath
}
```

## E2E 测试方案

### 测试步骤

1. **启动后端服务**
   ```bash
   cd worktrees/backend-storage
   source venv/bin/activate 2>/dev/null || true
   python -m uvicorn src.main:app --reload --port 8000
   ```

2. **触发新闻采集（生成音频）**
   ```bash
   curl -X POST "http://localhost:8000/api/news/collect?source_limit=2&limit=5"
   ```

3. **检查音频是否上传到云存储**
   - 登录微信云托管控制台
   - 查看对象存储，确认音频文件已上传
   - 检查数据库 `cloud_file_id` 字段是否有值

4. **前端测试**（需要配置云开发环境）
   - 打开微信开发者工具
   - 播放新闻音频
   - 确认音频能正常播放

### 跳过 E2E 的情况

如果无法访问微信云存储凭证，可以跳过完整 E2E 测试，仅验证：
- 后端服务正常启动
- 代码逻辑审查
- 单元测试通过

## 实施顺序

1. 先完成单元 1-2（配置和云存储客户端）
2. 再完成单元 3（TTS 集成）
3. 最后完成单元 4-6（静态文件移除和前端适配）
