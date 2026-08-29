"""
RunComfy API - 游戏角色概念图生成脚本
使用方法:
  1. 访问 https://www.runcomfy.com/profile 获取 API Token
  2. 设置环境变量: $env:RUNCOMFY_TOKEN = "你的token"
  3. 运行: python generate_character.py
"""

import os
import json
import time
import requests
import sys

API_BASE = "https://model-api.runcomfy.net/v1"
TOKEN = os.environ.get("RUNCOMFY_TOKEN")

if not TOKEN:
    print("错误: 未找到 RUNCOMFY_TOKEN 环境变量")
    print("请先设置: $env:RUNCOMFY_TOKEN = \"你的API Token\"")
    print("Token 获取地址: https://www.runcomfy.com/profile")
    sys.exit(1)

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}

# 选择模型: Qwen Image 2512 (支持 portrait_4_3 尺寸)
MODEL = "qwen/qwen-image/qwen-image-2512"

# === 优化后的 Prompt ===
PROMPT = (
    "Game character concept art, an Eastern fantasy female swordswoman, "
    "flowing long white hair, wearing elegant blue light armor with gold accents, "
    "holding a glowing longsword that emits a soft blue-white light, "
    "standing under a starry night sky with a crescent moon in the background, "
    "ethereal mist around her feet, dynamic pose, dramatic cinematic lighting, "
    "epic fantasy atmosphere, highly detailed, painterly style, "
    "character design sheet quality, intricate armor details"
)

NEGATIVE_PROMPT = (
    "low quality, blurry, distorted, bad anatomy, extra limbs, "
    "fingers, watermark, signature, text, modern clothing, "
    "deformed, ugly, oversaturated"
)

def submit_request():
    """提交图像生成请求"""
    url = f"{API_BASE}/models/{MODEL}"
    payload = {
        "prompt": PROMPT,
        "negative_prompt": NEGATIVE_PROMPT,
        "image_size": "portrait_4_3",
    }

    print(f"提交请求到模型: {MODEL}")
    print(f"Prompt: {PROMPT[:80]}...")
    print(f"尺寸: portrait_4_3")
    print()

    resp = requests.post(url, headers=HEADERS, json=payload)
    if resp.status_code != 200:
        print(f"请求失败 (HTTP {resp.status_code}): {resp.text}")
        sys.exit(1)

    data = resp.json()
    request_id = data.get("request_id")
    if not request_id:
        print(f"返回数据中未找到 request_id: {data}")
        sys.exit(1)

    print(f"请求已提交, ID: {request_id}")
    return request_id

def poll_status(request_id):
    """轮询请求状态直到完成"""
    url = f"{API_BASE}/requests/{request_id}/status"

    while True:
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200:
            print(f"查询状态失败: {resp.text}")
            sys.exit(1)

        data = resp.json()
        status = data.get("status", "unknown")
        print(f"  状态: {status}")

        if status == "completed":
            return True
        elif status in ("cancelled", "failed"):
            print(f"请求失败或已取消: {data}")
            return False

        time.sleep(3)

def get_result(request_id):
    """获取生成结果并下载图片"""
    url = f"{API_BASE}/requests/{request_id}/result"

    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        print(f"获取结果失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    images = data.get("images", [])

    if not images:
        print(f"结果中未找到图片: {data}")
        # 尝试其他可能的字段
        output = data.get("output", {})
        images = output.get("images", []) if isinstance(output, dict) else []

    if not images:
        print("未找到图片 URL")
        print(f"完整返回数据: {json.dumps(data, indent=2)}")
        sys.exit(1)

    output_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_dir, exist_ok=True)

    for i, img_url in enumerate(images):
        print(f"下载图片 {i+1}/{len(images)}: {img_url}")
        img_resp = requests.get(img_url, stream=True)
        if img_resp.status_code == 200:
            ext = "png"
            filename = f"swordswoman_concept_{i+1}.{ext}"
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "wb") as f:
                for chunk in img_resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"  已保存: {filepath}")
        else:
            print(f"  下载失败: HTTP {img_resp.status_code}")

    print(f"\n所有图片已保存到: {output_dir}")

def main():
    print("=" * 60)
    print("  游戏角色概念图生成器 - RunComfy API")
    print("=" * 60)
    print()

    request_id = submit_request()
    print()

    print("等待生成完成...")
    success = poll_status(request_id)
    print()

    if success:
        get_result(request_id)
    else:
        print("生成失败")
        sys.exit(1)

if __name__ == "__main__":
    main()
