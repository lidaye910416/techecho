"""
MySQL 数据库 ORM 模型

定义新闻表结构，使用 SQLAlchemy 2.0 风格。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Float, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """SQLAlchemy ORM 基类"""
    pass


class News(Base):
    """
    新闻表 ORM 模型
    
    字段与现有 SQLite 表结构保持一致：
    - id: 新闻唯一标识（UUID）
    - title_zh/en: 中英文标题
    - content_zh/en: 中英文内容
    - source_zh/en: 中英文来源名称
    - source_url: 原文链接
    - lang: 语言（zh/en）
    - category: 分类
    - published_at: 发布时间
    - created_at: 记录创建时间
    - quality_score: 质量总分（0-100）
    - quality_grade: 质量等级（A+/A/B/C/D）
    - quality_scores: 各维度评分详情（JSON 字符串）
    - is_read: 是否已读
    - is_favorited: 是否收藏
    - audio_url: 预生成音频 URL
    - cloud_file_id: 微信云存储 fileID
    """
    
    __tablename__ = "news_items"
    
    id = Column(String(50), primary_key=True, index=True)
    title_zh = Column(String(500), nullable=True)
    title_en = Column(String(500), nullable=True)
    content_zh = Column(Text, nullable=True)
    content_en = Column(Text, nullable=True)
    source_zh = Column(String(100), nullable=True)
    source_en = Column(String(100), nullable=True)
    source_url = Column(String(1000), nullable=True)
    lang = Column(String(10), nullable=True, index=True)
    category = Column(String(50), nullable=True, index=True)
    published_at = Column(String(50), nullable=True, index=True)
    created_at = Column(String(50), nullable=True, index=True)
    quality_score = Column(Float, nullable=True, index=True)
    quality_grade = Column(String(5), nullable=True, index=True)
    quality_scores = Column(Text, nullable=True)  # JSON 字符串
    is_read = Column(Boolean, default=False, index=True)
    is_favorited = Column(Boolean, default=False, index=True)
    audio_url = Column(Text, nullable=True)
    cloud_file_id = Column(String(255), nullable=True)
    
    def to_dict(self) -> dict:
        """转换为字典格式（与 SQLite 版本兼容）"""
        import json
        return {
            'id': self.id,
            'title_zh': self.title_zh,
            'title_en': self.title_en,
            'content_zh': self.content_zh,
            'content_en': self.content_en,
            'source_zh': self.source_zh,
            'source_en': self.source_en,
            'source_url': self.source_url,
            'lang': self.lang,
            'category': self.category,
            'published_at': self.published_at,
            'created_at': self.created_at,
            'quality': {
                'total_100': self.quality_score,
                'grade': self.quality_grade,
                'scores': json.loads(self.quality_scores) if self.quality_scores else {}
            },
            'is_read': self.is_read,
            'is_favorited': self.is_favorited,
            'audio_url': self.audio_url,
            'cloud_file_id': self.cloud_file_id,
        }
    
    def __repr__(self) -> str:
        return f"<News(id={self.id}, title_zh={self.title_zh[:30] if self.title_zh else None}...)>"
