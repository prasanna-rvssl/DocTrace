import os
import uuid
import shutil

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from services.document_parser import extract_pages
from services.analyzer import analyze_document
from services.anomaly_detector import detect_anomalies


router = APIRouter(
    prefix="/api",
    tags=["Analysis"]
)


DOCUMENT_STORAGE = "storage/documents"

os.makedirs(DOCUMENT_STORAGE, exist_ok=True)


@router.post("/analyze")
async def analyze_document_endpoint(
    file: UploadFile = File(...)
):

    # Only PDF files are supported
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are currently supported."
        )

    # Generate a unique document ID
    document_id = str(uuid.uuid4())

    # Save the uploaded PDF
    file_path = os.path.join(
        DOCUMENT_STORAGE,
        f"{document_id}.pdf"
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    # Extract text page by page
    pages = extract_pages(file_path)

    # Analyze the document using Ollama
    analysis = analyze_document(pages)

    # Get AI-generated extractions
    extractions = analysis.get(
        "extractions",
        []
    )

    # Get AI-generated risks
    ai_risks = analysis.get(
        "risks",
        []
    )

    # Run additional rule-based anomaly detection
    detected_risks = detect_anomalies(
        extractions
    )

    # Combine both types of risks
    risks = ai_risks + detected_risks

    return {
        "document_id": document_id,

        "document": {
            "filename": file.filename,
            "document_type": analysis.get(
                "document_type",
                "Unknown"
            ),
            "pages": len(pages)
        },

        "summary": {
            "deadlines": sum(
                1
                for item in extractions
                if "deadline" in item.get(
                    "type",
                    ""
                ).lower()
            ),

            "financial_values": sum(
                1
                for item in extractions
                if any(
                    word in item.get(
                        "type",
                        ""
                    ).lower()
                    for word in [
                        "amount",
                        "payment",
                        "financial",
                        "price",
                        "cost"
                    ]
                )
            ),

            "obligations": sum(
                1
                for item in extractions
                if "obligation" in item.get(
                    "type",
                    ""
                ).lower()
            ),

            "risk_flags": len(risks),

            "missing_fields": sum(
                1
                for item in extractions
                if "missing" in item.get(
                    "type",
                    ""
                ).lower()
            )
        },

        "extractions": extractions,

        "risks": risks
    }


@router.get("/documents/{document_id}/file")
async def get_document(
    document_id: str
):

    file_path = os.path.join(
        DOCUMENT_STORAGE,
        f"{document_id}.pdf"
    )

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    return FileResponse(
        file_path,
        media_type="application/pdf"
    )