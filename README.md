# DocTrace

**Understand every document. Trace every insight.**

DocTrace is a PDF document review demo. It extracts selected dates, payment periods, financial values, and obligation-like passages from text-based PDFs. It links results to source pages and provides a dashboard for reviewing the original PDF alongside extracted information.

DocTrace uses a rule-based FastAPI backend. It does not require Ollama or an AI model. Its outputs are an aid to human review, not legal advice or a substitute for checking the original document.

## What it does

- Accepts PDF uploads and redirects users to a dashboard with results for that PDF.
- Provides a demo mode using the bundled 11-page service agreement at `frontend/assets/demo_master_service_agreement.pdf`.
- Extracts document type, likely parties, date patterns, currency amounts, payment periods, and sentences containing common obligation words such as `shall`, `must`, and `will`.
- Flags selected missing fields for supported contract, service agreement, and invoice types.
- Identifies multiple detected values for selected date and amount fields and compares subtotal + tax with total when all three are detected.
- Shows source text, page references, and a rendered page image from the analyzed PDF.
- Answers questions by searching the PDF text for a matching passage and returning the passage with a page reference when found.

The included demo agreement contains examples such as a ₹4,50,000 contract value and a payment period of “within 30 days” on page 7, section 4.2. The demo also includes example conflicts and a subtotal/tax/total mismatch so the review flags can be seen.

## How analysis works

1. The browser sends the selected PDF to FastAPI.
2. PyMuPDF extracts text blocks and page numbers from the PDF.
3. Python pattern rules identify supported fields and obligation-like sentences.
4. Additional rules create selected review flags, such as conflicting detected values, missing supported fields, and arithmetic mismatches.
5. FastAPI returns a JSON analysis. The browser stores the current result in `sessionStorage` and displays it on the dashboard.
6. The dashboard requests the original PDF or a PNG rendering of a requested page from the backend.

The chat is extractive text search, not generative AI: it ranks document sentences by word overlap with the question and returns the best match. The confidence values are heuristic estimates, not calibrated probabilities.

## Project structure

```text
DocTrace/
├── backend/
│   ├── api/
│   │   ├── analyze.py           # Upload, demo, PDF, and page-image endpoints
│   │   └── chat.py              # Extractive question answering endpoint
│   ├── services/
│   │   ├── analyzer.py          # Rule-based field extraction
│   │   ├── anomaly_detector.py  # Selected consistency checks
│   │   └── document_parser.py   # PDF text and page extraction
│   ├── main.py                  # FastAPI app and CORS configuration
│   └── requirements.txt
├── frontend/
│   ├── assets/                  # Bundled demo PDF
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js               # Upload flow, demo, dashboard, and chat UI
│   │   └── config.js            # Backend API base URL
│   ├── index.html               # Product homepage and demo preview
│   ├── upload.html              # PDF upload page
│   └── dashboard.html           # Analysis results and evidence viewer
├── render.yaml                  # Render API service blueprint
└── DEPLOYMENT.md                # Short deployment checklist
```

## Run locally

Use two PowerShell terminals. Run the backend first, then the frontend.

### 1. Start the backend

From the repository root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If `backend\.venv` already exists, skip the `py -m venv .venv` command. The API health response is at [http://127.0.0.1:8000/](http://127.0.0.1:8000/), and interactive API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 2. Start the frontend

Open another PowerShell terminal from the repository root:

```powershell
cd frontend
py -m http.server 5500
```

Open [http://localhost:5500](http://localhost:5500). The frontend defaults to the local API at `http://127.0.0.1:8000` in `frontend/js/config.js`.

Useful pages:

- Homepage: [http://localhost:5500/index.html](http://localhost:5500/index.html)
- Upload: [http://localhost:5500/upload.html](http://localhost:5500/upload.html)
- Demo dashboard: [http://localhost:5500/dashboard.html?mode=demo](http://localhost:5500/dashboard.html?mode=demo)

## API

The API root is `http://127.0.0.1:8000` locally. FastAPI also exposes `/docs` and `/openapi.json`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Health response |
| `POST` | `/api/analyze` | Analyze a PDF sent as multipart form data in the `file` field |
| `GET` | `/api/demo` | Analyze the bundled demo PDF |
| `GET` | `/api/documents/{document_id}/file` | Return the stored PDF |
| `GET` | `/api/documents/{document_id}/pages/{page_number}.png?scale=1.5` | Render one PDF page as PNG; supported scale is 0.75–3 |
| `POST` | `/api/chat` | Search a document for a passage related to a question |

### Chat request example

```json
{
  "document_id": "demo-master-service-agreement",
  "question": "When is payment due?"
}
```

The response includes an `answer`, a heuristic `confidence` value, and an `evidence` array with the page and source text when a matching passage is found. If no suitable passage is found, the API says so instead of generating a free-form answer.

### Analysis response

`POST /api/analyze` and `GET /api/demo` return fields including:

- `document`: filename, title, type, page count, and detected parties.
- `summary`: counts of deadlines, financial values, obligations, risk flags, and missing fields.
- `extractions`: values with type, label, source text, confidence estimate, page, and section when available.
- `obligations`: sentences containing common obligation cues.
- `missing_fields`: fields not detected for supported document profiles.
- `risks`: selected review flags with severity and source location.
- `pdf_url` and `document_id`: identifiers used by the PDF viewer and chat.

## Deployment

The repository includes a Render Blueprint for the FastAPI backend. The static frontend can be hosted on Vercel.

### Render backend

1. Connect the GitHub repository to Render and deploy from `render.yaml` (or create a Python Web Service with `backend` as the root directory).
2. Set `FRONTEND_ORIGIN` to the deployed Vercel origin, such as `https://your-project.vercel.app`.
3. Render uses `pip install -r requirements.txt` and starts the app with Uvicorn on Render’s `$PORT`.

### Vercel frontend

1. Import the same repository into Vercel and set the project root directory to `frontend`.
2. Use the **Other** framework preset. There is no frontend build step.
3. Set `window.DOC_TRACE_API_URL` in `frontend/js/config.js` to the actual Render service URL, then redeploy the frontend.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the short deployment checklist. Render currently spins down Free web services after 15 minutes without traffic; starting one after it sleeps can take about a minute. Its local filesystem is ephemeral, so uploaded files are lost after a restart, redeploy, or spin-down. See the [Render Free service limitations](https://render.com/docs/free) for current details.

## Limitations and data handling

- Only PDFs with selectable text are supported. Scanned/image-only PDFs need OCR, which is not implemented.
- Extraction and consistency checks use regular expressions and deterministic rules. They can miss content, misclassify passages, or treat contextually different values as conflicts.
- Arithmetic checking runs only when subtotal, tax, and total are all detected. It is not a general financial audit.
- Party detection, document classification, section detection, and confidence estimates are heuristic.
- Chat searches the uploaded text; it does not interpret law or provide legal advice.
- Uploaded PDFs are stored in `backend/storage/documents/` under generated IDs. This project currently has no user accounts, authorization, retention scheduler, or document deletion endpoint. Files may remain on a local server and Render’s local filesystem is not persistent by default.
- Do not upload confidential, sensitive, or personal documents to the public demo. Before handling real user documents, add appropriate authentication, access control, deletion/retention controls, privacy disclosures, and review the legal requirements for your deployment locations.

DocTrace is an automated document review aid. Always verify extracted values and flags against the original PDF and consult a qualified lawyer for legal decisions.
