import os
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from starlette.concurrency import run_in_threadpool
import fitz

from services.analyzer import analyze_document
from services.anomaly_detector import detect_anomalies
from services.document_parser import extract_pages


router = APIRouter(prefix="/api", tags=["Analysis"])
BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
DOCUMENT_STORAGE = BACKEND_ROOT / "storage" / "documents"
DEMO_SOURCE = PROJECT_ROOT / "frontend" / "assets" / "demo_master_service_agreement.pdf"
DEMO_DOCUMENT_ID = "demo-master-service-agreement"
DOCUMENT_STORAGE.mkdir(parents=True, exist_ok=True)


def _response_for(file_path: Path, filename: str, document_id: str):
    pages = extract_pages(str(file_path))
    if not any(page.get("text", "").strip() for page in pages):
        raise HTTPException(
            status_code=422,
            detail="This PDF has no selectable text. Scanned PDFs need OCR, which is not enabled yet.",
        )

    analysis = analyze_document(pages)
    extractions = analysis["extractions"]
    risks = detect_anomalies(extractions)

    for field in analysis["missing_fields"]:
        if "payment" in field.lower() or "late" in field.lower():
            evidence_item = next((item for item in extractions if item.get("type") == "payment_deadline"), None)
        else:
            evidence_item = next((item for item in extractions if item.get("page") == 1), None)
        risks.append({
            "type": "missing_information",
            "title": f"{field} not found",
            "severity": "medium",
            "description": f"No explicit {field.lower()} was detected in the reviewed document text. Review whether this term is needed.",
            "page": evidence_item.get("page", 1) if evidence_item else 1,
            "section": evidence_item.get("section") if evidence_item else None,
            "source_text": evidence_item.get("source_text", "") if evidence_item else "",
        })

    deadline_types = {"deadline", "payment_deadline"}
    financial_types = {"contract_value", "subtotal", "tax_amount", "total_amount", "payment_amount", "financial_amount"}
    confidence_values = [item["confidence"] for item in extractions if item.get("confidence") is not None]

    return {
        "document_id": document_id,
        "pdf_url": f"/api/documents/{document_id}/file",
        "document": {
            "filename": filename,
            "title": analysis["title"],
            "document_type": analysis["document_type"],
            "pages": len(pages),
            "parties": analysis["parties"],
        },
        "summary": {
            "deadlines": sum(item["type"] in deadline_types for item in extractions),
            "financial_values": sum(item["type"] in financial_types for item in extractions),
            "obligations": len(analysis["obligations"]),
            "risk_flags": len(risks),
            "missing_fields": len(analysis["missing_fields"]),
        },
        "confidence": round(sum(confidence_values) / len(confidence_values), 2) if confidence_values else 0,
        "extractions": extractions,
        "obligations": analysis["obligations"],
        "missing_fields": analysis["missing_fields"],
        "risks": risks,
    }


@router.post("/analyze")
async def analyze_document_endpoint(file: UploadFile = File(...)):
    filename = Path(file.filename or "document.pdf").name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are currently supported.")

    document_id = str(uuid.uuid4())
    file_path = DOCUMENT_STORAGE / f"{document_id}.pdf"
    header = await file.read(5)
    await file.seek(0)
    if header != b"%PDF-":
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

    try:
        await run_in_threadpool(_copy_upload, file.file, file_path)
        return await run_in_threadpool(_response_for, file_path, filename, document_id)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


def _copy_upload(source, destination):
    with destination.open("wb") as buffer:
        shutil.copyfileobj(source, buffer)


@router.get("/demo")
async def analyze_demo_document():
    if not DEMO_SOURCE.is_file():
        raise HTTPException(status_code=404, detail="The bundled DocTrace demo PDF is missing.")
    stored_path = DOCUMENT_STORAGE / f"{DEMO_DOCUMENT_ID}.pdf"
    if not stored_path.is_file() or stored_path.stat().st_mtime_ns < DEMO_SOURCE.stat().st_mtime_ns:
        await run_in_threadpool(shutil.copyfile, DEMO_SOURCE, stored_path)
    return await run_in_threadpool(_response_for, stored_path, DEMO_SOURCE.name, DEMO_DOCUMENT_ID)


@router.get("/documents/{document_id}/file")
async def get_document(document_id: str):
    if not document_id or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" for char in document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    file_path = DOCUMENT_STORAGE / f"{document_id}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    return FileResponse(file_path, media_type="application/pdf")


@router.get("/documents/{document_id}/pages/{page_number}.png")
async def get_document_page(document_id: str, page_number: int, scale: float = 1.5):
    if not document_id or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" for char in document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    file_path = DOCUMENT_STORAGE / f"{document_id}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    if not 0.75 <= scale <= 3:
        raise HTTPException(status_code=400, detail="Scale must be between 0.75 and 3.")
    image = await run_in_threadpool(_render_pdf_page, file_path, page_number, scale)
    return Response(content=image, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


def _render_pdf_page(file_path: Path, page_number: int, scale: float) -> bytes:
    with fitz.open(file_path) as pdf:
        if page_number < 1 or page_number > pdf.page_count:
            raise HTTPException(status_code=404, detail="PDF page not found.")
        page = pdf.load_page(page_number - 1)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        return pixmap.tobytes("png")
