import fitz


def extract_pages(file_path: str):
    """
    Extract text from a PDF while preserving page numbers.
    """

    document = fitz.open(file_path)

    pages = []

    for page_number, page in enumerate(document, start=1):
        text = page.get_text("text").strip()

        pages.append({
            "page": page_number,
            "text": text
        })

    document.close()

    return pages