def detect_anomalies(extractions):
    """
    Detect only meaningful potential inconsistencies
    in extracted document information.
    """

    risks = []

    # Ignore empty or invalid extractions
    valid_items = []

    for item in extractions:

        if not isinstance(item, dict):
            continue

        value = item.get("value")
        source_text = item.get("source_text")

        if not value or not source_text:
            continue

        valid_items.append(item)

    # Group extractions by meaningful type
    grouped = {}

    for item in valid_items:

        item_type = item.get(
            "type",
            ""
        ).lower().strip()

        # Ignore generic AI types
        if item_type in [
            "",
            "string",
            "information"
        ]:
            continue

        grouped.setdefault(
            item_type,
            []
        ).append(item)

    # Detect genuinely different values
    # for the same meaningful field.
    for item_type, items in grouped.items():

        values = set()

        for item in items:

            value = str(
                item.get("value", "")
            ).strip().lower()

            if value:
                values.add(value)

        if len(values) <= 1:
            continue

        # Only flag fields where conflicting
        # values are actually meaningful.
        allowed_conflict_types = [
            "date",
            "deadline",
            "payment_deadline",
            "financial_amount",
            "payment_amount",
            "payment_terms"
        ]

        if item_type not in allowed_conflict_types:
            continue

        first_item = items[0]

        risks.append({
            "type": "conflicting_information",

            "title": (
                "Potential Conflicting "
                "Information"
            ),

            "severity": "medium",

            "description": (
                f"Multiple different values were "
                f"detected for "
                f"{item_type.replace('_', ' ')}. "
                f"Review the referenced clauses."
            ),

            "page": first_item.get(
                "page"
            ),

            "source_text": first_item.get(
                "source_text",
                ""
            )
        })

    # Check low-confidence items,
    # but only when they contain real evidence.
    for item in valid_items:

        confidence = item.get(
            "confidence",
            1.0
        )

        try:
            confidence = float(
                confidence
            )
        except (
            TypeError,
            ValueError
        ):
            confidence = 1.0

        if confidence >= 0.60:
            continue

        item_type = item.get(
            "type",
            ""
        ).lower().strip()

        # Ignore generic AI categories.
        if item_type in [
            "",
            "string",
            "information"
        ]:
            continue

        risks.append({
            "type": "low_confidence_extraction",

            "title": (
                "Information Requires Review"
            ),

            "severity": "low",

            "description": (
                "This information was extracted "
                "with relatively low confidence "
                "and should be reviewed against "
                "the original document."
            ),

            "page": item.get(
                "page"
            ),

            "source_text": item.get(
                "source_text",
                ""
            )
        })

    return risks