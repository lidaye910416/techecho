"""
微信云托管对象存储服务

使用腾讯云 COS SDK 将音频文件上传到微信云托管对象存储，
解决镜像部署时文件丢失的问题。

参考文档:
- https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/storage/miniapp/upload.html
- https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/storage/miniapp/download.html
"""

import logging
import os
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# 全局单例
_cloud_storage: Optional['WeChatCloudStorage'] = None


class WeChatCloudStorage:
    """
    微信云托管对象存储客户端
    
    使用腾讯云 COS SDK 操作云存储，支持:
    - 上传文件到云存储
    - 获取临时访问链接
    - 下载文件到本地
    """
    
    def __init__(
        self,
        secret_id: str,
        secret_key: str,
        bucket: str,
        region: str = 'ap-shanghai',
        env_id: str = ''
    ):
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.bucket = bucket
        self.region = region
        self.env_id = env_id
        self.cos_client = None
        self._initialized = False
        
    def _ensure_init(self):
        """延迟初始化 COS 客户端"""
        if self._initialized:
            return
            
        try:
            from qcloud_cos import CosConfig
            from qcloud_cos import CosS3Client
            
            config = CosConfig(
                Region=self.region,
                SecretId=self.secret_id,
                SecretKey=self.secret_key,
            )
            self.cos_client = CosS3Client(config)
            self._initialized = True
            logger.info(f"[CloudStorage] COS client initialized: bucket={self.bucket}, region={self.region}")
        except ImportError:
            logger.warning("[CloudStorage] qcloud_cos SDK not installed, cloud storage disabled")
            self._initialized = True  # 标记已尝试初始化，避免重复尝试
    
    @property
    def is_available(self) -> bool:
        """检查云存储是否可用"""
        self._ensure_init()
        return self.cos_client is not None
    
    def _normalize_path(self, cloud_path: str) -> str:
        """标准化云存储路径"""
        # 移除前导斜杠
        path = cloud_path.lstrip('/')
        # 添加到工作目录
        return f"techecho/{path}"
    
    async def upload_file(
        self,
        local_file: str | Path,
        cloud_path: str
    ) -> Optional[str]:
        """
        上传本地文件到云存储
        
        Args:
            local_file: 本地文件路径
            cloud_path: 云存储路径 (相对于存储桶根目录)
            
        Returns:
            cloud_file_id: 云存储文件ID，格式: cloud://{env}/{bucket}/{path}
            None: 上传失败
        """
        self._ensure_init()
        
        if not self.cos_client:
            logger.warning("[CloudStorage] COS client not available, upload skipped")
            return None
        
        local_file = Path(local_file)
        if not local_file.exists():
            logger.error(f"[CloudStorage] Local file not found: {local_file}")
            return None
        
        normalized_path = self._normalize_path(cloud_path)
        
        try:
            # 上传到 COS
            with open(local_file, 'rb') as f:
                response = self.cos_client.put_object(
                    Bucket=self.bucket,
                    Body=f,
                    Key=normalized_path,
                    StorageClass='STANDARD',
                    ContentType='audio/mpeg',
                )
            
            logger.info(f"[CloudStorage] Uploaded: {local_file.name} -> {normalized_path}")
            
            # 生成 cloud:// 格式的 fileID
            # 格式: cloud://{env_id}/{bucket}/{path}
            if self.env_id:
                cloud_file_id = f"cloud://{self.env_id}/{self.bucket}/{normalized_path}"
            else:
                # 如果没有 env_id，使用简化格式
                cloud_file_id = f"{self.bucket}/{normalized_path}"
            
            return cloud_file_id
            
        except Exception as e:
            logger.error(f"[CloudStorage] Upload failed: {e}")
            return None
    
    async def download_file(
        self,
        cloud_path: str,
        local_file: str | Path
    ) -> bool:
        """
        从云存储下载文件到本地
        
        Args:
            cloud_path: 云存储路径
            local_file: 本地保存路径
            
        Returns:
            True: 下载成功
            False: 下载失败
        """
        self._ensure_init()
        
        if not self.cos_client:
            logger.warning("[CloudStorage] COS client not available, download skipped")
            return False
        
        normalized_path = self._normalize_path(cloud_path)
        local_file = Path(local_file)
        
        try:
            # 确保目录存在
            local_file.parent.mkdir(parents=True, exist_ok=True)
            
            # 从 COS 下载
            response = self.cos_client.get_object(
                Bucket=self.bucket,
                Key=normalized_path,
            )
            
            # 保存到本地
            response['Body'].get_stream_to_file(str(local_file))
            
            logger.info(f"[CloudStorage] Downloaded: {normalized_path} -> {local_file}")
            return True
            
        except Exception as e:
            logger.error(f"[CloudStorage] Download failed: {e}")
            return False
    
    async def get_temp_url(
        self,
        cloud_path: str,
        expires: int = 3600
    ) -> Optional[str]:
        """
        获取文件的临时访问链接
        
        Args:
            cloud_path: 云存储路径
            expires: 链接有效期（秒），默认 1 小时
            
        Returns:
            临时访问 URL
            None: 获取失败
        """
        self._ensure_init()
        
        if not self.cos_client:
            logger.warning("[CloudStorage] COS client not available")
            return None
        
        normalized_path = self._normalize_path(cloud_path)
        
        try:
            # 生成预签名 URL
            url = self.cos_client.get_presigned_download_url(
                Bucket=self.bucket,
                Key=normalized_path,
                Expired=expires,
            )
            
            logger.info(f"[CloudStorage] Temp URL generated: {normalized_path}")
            return url
            
        except Exception as e:
            logger.error(f"[CloudStorage] Get temp URL failed: {e}")
            return None
    
    async def delete_file(self, cloud_path: str) -> bool:
        """
        删除云存储文件
        
        Args:
            cloud_path: 云存储路径
            
        Returns:
            True: 删除成功
            False: 删除失败
        """
        self._ensure_init()
        
        if not self.cos_client:
            logger.warning("[CloudStorage] COS client not available")
            return False
        
        normalized_path = self._normalize_path(cloud_path)
        
        try:
            self.cos_client.delete_object(
                Bucket=self.bucket,
                Key=normalized_path,
            )
            
            logger.info(f"[CloudStorage] Deleted: {normalized_path}")
            return True
            
        except Exception as e:
            logger.error(f"[CloudStorage] Delete failed: {e}")
            return False


def get_cloud_storage() -> Optional[WeChatCloudStorage]:
    """
    获取云存储客户端单例
    
    Returns:
        WeChatCloudStorage 实例 (如果配置了凭证)
        None (如果未配置凭证)
    """
    global _cloud_storage
    
    if _cloud_storage is not None:
        return _cloud_storage if _cloud_storage.is_available else None
    
    # 从配置读取
    from src.config.settings import (
        WECHAT_CLOUD_SECRET_ID,
        WECHAT_CLOUD_SECRET_KEY,
        WECHAT_CLOUD_BUCKET,
        WECHAT_CLOUD_REGION,
        WECHAT_CLOUD_ENV,
        CLOUD_STORAGE_ENABLED,
    )
    
    if not CLOUD_STORAGE_ENABLED:
        logger.info("[CloudStorage] Cloud storage not configured, using local storage")
        _cloud_storage = None
        return None
    
    try:
        _cloud_storage = WeChatCloudStorage(
            secret_id=WECHAT_CLOUD_SECRET_ID,
            secret_key=WECHAT_CLOUD_SECRET_KEY,
            bucket=WECHAT_CLOUD_BUCKET,
            region=WECHAT_CLOUD_REGION,
            env_id=WECHAT_CLOUD_ENV,
        )
        
        if _cloud_storage.is_available:
            logger.info("[CloudStorage] Cloud storage initialized successfully")
            return _cloud_storage
        else:
            logger.warning("[CloudStorage] Cloud storage initialization failed")
            _cloud_storage = None
            return None
            
    except Exception as e:
        logger.error(f"[CloudStorage] Failed to create cloud storage client: {e}")
        _cloud_storage = None
        return None


def is_cloud_storage_available() -> bool:
    """检查云存储是否可用"""
    return get_cloud_storage() is not None
