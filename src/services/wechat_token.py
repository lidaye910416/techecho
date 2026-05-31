"""
微信 access_token 管理模块

功能：
- 自动获取并缓存 access_token（有效期 2 小时）
- 线程安全，支持多协程并发访问
- 过期前自动刷新

API: GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
"""

import asyncio
import logging
import time
from typing import Optional

import httpx

from src.config.settings import (
    WECHAT_APPID,
    WECHAT_SECRET,
)

logger = logging.getLogger(__name__)

# Token 缓存（全局）
_token_cache: Optional[dict] = None
_token_lock = asyncio.Lock()

# Token 有效期（秒）- 微信官方 7200 秒，提前 5 分钟刷新
TOKEN_EXPIRES_IN = 7200
TOKEN_REFRESH_BEFORE = 300  # 提前 5 分钟刷新


async def get_access_token() -> Optional[str]:
    """
    获取微信 access_token（带缓存和自动刷新）
    
    Returns:
        access_token: 成功返回 token 字符串
        None: 失败（配置缺失或 API 调用失败）
    """
    global _token_cache
    
    if not WECHAT_APPID or not WECHAT_SECRET:
        logger.warning("[WeChatToken] WECHAT_APPID or WECHAT_SECRET not configured")
        return None
    
    async with _token_lock:
        # 检查缓存是否有效
        if _token_cache:
            expires_at = _token_cache.get('expires_at', 0)
            if time.time() < expires_at - TOKEN_REFRESH_BEFORE:
                logger.debug(f"[WeChatToken] Using cached token, expires in {expires_at - time.time():.0f}s")
                return _token_cache['access_token']
        
        # 需要刷新 token
        return await _refresh_token()


async def _refresh_token() -> Optional[str]:
    """
    刷新 access_token
    
    Returns:
        access_token: 成功返回 token 字符串
        None: 失败
    """
    global _token_cache
    
    try:
        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": WECHAT_APPID,
            "secret": WECHAT_SECRET,
        }
        
        logger.info(f"[WeChatToken] Refreshing token for appid: {WECHAT_APPID[:8]}***")

        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            response = await client.get(url, params=params)
            result = response.json()
        
        if result.get('errcode') and result.get('errcode') != 0:
            logger.error(f"[WeChatToken] Refresh failed: {result}")
            return None

        # 检查是否返回了 access_token（微信 API 成功时不返回 errcode 字段）
        access_token = result.get('access_token')
        if not access_token:
            logger.error(f"[WeChatToken] Refresh failed: no access_token in response: {result}")
            return None

        expires_in = result.get('expires_in', TOKEN_EXPIRES_IN)
        expires_at = time.time() + expires_in

        _token_cache = {
            'access_token': access_token,
            'expires_at': expires_at,
            'refreshed_at': time.time(),
        }

        logger.info(f"[WeChatToken] Token refreshed successfully, expires in {expires_in}s")
        return access_token
            
    except Exception as e:
        logger.error(f"[WeChatToken] Refresh error: {e}")
        return None


async def clear_token_cache():
    """清除 token 缓存（用于测试或强制刷新）"""
    global _token_cache
    async with _token_lock:
        _token_cache = None
        logger.info("[WeChatToken] Token cache cleared")


def get_token_sync() -> Optional[str]:
    """
    同步获取 token（仅用于紧急场景，不推荐）
    
    注意：此函数会阻塞当前线程，不应在 async 上下文中使用
    """
    if not WECHAT_APPID or not WECHAT_SECRET:
        return None
    
    global _token_cache
    if _token_cache and time.time() < _token_cache.get('expires_at', 0) - TOKEN_REFRESH_BEFORE:
        return _token_cache['access_token']
    
    # 同步刷新（不应该在 async 上下文中调用）
    return _sync_refresh_token()


def _sync_refresh_token() -> Optional[str]:
    """同步刷新 token（仅用于紧急场景）"""
    import threading
    global _token_cache

    try:
        import urllib.request
        import ssl

        url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={WECHAT_APPID}&secret={WECHAT_SECRET}"

        # 创建不验证 SSL 证书的上下文
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with urllib.request.urlopen(url, timeout=30, context=ctx) as response:
            result = response.read().decode()
        
        import json
        data = json.loads(result)
        
        if data.get('errcode') == 0:
            _token_cache = {
                'access_token': data['access_token'],
                'expires_at': time.time() + data.get('expires_in', TOKEN_EXPIRES_IN),
                'refreshed_at': time.time(),
            }
            return _token_cache['access_token']
        
        return None
    except Exception as e:
        logger.error(f"[WeChatToken] Sync refresh error: {e}")
        return None
