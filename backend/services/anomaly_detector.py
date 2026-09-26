import re
from collections import defaultdict


def _amount_number(value):
    digits = re.sub(r"[^0-9.]", "", str(value or ""))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def _risk(kind, title, severity, description, item):
    return {
        "type": kind,
        "title": title,
        "severity": severity,
        "description": description,
        "page": item.get("page"),
        "section": item.get("section"),
        "source_text": item.get("source_text", ""),
    }


def detect_anomalies(extractions):
    """Flag only repeated, semantically comparable values and explicit arithmetic totals."""
    risks = []
    grouped = defaultdict(list)
    for item in extractions:
        if not isinstance(item, dict) or not item.get("value"):
            continue
        if item.get("type") in {"start_date", "end_date", "renewal_date", "contract_value", "payment_amount"}:
            grouped[item["type"]].append(item)

    for field_type, items in grouped.items():
        distinct = {str(item["value"]).casefold() for item in items}
        if len(distinct) > 1:
            label = items[0].get("label", field_type.replace("_", " "))
            risks.append(_risk(
                "conflicting_information",
                f"Potentially conflicting {label.lower()}",
                "medium",
                "More than one value was found for this field. Review the source clauses to confirm whether they conflict.",
                items[-1],
            ))

    amounts = defaultdict(list)
    for item in extractions:
        if item.get("type") in {"subtotal", "tax_amount", "total_amount"}:
            amount = _amount_number(item.get("value"))
            if amount is not None:
                amounts[item["type"]].append((amount, item))
    if all(kind in amounts for kind in ("subtotal", "tax_amount", "total_amount")):
        subtotal, _ = amounts["subtotal"][-1]
        tax, _ = amounts["tax_amount"][-1]
        total, item = amounts["total_amount"][-1]
        if abs((subtotal + tax) - total) > 0.01:
            risks.append(_risk(
                "calculation_inconsistency",
                "Potential calculation inconsistency",
                "high",
                f"The listed subtotal plus tax is {subtotal + tax:,.2f}, while the listed total is {total:,.2f}. Review the figures and source lines.",
                item,
            ))
    return risks
