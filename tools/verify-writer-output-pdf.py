import argparse
import json
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


def block_text(block):
    return "".join(
        node.get("text", "") if node.get("type") == "text" else "\n"
        for node in block.get("content", [])
    )


def normalized_tokens(value):
    return re.findall(r"\S+", value, flags=re.UNICODE)


def body_text(pdf, has_cover):
    lines = []
    body_pages = pdf.pages[1:] if has_cover else pdf.pages
    for page in body_pages:
        for line in (page.extract_text() or "").splitlines():
            stripped = line.strip()
            if re.fullmatch(r"\d+\.", stripped):
                continue
            if stripped == "(MORE)" or stripped.endswith("(CONT'D)"):
                continue
            lines.append(line)
    return "\n".join(lines)


def verify(pdf_path, json_path, has_cover, expected_pages):
    backup = json.loads(Path(json_path).read_text(encoding="utf-8"))
    blocks = backup["document"]["content"]
    source = "\n".join(
        block_text(block)
        for block in blocks
        if block["attrs"]["kind"] != "authorNote" and block_text(block).strip()
    )
    notes = [
        block_text(block)
        for block in blocks
        if block["attrs"]["kind"] == "authorNote" and block_text(block)
    ]

    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != expected_pages:
            raise AssertionError(f"Expected {expected_pages} pages, found {len(pdf.pages)}")
        extracted = body_text(pdf, has_cover)
        source_tokens = normalized_tokens(source)
        extracted_tokens = normalized_tokens(extracted)
        if source_tokens != extracted_tokens:
            mismatch = next(
                (index for index, pair in enumerate(zip(source_tokens, extracted_tokens)) if pair[0] != pair[1]),
                min(len(source_tokens), len(extracted_tokens)),
            )
            raise AssertionError(
                f"Text mismatch at token {mismatch}: source={source_tokens[mismatch:mismatch+4]} "
                f"pdf={extracted_tokens[mismatch:mismatch+4]}"
            )

        body_pages = pdf.pages[1:] if has_cover else pdf.pages
        first_lines = (body_pages[0].extract_text() or "").splitlines()
        if first_lines and re.fullmatch(r"1\.", first_lines[0].strip()):
            raise AssertionError("Body page 1 must not show a page number")
        if len(body_pages) > 1:
            second_lines = (body_pages[1].extract_text() or "").splitlines()
            if not second_lines or second_lines[0].strip() != "2.":
                raise AssertionError("Body page 2 must show page number 2")

        for page_index, page in enumerate(body_pages, start=1):
            for char in page.chars:
                if char["x0"] < 107 or char["x1"] > page.width - 71:
                    raise AssertionError(f"Horizontal overflow on body page {page_index}")
                if char["top"] < 34 or char["bottom"] > page.height - 69:
                    raise AssertionError(f"Vertical overflow on body page {page_index}")

        all_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        for note in notes:
            if note and note in all_text:
                raise AssertionError("Author note leaked into PDF text")

    reader = PdfReader(pdf_path)
    metadata_text = "\n".join(str(value) for value in (reader.metadata or {}).values())
    for note in notes:
        if note and note in metadata_text:
            raise AssertionError("Author note leaked into PDF metadata")
    if reader.attachments:
        raise AssertionError("PDF must not contain attachments")
    if any(page.get("/Annots") for page in reader.pages):
        raise AssertionError("PDF must not contain annotations")

    return {
        "pdf": str(Path(pdf_path).resolve()),
        "pages": expected_pages,
        "sourceTokens": len(source_tokens),
        "extractedTokens": len(extracted_tokens),
        "authorNotesExcluded": len(notes),
        "attachments": 0,
        "annotations": 0,
        "textIntegrity": "PASS",
        "pageNumbering": "PASS",
        "overflow": "PASS",
    }


parser = argparse.ArgumentParser()
parser.add_argument("pdf")
parser.add_argument("json")
parser.add_argument("--cover", action="store_true")
parser.add_argument("--pages", type=int, required=True)
args = parser.parse_args()
print(json.dumps(verify(args.pdf, args.json, args.cover, args.pages), ensure_ascii=False, indent=2))
