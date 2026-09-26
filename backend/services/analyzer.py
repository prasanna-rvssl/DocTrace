import re


MONTH = r"January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
DATE_PATTERN = re.compile(
    rf"\b(?:\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}|\d{{4}}-\d{{2}}-\d{{2}}|\d{{1,2}}\s+(?:{MONTH})\.?\s+\d{{4}}|(?:{MONTH})\.?\s+\d{{1,2}},?\s+\d{{4}})\b",
    re.IGNORECASE,
)
AMOUNT_PATTERN = re.compile(
    r"(?:₹\s*|\b(?:Rs\.?|INR|USD|EUR)\s*|[$€]\s*)[0-9][0-9,]*(?:\.[0-9]+)?",
    re.IGNORECASE,
)
_NUMBER = r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)(?:\s*\(\s*\d+\s*\))?"
_DURATION = rf"{_NUMBER}\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?)"
DEADLINE_PATTERN = re.compile(
    rf"\b(?:at least\s+{_DURATION}\s+before|within\s+{_DURATION}|{_DURATION}\s+(?:from|after|of|before)|net\s+{_NUMBER})\b",
    re.IGNORECASE,
)
OBLIGATION_PATTERN = re.compile(
    r"\b(?:shall|must|is required to|are required to|agrees to|undertakes to|will)\b",
    re.IGNORECASE,
)
SECTION_HEADING = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+(.{2,120})$")
SECTION_PREFIX = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+[A-Z]")
SECTION_INLINE = re.compile(r"\b(?:section|clause)\s+(\d+(?:\.\d+)*)\b", re.IGNORECASE)


def clean_text(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _sentences(block_text):
    text = clean_text(block_text)
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text) if part.strip()]


def _section(text, active_section=None):
    inline = SECTION_INLINE.search(text)
    heading = SECTION_HEADING.match(text)
    prefix = SECTION_PREFIX.match(text)
    return inline.group(1) if inline else (heading.group(1) if heading else (prefix.group(1) if prefix else active_section))


def _extraction(kind, label, value, page, section, evidence, confidence, bbox=None):
    result = {
        "type": kind,
        "label": label,
        "value": value,
        "confidence": confidence,
        "page": page,
        "section": section,
        "source_text": evidence[:700],
    }
    if bbox:
        result["bbox"] = bbox
    return result


def detect_document_type(pages):
    first_page = clean_text(pages[0].get("text", "")).lower() if pages else ""
    all_text = " ".join(page.get("text", "") for page in pages).lower()
    if re.search(r"\b(invoice|tax invoice)\b", first_page[:500]):
        return "Invoice"
    if "employment agreement" in first_page or "employment agreement" in all_text[:2000]:
        return "Employment Agreement"
    if "lease agreement" in first_page or "lessor" in first_page and "lessee" in first_page:
        return "Lease Agreement"
    if any(term in first_page for term in ("non-disclosure agreement", "confidentiality agreement")):
        return "Non-Disclosure Agreement"
    if "service agreement" in first_page or "master service agreement" in first_page:
        return "Service Agreement"
    if any(term in all_text for term in ("purchase order", "order number", "bill to")):
        return "Purchase Order"
    if any(term in all_text for term in ("agreement", "contract", "hereby agree")):
        return "Contract"
    if "report" in first_page[:250]:
        return "Report"
    return "Document"


def extract_parties(pages):
    if not pages:
        return []
    text = pages[0].get("text", "")
    parties = []
    # Common legal entity endings make a conservative party heuristic.
    entity = r"([A-Z][A-Za-z0-9&.,' -]{1,70}?\b(?:Inc\.?|Incorporated|Corporation|Corp\.?|LLC|L\.L\.C\.?|(?:Pvt\.?\s+)?Ltd\.?|Private Limited|Limited|LLP|PLC|GmbH))(?=$|[\s,;])"
    for match in re.finditer(entity, text):
        name = clean_text(match.group(1)).strip(" .,:;\n")
        name = re.sub(r"\s+(?:will|shall|must|is|are|provides?|engages?)\b.*$", "", name, flags=re.IGNORECASE).strip(" .,:;")
        if name and name.casefold() not in {item["value"].casefold() for item in parties}:
            parties.append({
                "value": name,
                "page": 1,
                "section": None,
                "source_text": match.group(0).strip(),
                "confidence": 0.78,
            })
    return parties[:8]


def _title(pages):
    if not pages:
        return "Document"
    lines = [clean_text(line) for line in pages[0].get("text", "").splitlines() if clean_text(line)]
    for line in lines[:12]:
        lower = line.lower()
        if any(key in lower for key in ("agreement", "contract", "invoice", "purchase order", "policy", "report")):
            return line[:180]
    return lines[0][:180] if lines else "Document"


def _date_kind(evidence):
    lower = evidence.lower()
    if any(word in lower for word in ("effective date", "commencement date", "start date", "begins on")):
        return "start_date", "Start Date"
    if any(word in lower for word in ("renewal date", "renews on", "renewal term")):
        return "renewal_date", "Renewal Date"
    if any(word in lower for word in ("expires on", "expiration date", "expiry date", "end date", "terminates on")):
        return "end_date", "Expiration Date"
    if any(word in lower for word in ("invoice date", "issued on", "dated")):
        return "document_date", "Document Date"
    return "date", "Important Date"


def _amount_kind(evidence):
    lower = evidence.lower()
    if any(word in lower for word in ("contract value", "total contract", "professional service fee", "total fee", "agreement value")):
        return "contract_value", "Contract Value"
    if "subtotal" in lower:
        return "subtotal", "Subtotal"
    if re.search(r"\b(?:tax|vat|gst)\b", lower):
        return "tax_amount", "Tax Amount"
    if re.search(r"\b(?:grand total|total due|amount due|invoice total|total amount)\b", lower):
        return "total_amount", "Total Amount"
    if any(word in lower for word in ("payment", "invoice", "payable", "deposit", "installment", "instalment")):
        return "payment_amount", "Payment Amount"
    return "financial_amount", "Financial Amount"


def _missing_information(document_type, full_text):
    text = full_text.lower()
    checks = {
        "Contract": [
            ("Parties", ("between", "customer", "provider", "parties")),
            ("Effective date", ("effective date", "commencement date", "begins on")),
            ("Payment terms", ("payment", "invoice", "net ")),
            ("Term or expiration", ("term", "expires", "expiration", "terminates")),
            ("Late-payment terms", ("late payment fee", "late-payment fee", "interest on overdue", "interest for late payment", "late payment penalty")),
        ],
        "Service Agreement": [
            ("Parties", ("between", "customer", "provider", "parties")),
            ("Effective date", ("effective date", "commencement date", "begins on")),
            ("Payment terms", ("payment", "invoice", "net ")),
            ("Term or expiration", ("term", "expires", "expiration", "terminates")),
            ("Late-payment terms", ("late payment fee", "late-payment fee", "interest on overdue", "interest for late payment", "late payment penalty")),
        ],
        "Invoice": [
            ("Invoice number", ("invoice number", "invoice no", "invoice #")),
            ("Invoice date", ("invoice date", "date issued", "issued on")),
            ("Vendor", ("vendor", "seller", "from:")),
            ("Customer", ("bill to", "customer", "buyer")),
            ("Total amount", ("total", "amount due", "balance due")),
            ("Payment terms", ("payment terms", "due date", "net ")),
        ],
    }
    profile = checks.get(document_type, [])
    return [label for label, terms in profile if not any(term in text for term in terms)]


def analyze_document(pages):
    """Extract traceable fields from every page of a text-based PDF."""
    extractions = []
    obligations = []
    full_text = "\n".join(page.get("text", "") for page in pages)
    document_type = detect_document_type(pages)

    for page in pages:
        page_number = page.get("page", 1)
        blocks = page.get("blocks") or [{"text": page.get("text", ""), "bbox": None}]
        active_section = None
        for block in blocks:
            block_text = block.get("text", "")
            section = _section(clean_text(block_text), active_section)
            if SECTION_HEADING.match(clean_text(block_text)):
                active_section = section
                continue
            bbox = block.get("bbox")
            for evidence in _sentences(block_text):
                heading = SECTION_HEADING.match(evidence)
                if heading:
                    active_section = heading.group(1)
                section = _section(evidence, active_section)
                for match in DATE_PATTERN.finditer(evidence):
                    kind, label = _date_kind(evidence)
                    extractions.append(_extraction(kind, label, match.group(0), page_number, section, evidence, 0.84, bbox))

                for match in AMOUNT_PATTERN.finditer(evidence):
                    kind, label = _amount_kind(evidence)
                    value = match.group(0).strip().rstrip(",;:")
                    extractions.append(_extraction(kind, label, value, page_number, section, evidence, 0.9, bbox))

                for match in DEADLINE_PATTERN.finditer(evidence):
                    label = "Payment Deadline" if re.search(r"payment|invoice|pay|net", evidence, re.IGNORECASE) else "Deadline"
                    kind = "payment_deadline" if label == "Payment Deadline" else "deadline"
                    extractions.append(_extraction(kind, label, match.group(0).strip(), page_number, section, evidence, 0.86, bbox))

                if OBLIGATION_PATTERN.search(evidence) and len(evidence) >= 25:
                    item = _extraction("obligation", "Obligation", evidence, page_number, section, evidence, 0.72, bbox)
                    extractions.append(item)
                    obligations.append({key: item[key] for key in ("value", "page", "section", "source_text", "confidence")})

    unique = []
    seen = set()
    for item in extractions:
        key = (item["type"], item["value"].casefold(), item["page"], item["source_text"].casefold())
        if key not in seen:
            unique.append(item)
            seen.add(key)

    parties = extract_parties(pages)
    for party in parties:
        unique.append(_extraction("party", "Party", party["value"], party["page"], party["section"], party["source_text"], party["confidence"]))

    missing_fields = _missing_information(document_type, full_text)
    return {
        "document_type": document_type,
        "title": _title(pages),
        "parties": parties,
        "extractions": unique,
        "obligations": obligations,
        "missing_fields": missing_fields,
        "risks": [],
    }
