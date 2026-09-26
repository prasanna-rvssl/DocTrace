# Hackathon deployment

## Render API

1. Create a Render Web Service from this repository and use the included `render.yaml` Blueprint.
2. Set `FRONTEND_ORIGIN` to the Vercel production URL in the Render dashboard. Vercel preview URLs are also allowed by the API CORS rule.
3. Render installs `backend/requirements.txt` and starts FastAPI with the Render-provided port.

## Vercel frontend

1. Import the repository into Vercel and set the project root directory to `frontend` (framework preset: Other; no build command is needed).
2. In `frontend/js/config.js`, set `window.DOC_TRACE_API_URL` to the Render service URL, for example `https://doctrace-api.onrender.com`.

PDF parsing and extraction run in the API process. The included service stores uploaded PDFs on its local filesystem; those files are temporary on Render unless a persistent disk is configured. Scanned PDFs that contain images without embedded text need OCR, which this app does not currently provide.
