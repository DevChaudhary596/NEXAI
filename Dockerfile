# SatQuery AI / SOLEN — Backend Sovereign Container (Hugging Face Spaces Compatible)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=7860 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

# Install geospatial & system runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gdal-bin \
    libgdal-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (Hugging Face requirement: user ID 1000)
RUN useradd -m -u 1000 user && \
    mkdir -p /home/user/.satquery/data && \
    chown -R user:user /home/user /app

# Install Python requirements with lightweight CPU PyTorch
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY --chown=user:user . .

USER user

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:7860/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
