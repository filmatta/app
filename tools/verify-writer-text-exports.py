import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path


FDX_TYPES = {
    "sceneHeading": "Scene Heading",
    "action": "Action",
    "character": "Character",
    "dialogue": "Dialogue",
    "parenthetical": "Parenthetical",
    "transition": "Transition",
}

FDX_STYLES = {
    "bold": "Bold",
    "italic": "Italic",
    "underline": "Underline",
}


def block_text(block):
    return "".join(
        node.get("text", "") if node.get("type") == "text" else "\n"
        for node in block.get("content", [])
    )


def expected_text_nodes(block):
    nodes = block.get("content", [])
    if not nodes:
        return [("", "")]
    result = []
    for node in nodes:
        if node["type"] == "hardBreak":
            result.append(("\n", ""))
            continue
        styles = "+".join(FDX_STYLES[mark["type"]] for mark in node.get("marks", []))
        result.append((node["text"], styles))
    return result


parser = argparse.ArgumentParser()
parser.add_argument("json")
parser.add_argument("fdx")
args = parser.parse_args()

backup = json.loads(Path(args.json).read_text(encoding="utf-8"))
if backup["format"] != "filmatta-writer-backup" or backup["formatVersion"] != 1:
    raise AssertionError("Unexpected JSON backup contract")

root = ET.parse(args.fdx).getroot()
if root.tag != "FinalDraft" or root.attrib.get("DocumentType") != "Script":
    raise AssertionError("Unexpected FDX root")

expected_blocks = [
    block for block in backup["document"]["content"]
    if block["attrs"]["kind"] in FDX_TYPES
]
paragraphs = root.findall("./Content/Paragraph")
if len(paragraphs) != len(expected_blocks):
    raise AssertionError("FDX paragraph count does not match exportable blocks")

for index, (block, paragraph) in enumerate(zip(expected_blocks, paragraphs)):
    expected_type = FDX_TYPES[block["attrs"]["kind"]]
    if paragraph.attrib.get("Type") != expected_type:
        raise AssertionError(f"FDX type mismatch at paragraph {index}")
    text_nodes = paragraph.findall("Text")
    actual_nodes = [(node.text or "", node.attrib.get("Style", "")) for node in text_nodes]
    if actual_nodes != expected_text_nodes(block):
        raise AssertionError(f"FDX text/style mismatch at paragraph {index}")
    if "".join(value for value, _style in actual_nodes) != block_text(block):
        raise AssertionError(f"FDX reconstructed text mismatch at paragraph {index}")

notes = [
    block_text(block) for block in backup["document"]["content"]
    if block["attrs"]["kind"] == "authorNote"
]
fdx_text = Path(args.fdx).read_text(encoding="utf-8")
if any(note and note in fdx_text for note in notes):
    raise AssertionError("Author note leaked into FDX")

print(json.dumps({
    "jsonRoundTrip": "PASS",
    "xmlParsing": "PASS",
    "paragraphs": len(paragraphs),
    "typesAndOrder": "PASS",
    "inlineStyles": "PASS",
    "hardBreaks": "PASS",
    "xmlEscaping": "PASS",
    "authorNotesExcluded": len(notes),
    "finalDraftInteroperability": "NOT_VERIFIED",
}, ensure_ascii=False, indent=2))
