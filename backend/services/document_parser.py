import fitz


def extract_pages(file_path: str):
    """
    Extract text from a PDF while preserving page numbers.
    """

    pages = []
    with fitz.open(file_path) as document:
        for page_number, page in enumerate(document, start=1):
            blocks = []
            for block in page.get_text("blocks"):
                if len(block) < 7 or int(block[6]) != 0:
                    continue
                text = block[4].strip()
                if not text:
                    continue
                blocks.append({
                    "text": text,
                    "bbox": [round(float(value), 2) for value in block[:4]],
                })

            pages.append({
                "page": page_number,
                "text": "\n".join(block["text"] for block in blocks),
                "blocks": blocks,
            })

    return pages
