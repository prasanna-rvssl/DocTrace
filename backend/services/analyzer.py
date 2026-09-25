import json
import re
import ollama


def clean_text(text):
    """Clean extracted PDF text."""

    if not text:
        return ""

    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_dates(text):
    """Find common date patterns."""

    patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b"
    ]

    dates = []

    for pattern in patterns:
        dates.extend(
            re.findall(
                pattern,
                text,
                re.IGNORECASE
            )
        )

    return list(dict.fromkeys(dates))


def extract_amounts(text):
    """
    Find real financial amounts.

    Avoid incomplete values such as:
    'rs,' or 'rs. 3'
    """

    patterns = [
        r"\b(?:₹|Rs\.?|INR)\s*[0-9][0-9,]*(?:\.[0-9]+)?\b",
        r"\b(?:\$|USD)\s*[0-9][0-9,]*(?:\.[0-9]+)?\b",
        r"\b(?:€|EUR)\s*[0-9][0-9,]*(?:\.[0-9]+)?\b"
    ]

    amounts = []

    for pattern in patterns:

        matches = re.findall(
            pattern,
            text,
            re.IGNORECASE
        )

        for match in matches:

            cleaned = match.strip()

            # Make sure there is an actual digit
            if not re.search(
                r"\d",
                cleaned
            ):
                continue

            amounts.append(cleaned)

    return list(
        dict.fromkeys(amounts)
    )


def extract_deadlines(text):
    """Find simple deadline/payment-period expressions."""

    patterns = [
        r"\bwithin\s+\d+\s+(?:days?|weeks?|months?)\b",
        r"\b\d+\s+(?:days?|weeks?|months?)\s+(?:from|after)\b"
    ]

    deadlines = []

    for pattern in patterns:

        deadlines.extend(
            re.findall(
                pattern,
                text,
                re.IGNORECASE
            )
        )

    return list(
        dict.fromkeys(deadlines)
    )


def create_basic_extractions(pages):
    """
    Create reliable deterministic extractions
    from the PDF.
    """

    extractions = []

    for page in pages:

        page_number = page["page"]
        text = clean_text(
            page["text"]
        )

        if not text:
            continue

        # -------------------------
        # Dates
        # -------------------------

        for date in extract_dates(text):

            extractions.append({
                "type": "date",
                "label": "Date",
                "value": date,
                "confidence": 0.98,
                "page": page_number,
                "section": None,
                "source_text": date
            })

        # -------------------------
        # Financial amounts
        # -------------------------

        for amount in extract_amounts(text):

            extractions.append({
                "type": "financial_amount",
                "label": "Financial Amount",
                "value": amount,
                "confidence": 0.98,
                "page": page_number,
                "section": None,
                "source_text": amount
            })

        # -------------------------
        # Deadlines
        # -------------------------

        for deadline in extract_deadlines(text):

            extractions.append({
                "type": "payment_deadline",
                "label": "Deadline",
                "value": deadline,
                "confidence": 0.95,
                "page": page_number,
                "section": None,
                "source_text": deadline
            })

    return extractions


def clean_ai_extraction(item, page_number):
    """
    Validate and clean one AI extraction.
    """

    if not isinstance(item, dict):
        return None

    value = item.get("value")
    source_text = item.get(
        "source_text"
    )

    # Reject empty values
    if value is None:
        return None

    if source_text is None:
        return None

    value = str(value).strip()
    source_text = str(
        source_text
    ).strip()

    # Reject useless placeholder values
    invalid_values = {
        "",
        "none",
        "null",
        "unknown",
        "n/a",
        "not specified",
        "not available"
    }

    if value.lower() in invalid_values:
        return None

    if source_text.lower() in invalid_values:
        return None

    # Reject generic AI categories
    item_type = str(
        item.get("type", "")
    ).strip().lower()

    invalid_types = {
        "",
        "string",
        "information",
        "label"
    }

    if item_type in invalid_types:
        return None

    # Confidence must be numeric
    confidence = item.get(
        "confidence",
        0.7
    )

    try:
        if isinstance(
            confidence,
            str
        ):
            confidence_lower = (
                confidence.lower()
            )

            confidence_map = {
                "high": 0.9,
                "medium": 0.7,
                "low": 0.4
            }

            confidence = confidence_map.get(
                confidence_lower,
                0.7
            )

        confidence = float(
            confidence
        )

    except (
        TypeError,
        ValueError
    ):
        confidence = 0.7

    confidence = max(
        0.0,
        min(
            1.0,
            confidence
        )
    )

    item["value"] = value
    item["source_text"] = source_text
    item["confidence"] = confidence
    item["page"] = page_number

    if item.get("section") in [
        None,
        "",
        "None",
        "none"
    ]:
        item["section"] = None

    return item


def clean_ai_risk(item, page_number):
    """
    Validate and clean one AI-generated risk.
    """

    if not isinstance(item, dict):
        return None

    title = str(
        item.get("title", "")
    ).strip()

    description = str(
        item.get("description", "")
    ).strip()

    source_text = str(
        item.get("source_text", "")
    ).strip()

    if not title:
        return None

    if not description:
        return None

    if not source_text:
        return None

    # Reject placeholder source text
    if source_text.lower() in [
        "none",
        "null",
        "n/a"
    ]:
        return None

    severity = str(
        item.get(
            "severity",
            "low"
        )
    ).lower().strip()

    if severity not in [
        "low",
        "medium",
        "high"
    ]:
        severity = "low"

    item["severity"] = severity
    item["page"] = page_number
    item["source_text"] = source_text

    return item


def analyze_page_with_ai(page):
    """
    Use Ollama for meaningful semantic information
    from one page at a time.
    """

    page_number = page["page"]
    text = clean_text(
        page["text"]
    )

    if not text:
        return {
            "document_type": "Unknown",
            "extractions": [],
            "risks": []
        }

    # Keep the AI workload manageable
    text = text[:8000]

    prompt = f"""
You are DocTrace, a document intelligence system.

Analyze ONLY this document page.

PAGE NUMBER:
{page_number}

DOCUMENT TEXT:
{text}

Extract ONLY information explicitly present on this page.

Focus on:

- important parties or organizations
- payment terms
- obligations
- genuinely missing required information
- genuine contradictions or inconsistencies

IMPORTANT:

Do NOT summarize normal content.

Do NOT treat questions in the document as
missing information.

Do NOT treat ordinary business discussion
as a risk.

Do NOT invent information.

Do NOT return placeholder values such as:
"None", "Unknown", "N/A", or "Not specified".

Do NOT create generic extraction types such as:
"string", "information", or "label".

Only create an extraction when there is
specific useful information.

Every extraction MUST contain:

type
label
value
confidence
page
section
source_text

Every risk MUST contain:

type
title
severity
description
page
source_text

Only report a risk if there is an actual:

- contradiction
- conflicting statement
- missing required information
- inconsistent amount
- inconsistent date

Do NOT report a risk merely because the
document discusses different opinions.

Severity must be:

low
medium
high

Return ONLY JSON.

Use exactly:

{{
    "document_type": "string",

    "extractions": [],

    "risks": []
}}
"""

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

        start = result.find("{")
        end = result.rfind("}")

        if start == -1 or end == -1:

            return {
                "document_type": "Unknown",
                "extractions": [],
                "risks": []
            }

        result = result[
            start:end + 1
        ]

        data = json.loads(
            result
        )

        valid_extractions = []

        for item in data.get(
            "extractions",
            []
        ):

            cleaned = clean_ai_extraction(
                item,
                page_number
            )

            if cleaned:
                valid_extractions.append(
                    cleaned
                )

        valid_risks = []

        for item in data.get(
            "risks",
            []
        ):

            cleaned = clean_ai_risk(
                item,
                page_number
            )

            if cleaned:
                valid_risks.append(
                    cleaned
                )

        return {
            "document_type": data.get(
                "document_type",
                "Unknown"
            ),
            "extractions": valid_extractions,
            "risks": valid_risks
        }

    except Exception as error:

        print(
            f"AI analysis failed for page "
            f"{page_number}: {error}"
        )

        return {
            "document_type": "Unknown",
            "extractions": [],
            "risks": []
        }


def analyze_document(pages):
    """
    Analyze the document using:

    1. Deterministic extraction
    2. Lightweight page-level AI
    """

    all_extractions = []
    all_risks = []

    document_type = "Unknown"

    # --------------------------------
    # Reliable deterministic extraction
    # --------------------------------

    basic_extractions = (
        create_basic_extractions(
            pages
        )
    )

    all_extractions.extend(
        basic_extractions
    )

    # --------------------------------
    # Limited AI analysis
    # --------------------------------

    max_ai_pages = 3

    pages_to_analyze = pages[
        :max_ai_pages
    ]

    for page in pages_to_analyze:

        print(
            f"Analyzing page "
            f"{page['page']} with AI..."
        )

        result = analyze_page_with_ai(
            page
        )

        page_type = result.get(
            "document_type",
            "Unknown"
        )

        if (
            document_type == "Unknown"
            and page_type
            and page_type != "Unknown"
        ):
            document_type = page_type

        all_extractions.extend(
            result.get(
                "extractions",
                []
            )
        )

        all_risks.extend(
            result.get(
                "risks",
                []
            )
        )

    return {
        "document_type": document_type,
        "extractions": all_extractions,
        "risks": all_risks
    }