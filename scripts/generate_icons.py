#!/usr/bin/env python3
"""
生成 TabBar 图标

使用 MiniMax 文生图 API 生成简洁的图标
"""
import os
import sys
import requests
import base64
from pathlib import Path

# 添加 src 到 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv("MINIMAX_API_KEY", "") or os.getenv("MINIMax_API_KEY", "")
API_URL = "https://api.minimaxi.com/v1/image_generation"

ASSETS_DIR = Path(__file__).parent.parent / "app" / "src" / "assets"

# 图标配置：每个图标的设计描述
ICONS = [
    {
        "name": "home",
        "prompt": "A minimal flat icon of a house/home button, simple geometric shape, white stroke on dark circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    },
    {
        "name": "home-active",
        "prompt": "A minimal flat icon of a house/home button with a small dot indicator, simple geometric shape, white filled shape on blue circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    },
    {
        "name": "news",
        "prompt": "A minimal flat icon of stacked news papers/document, simple geometric shapes, white stroke on dark circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    },
    {
        "name": "news-active",
        "prompt": "A minimal flat icon of stacked news papers/document with a small dot indicator, simple geometric shapes, white filled shape on blue circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    },
    {
        "name": "mine",
        "prompt": "A minimal flat icon of a user/person profile, simple geometric shape, white stroke on dark circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    },
    {
        "name": "mine-active",
        "prompt": "A minimal flat icon of a user/person profile with a small dot indicator, simple geometric shapes, white filled shape on blue circle background, modern UI icon style, 81x81 pixels, no text",
        "negative": "complex, detailed, text, letters, watermark"
    }
]

def generate_icon(icon_config: dict) -> bytes:
    """生成单个图标"""
    if not API_KEY or API_KEY == "your_api_key_here":
        print(f"❌ 请先配置 .env 文件中的 MINIMAX_API_KEY")
        sys.exit(1)
    
    print(f"🎨 生成 {icon_config['name']}...")
    
    payload = {
        "model": "image-01",
        "prompt": icon_config["prompt"],
        "negative_prompt": icon_config.get("negative", ""),
        "image_size": "512x512",
        "num_images": 1
    }
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(API_URL, json=payload, headers=headers, timeout=60)
    
    if response.status_code != 200:
        print(f"❌ API 请求失败: {response.status_code} - {response.text}")
        return None

    result = response.json()

    # MiniMax API 返回格式: {"data": {"image_urls": ["url1", "url2"]}}
    image_url = None
    if "data" in result:
        data = result["data"]
        if isinstance(data, dict):
            # 格式1: {"image_urls": [...]} (小写)
            if "image_urls" in data and data["image_urls"]:
                image_url = data["image_urls"][0]
            # 格式1: {"Image_urls": [...]} (大写)
            elif "Image_urls" in data and data["Image_urls"]:
                image_url = data["Image_urls"][0]
            # 格式2: {"url": "..."} 或 {"base64": "..."}
            elif "url" in data:
                image_url = data["url"]
            elif "base64" in data:
                image_url = data["base64"]
        elif isinstance(data, list) and len(data) > 0:
            image_url = data[0].get("url") or data[0].get("base64")

    if image_url:
        # 如果是 URL，下载图片
        if image_url.startswith("http"):
            img_response = requests.get(image_url)
            return img_response.content
        # 如果是 base64，解码
        else:
            return base64.b64decode(image_url)

    print(f"❌ 生成失败: {result}")
    return None


def main():
    """生成所有 TabBar 图标"""
    if not API_KEY or API_KEY == "your_api_key_here":
        print("❌ 错误: 请先配置 .env 文件中的 MINIMAX_API_KEY")
        print("   创建 .env 文件：")
        print("   MINIMAX_API_KEY=你的API密钥")
        sys.exit(1)
    
    print("=" * 50)
    print("TechEcho Pro - TabBar 图标生成")
    print("=" * 50)
    
    # 确保目录存在
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    
    success_count = 0
    for icon_config in ICONS:
        # 生成图标
        image_data = generate_icon(icon_config)
        
        if image_data:
            # 保存 PNG 文件
            output_path = ASSETS_DIR / f"{icon_config['name']}.png"
            with open(output_path, "wb") as f:
                f.write(image_data)
            print(f"✅ 已保存: {output_path}")
            success_count += 1
        else:
            print(f"❌ 跳过: {icon_config['name']}")
    
    print("-" * 50)
    print(f"✅ 完成! 成功生成 {success_count}/{len(ICONS)} 个图标")
    print(f"   图标位置: {ASSETS_DIR}")
    
    # 列出生成的文件
    if success_count > 0:
        print("\n生成的文件:")
        for icon in ICONS:
            path = ASSETS_DIR / f"{icon['name']}.png"
            if path.exists():
                size = path.stat().st_size
                print(f"  - {icon['name']}.png ({size} bytes)")


if __name__ == "__main__":
    main()
