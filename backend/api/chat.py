import os
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from services.document_parser import extract_pages


router = APIRouter(prefix="/api", tags=["Chat"])
DOCUMENT_STORAGE = str(Path(__file__).resolve().parents[1] / "storage" / "documents")
STOP_WORDS = {
    "the", "and", "for", "are", "was", "were", "what", "when", "where",
    "which", "who", "why", "how", "does", "this", "that", "with", "from",
    "about", "document", "please", "tell", "me", "you", "can", "could",
}
PAYMENT_TERMS = {"payment", "invoice", "pay", "paid", "deadline", "due", "net", "days"}


@lru_cache(maxsize=32)
def _extract_pages_cached(file_path: str, modified_ns: int, size: int):
    return extract_pages(file_path)


class ChatRequest(BaseModel):
    document_id: str
    question: str


def _rank_evidence(pages, question):
    words = {
        word for word in re.findall(r"\b[a-zA-Z0-9]{3,}\b", question.lower())
        if word not in STOP_WORDS
    }
    candidates = []
    question_is_payment = bool(words & PAYMENT_TERMS)
    for page in pages:
        # PDF extraction inserts line breaks at visual wraps; join them so answers
        # contain the full clause instead of an arbitrary line fragment.
        page_text = re.sub(r"\s*\n\s*", " ", page.get("text", ""))
        for sentence in re.split(r"(?<=[.!?])\s+", page_text):
            sentence = re.sub(r"\s+", " ", sentence).strip()
            if not sentence:
                continue
            # Don't let a numbered section title outrank the clause that follows it.
            if len(sentence) < 85 and re.match(r"^\d+(?:\.\d+)*\s+[A-Z]", sentence) and not re.search(r"\b(?:shall|must|will|within|days?|months?|years?)\b", sentence, re.I):
                continue
            sentence_words = set(re.findall(r"\b[a-zA-Z0-9]{3,}\b", sentence.lower()))
            overlap = len(words & sentence_words)
            if overlap:
                score = overlap
                if question_is_payment and re.search(r"\b(?:within|net|days?|business days?)\b", sentence, re.I):
                    score += 4
                candidates.append((score, page.get("page", 1), sentence))
    return sorted(candidates, key=lambda row: row[0], reverse=True)


@router.post("/chat")
async def chat_with_document(request: ChatRequest):
    file_path = os.path.join(DOCUMENT_STORAGE, f"{request.document_id}.pdf")
    if not os.path.exists(file_path):
        return {"answer": "Document not found.", "confidence": 0.0, "evidence": []}

    stat = os.stat(file_path)
    pages = await run_in_threadpool(
        _extract_pages_cached, file_path, stat.st_mtime_ns, stat.st_size
    )
    if not pages:
        return {"answer": "The document contains no readable text.", "confidence": 0.0, "evidence": []}

    matches = _rank_evidence(pages, request.question)
    if not matches:
        return {
            "answer": "I could not find a directly matching passage in the document.",
            "confidence": 0.0,
            "evidence": [],
        }

    score, page, passage = matches[0]
    confidence = min(0.9, 0.45 + 0.1 * score)
    return {
        "answer": passage,
        "confidence": confidence,
        "evidence": [{"page": page, "section": None, "source_text": passage[:500]}],
    }
