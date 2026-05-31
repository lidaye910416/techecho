"""
微信小程序认证 API

提供微信登录、用户信息管理接口
"""

import os
import hashlib
import secrets
import time
import sqlite3
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])

# 微信配置
WECHAT_APPID = os.getenv("WECHAT_APPID", "")
WECHAT_SECRET = os.getenv("WECHAT_SECRET", "")

# 数据库路径
# 配置中心
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from src.config.settings import DB_PATH

# Token 有效期（7天）
TOKEN_EXPIRE_SECONDS = 7 * 24 * 3600

# Token 存储（内存缓存，重启失效；生产环境应改用 Redis）
_token_cache: Dict[str, Dict[str, Any]] = {}


class WechatLoginRequest(BaseModel):
    """微信登录请求"""
    code: str  # wx.login() 返回的临时 code
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


def get_user_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_users_table():
    """初始化用户表"""
    conn = get_user_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            openid TEXT UNIQUE NOT NULL,
            nickname TEXT DEFAULT '',
            avatar_url TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            last_login_at TEXT DEFAULT (datetime('now')),
            login_count INTEGER DEFAULT 1
        )
    ''')
    conn.commit()
    conn.close()


def generate_token() -> str:
    """生成随机 token"""
    return secrets.token_hex(32)


def generate_user_id() -> str:
    """生成用户 ID"""
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"u_{ts}_{rand}"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/wechat-login")
async def wechat_login(request: WechatLoginRequest):
    """
    微信小程序登录

    流程:
    1. 使用 wx.login() 获得的 code 调用微信 jscode2session
    2. 获取 openid 和 session_key
    3. 查找或创建用户
    4. 生成自定义 token 返回
    """
    code = request.code.strip()

    if not code:
        raise HTTPException(status_code=400, detail="code 不能为空")

    # === 开发/调试模式：无微信 AppID 时使用 mock ===
    if not WECHAT_APPID or not WECHAT_SECRET:
        mock_openid = f"dev_{hashlib.md5(code.encode()).hexdigest()[:16]}"
        print(f"[Auth] 开发模式 - 模拟登录 openid={mock_openid}")

        init_users_table()
        conn = get_user_db()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE openid = ?", (mock_openid,))
        row = cursor.fetchone()
        is_new = False

        if row:
            user_id = row["id"]
            nickname = row["nickname"] or request.nickname or ""
            avatar_url = row["avatar_url"] or request.avatar_url or ""

            if request.nickname and request.nickname != nickname:
                cursor.execute(
                    "UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?",
                    (request.nickname, request.avatar_url or avatar_url, user_id),
                )
                nickname = request.nickname

            cursor.execute(
                "UPDATE users SET last_login_at = datetime('now'), login_count = login_count + 1 WHERE id = ?",
                (user_id,),
            )
        else:
            user_id = generate_user_id()
            nickname = request.nickname or f"用户{user_id[-6:]}"
            avatar_url = request.avatar_url or ""
            is_new = True

            cursor.execute(
                "INSERT INTO users (id, openid, nickname, avatar_url) VALUES (?, ?, ?, ?)",
                (user_id, mock_openid, nickname, avatar_url),
            )

        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=500, detail="用户创建失败")

        token = generate_token()
        token_hash = _hash_token(token)
        _token_cache[token_hash] = {
            "user_id": user_id,
            "openid": mock_openid,
            "expires_at": time.time() + TOKEN_EXPIRE_SECONDS,
        }

        conn.close()

        return {
            "success": True,
            "token": token,
            "user_id": user_id,
            "nickname": nickname,
            "avatar_url": avatar_url,
            "is_new_user": is_new,
            "message": "登录成功（开发模式）" if not WECHAT_APPID else "登录成功",
        }

    # === 正式模式：调用微信 API ===
    try:
        import httpx

        wx_url = "https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": WECHAT_APPID,
            "secret": WECHAT_SECRET,
            "js_code": code,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(wx_url, params=params, timeout=10)
            wx_data = resp.json()

        if "errcode" in wx_data and wx_data["errcode"] != 0:
            errcode = wx_data.get("errcode", -1)
            errmsg = wx_data.get("errmsg", "未知错误")
            print(f"[Auth] 微信 API 错误: errcode={errcode}, errmsg={errmsg}")
            raise HTTPException(status_code=400, detail=f"微信登录失败: {errmsg}")

        openid = wx_data.get("openid")
        if not openid:
            raise HTTPException(status_code=400, detail="获取 openid 失败")

        print(f"[Auth] 微信登录成功 openid={openid[:8]}***")

        init_users_table()
        conn = get_user_db()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE openid = ?", (openid,))
        row = cursor.fetchone()
        is_new = False

        if row:
            user_id = row["id"]
            nickname = row["nickname"] or request.nickname or ""
            avatar_url = row["avatar_url"] or request.avatar_url or ""

            if request.nickname and request.nickname != nickname:
                cursor.execute(
                    "UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?",
                    (request.nickname, request.avatar_url or avatar_url, user_id),
                )
                nickname = request.nickname

            cursor.execute(
                "UPDATE users SET last_login_at = datetime('now'), login_count = login_count + 1 WHERE id = ?",
                (user_id,),
            )
        else:
            user_id = generate_user_id()
            nickname = request.nickname or f"用户{user_id[-6:]}"
            avatar_url = request.avatar_url or ""
            is_new = True

            cursor.execute(
                "INSERT INTO users (id, openid, nickname, avatar_url) VALUES (?, ?, ?, ?)",
                (user_id, openid, nickname, avatar_url),
            )

        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=500, detail="用户创建失败")

        token = generate_token()
        token_hash = _hash_token(token)
        _token_cache[token_hash] = {
            "user_id": user_id,
            "openid": openid,
            "expires_at": time.time() + TOKEN_EXPIRE_SECONDS,
        }

        return {
            "success": True,
            "token": token,
            "user_id": user_id,
            "nickname": nickname or "",
            "avatar_url": avatar_url or "",
            "is_new_user": is_new,
            "message": "登录成功",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] 微信登录异常: {e}")
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@router.get("/user-info")
async def get_user_info(token: str):
    """
    获取用户信息（预留接口）
    """
    token_hash = _hash_token(token)
    cached = _token_cache.get(token_hash)

    if not cached or cached["expires_at"] < time.time():
        raise HTTPException(status_code=401, detail="token 无效或已过期")

    user_id = cached["user_id"]
    conn = get_user_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {
        "success": True,
        "data": {
            "user_id": row["id"],
            "nickname": row["nickname"],
            "avatar_url": row["avatar_url"],
            "created_at": row["created_at"],
            "last_login_at": row["last_login_at"],
            "login_count": row["login_count"],
        },
    }
