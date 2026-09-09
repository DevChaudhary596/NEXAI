# SatQuery Sovereign On-Premise Deployment Guide

This guide documents deploying SatQuery in a fully private, air-gapped, or sovereign cloud environment (such as an on-premise defense network, ISRO computing cluster, or municipal datacenter) where public cloud dependencies (AWS, Cloudflare, Firebase Cloud) are restricted.

---

## Architecture Overview

```
                          ┌───────────────────────────┐
                          │   Next.js 16 (Port 3000)  │
                          │   3D Cesium & Operations  │
                          └─────────────┬─────────────┘
                                        │ HTTP / REST
                                        ▼
                          ┌───────────────────────────┐
                          │   FastAPI (Port 8000)     │
                          │   Computer Vision & GIS   │
                          └──────┬─────────────┬──────┘
                                 │             │
                PostgreSQL Wire  │             │ S3 API
                                 ▼             ▼
       ┌───────────────────────────────┐     ┌─────────────────────────────┐
       │   PostgreSQL 16 (Port 5432)   │     │   MinIO Object Store (9000) │
       │   Workspaces, RBAC, Audits    │     │   Rasters, Overlays, Hashes │
       └───────────────────────────────┘     └─────────────────────────────┘
```

---

## 1-Click Startup

Ensure Docker and Docker Compose (v2.20+) are installed.

```bash
# 1. Clone repository
git clone https://github.com/satquery/satquery-ai.git
cd satquery-ai

# 2. Launch the full sovereign cluster
docker compose up -d

# 3. Verify service health
docker compose ps
```

Services will be online:
- **Operations Console:** [http://localhost:3000](http://localhost:3000)
- **FastAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **MinIO Storage Console:** [http://localhost:9001](http://localhost:9001) (User: `satquery_s3_admin`, Pass: `satquery_s3_secret`)
- **PostgreSQL Database:** `localhost:5432` (`satquery` / `satquery_secret_pass`)

---

## Environment Variables

| Variable | Description | Default in Docker Compose |
| :--- | :--- | :--- |
| `SATQUERY_ENVIRONMENT` | Set `development` for local or `production` for strict security checks | `development` |
| `SATQUERY_DATABASE_URL` | PostgreSQL connection string | `postgresql://satquery:satquery_secret_pass@db:5432/satquery` |
| `SATQUERY_OBJECT_STORAGE_BUCKET` | S3 bucket name for GeoTIFFs and overlays | `satquery` |
| `SATQUERY_OBJECT_STORAGE_ENDPOINT_URL`| MinIO endpoint inside the container network | `http://storage:9000` |
| `SATQUERY_VLM_BACKEND` | `mock`, `local` (PyTorch CUDA), or `mlx` (Apple Silicon) | `mock` |

---

## Air-Gapped Network Operation

1. **Local GeoTIFF Ingestion**: In an isolated network without internet access to Planetary Computer, analysts upload GeoTIFF / COG files directly via the **Upload** action in the top bar.
2. **Deterministic Provenance**: Every uploaded raster is SHA-256 hashed and preserved in the local MinIO bucket with immutable chain-of-custody logs stored in PostgreSQL.
3. **Data Classification**: Workspace and project data classifications (`UNCLASSIFIED`, `RESTRICTED`, `CONFIDENTIAL`) are enforced strictly within the local database.
