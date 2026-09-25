import os
import json
import re
import ollama

from fastapi import APIRouter
from pydantic import BaseModel

from services.document_parser import extract_pages


router = APIRouter(
    prefix="/api",
    tags=["Chat"]
)


DOCUMENT_STORAGE = "storage/documents"


class ChatRequest(BaseModel):
    document_id: str
    question: str


def find_relevant_pages(pages, question):
    """
    Find pages that are most relevant to the user's question.
    """

    question_words = set(
        re.findall(
            r"\b[a-zA-Z]{3,}\b",
            question.lower()
        )
    )

    scored_pages = []

    for page in pages:

        text = page.get(
            "text",
            ""
        )

        text_lower = text.lower()

        score = 0

        for word in question_words:

            if word in text_lower:
                score += 1

        scored_pages.append({
            "page": page["page"],
            "text": text,
            "score": score
        })

    # Highest scoring pages first
    scored_pages.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    # Keep only useful pages
    relevant = [
        page
        for page in scored_pages
        if page["score"] > 0
    ][:5]

    # If nothing matched, use first few pages
    if not relevant:
        relevant = scored_pages[:3]

    return relevant


@router.post("/chat")
async def chat_with_document(
    request: ChatRequest
):

    # --------------------------------
    # Find stored PDF
    # --------------------------------

    file_path = os.path.join(
        DOCUMENT_STORAGE,
        f"{request.document_id}.pdf"
    )

    if not os.path.exists(file_path):

        return {
            "answer": "Document not found.",
            "confidence": 0.0,
            "evidence": []
        }

    # --------------------------------
    # Extract pages
    # --------------------------------

    pages = extract_pages(
        file_path
    )

    if not pages:

        return {
            "answer": "The document contains no readable text.",
            "confidence": 0.0,
            "evidence": []
        }

    # --------------------------------
    # Find relevant pages
    # --------------------------------

    relevant_pages = find_relevant_pages(
        pages,
        request.question
    )

    # --------------------------------
    # Prepare document context
    # --------------------------------

    document_context = ""

    for page in relevant_pages:

        page_text = page["text"].strip()

        # Keep each page manageable
        page_text = page_text[:6000]

        document_context += (
            f"\n\nPAGE {page['page']}:\n"
            f"{page_text}"
        )

    # --------------------------------
    # AI prompt
    # --------------------------------

    prompt = f"""
You are DocTrace, an AI document intelligence assistant.

Answer the user's question using ONLY the provided
document pages.

USER QUESTION:
{request.question}

DOCUMENT PAGES:
{document_context}

IMPORTANT RULES:

1. Answer only from the document.
2. Do not invent information.
3. If the answer is not present, say:
   "The answer could not be found in the document."
4. Every answer must have evidence.
5. Evidence must use the correct page number.
6. source_text must be copied from the document.
7. Keep the answer concise.
8. Confidence must be between 0.0 and 1.0.
9. Return at least one evidence item when the answer
   is supported by the document.

Return ONLY valid JSON.

Use EXACTLY this structure:

{{
    "answer": "Your answer here",
    "confidence": 0.90,
    "evidence": [
        {{
            "page": 1,
            "section": null,
            "source_text": "Exact text copied from the document"
        }}
    ]
}}
"""

    # --------------------------------
    # Ask Ollama
    # --------------------------------

    try:

        response = ollama.chat(
            model="llama3.2",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            format="json"
        )

        result = response[
            "message"
        ][
            "content"
        ].strip()

        print(
            "Chat AI response:",
            result
        )

    except Exception as error:

        print(
            "Chat AI error:",
            error
        )

        return {
            "answer": "Unable to generate an answer.",
            "confidence": 0.0,
            "evidence": []
        }

    # --------------------------------
    # Parse JSON
    # --------------------------------

    try:

        start = result.find("{")
        end = result.rfind("}")

        if start == -1 or end == -1:

            return {
                "answer": result,
                "confidence": 0.0,
                "evidence": []
            }

        result = result[
            start:end + 1
        ]

        data = json.loads(
            result
        )

    except json.JSONDecodeError:

        return {
            "answer": "I could not generate a structured answer.",
            "confidence": 0.0,
            "evidence": []
        }

    # --------------------------------
    # Validate response
    # --------------------------------

    answer = data.get(
        "answer",
        ""
    )

    confidence = data.get(
        "confidence",
        0.0
    )

    evidence = data.get(
        "evidence",
        []
    )

    if not answer:

        answer = (
            "The answer could not be found "
            "in the document."
        )

    try:

        confidence = float(
            confidence
        )

    except (
        TypeError,
        ValueError
    ):

        confidence = 0.0

    confidence = max(
        0.0,
        min(
            1.0,
            confidence
        )
    )

    if not isinstance(
        evidence,
        list
    ):

        evidence = []

    return {
        "answer": answer,
        "confidence": confidence,
        "evidence": evidence
    }