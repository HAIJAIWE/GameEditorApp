# 多阶段构建 Dockerfile - 墨白可视化编辑器
# 阶段1: 构建环境 - 安装依赖
FROM python:3.14-slim AS builder

WORKDIR /build

# 安装系统依赖（PyQt6 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libxcb-xinerama0 \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements-lock.txt ./

# 安装 Python 依赖到独立目录（便于多阶段复制）
RUN pip install --no-cache-dir --prefix=/install -r requirements-lock.txt

# 阶段2: 运行环境 - 最小化镜像
FROM python:3.14-slim AS runtime

WORKDIR /app

# 仅安装运行时必需的系统库（不含 -dev 包）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libgomp1 \
    libxcb-xinerama0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

# 从构建阶段复制已安装的 Python 依赖
COPY --from=builder /install /usr/local

# 复制源码
COPY --chown=appuser:appuser . .

# 设置日志目录权限
RUN mkdir -p /app/logs && chown -appuser:appuser /app/logs

# 切换到非 root 用户
USER appuser

# 环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ROOT=/app

# 健康检查（验证 Python 能启动）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import sys; sys.exit(0)" || exit 1

# 默认命令
CMD ["python", "src/app.py"]
