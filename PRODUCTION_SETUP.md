# SOLEN production setup

The frontend deploys to Vercel. The FastAPI compute service must run separately
where it can execute raster processing, CV models, and scheduled monitor jobs.
Do not put any private credentials in Vercel variables prefixed with
`NEXT_PUBLIC_`.

## 1. Firebase Authentication

Create a Firebase Web App and enable the intended sign-in methods (Google and
Email/Password are supported by the UI). Copy the four public web settings into
`frontend/.env.local` from `frontend/.env.local.example`.

Create a Firebase Admin service account for the API. Put its JSON document in
the deployment secret `SATQUERY_FIREBASE_CREDENTIALS`, then set its project ID
in `SATQUERY_FIREBASE_PROJECT_ID`. The API validates ID tokens server-side;
roles are never trusted from the browser.

## 2. PostgreSQL

Provision PostgreSQL and set `SATQUERY_DATABASE_URL`. On first API startup,
SOLEN creates the tenant schema: workspaces, membership roles, projects,
and immutable audit events. The owner of a newly created workspace becomes its
admin. Roles are `viewer`, `analyst`, `reviewer`, and `admin`.

## 3. S3 or Cloudflare R2

Create a private bucket and an access key limited to the configured prefix.
Set the object-storage variables in `backend/.env.example`. AWS S3 needs no
endpoint; R2 needs its account endpoint and commonly uses `auto` as region.

Scenes are content-hashed on ingestion. The GeoTIFF, thumbnail, overlays, and
provenance manifest are written to object storage. A local API disk cache is
used only so Rasterio/CV can process files efficiently after download.

## 4. Production guard

Set `SATQUERY_ENVIRONMENT=production` only when Firebase, PostgreSQL, object
storage, and a non-mock VLM backend are configured. The API intentionally
fails at boot when any of these are absent; it will not fall back to shared
local storage, simulated identity, or a mock AI model.

## 5. What needs a provider decision later

Alert delivery (email/SMS/Slack/webhooks), commercial imagery tasking, and
SSO/SAML are not enabled because no provider or credentials were selected.
They are deliberately not represented as working controls. The existing
Copernicus ingestion remains available where its public service is reachable.
