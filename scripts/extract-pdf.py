#!/usr/bin/env python3
"""
PDF extraction using pdfplumber.
Outputs structured JSON with document elements.

Usage:
    python scripts/extract-pdf.py <pdf_file> [--output <output.json>]
    python scripts/extract-pdf.py FPS/01.pdf --output extracted.json
    python scripts/extract-pdf.py FPS/01.pdf  # outputs to stdout
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber not installed.", file=sys.stderr)
    print("Install with: pip install pdfplumber", file=sys.stderr)
    sys.exit(1)


def is_page_header(text: str, y_position: float, page_height: float) -> bool:
    """Detect if text is likely a repeating page header."""
    header_patterns = [
        r"^página\s*[<\d]",
        r"^page\s*\d",
        r"página\s*<\s*\d+\s*de",
        r"arcelormittal",
        r"saúde\s*(e|&)\s*segurança",
        r"am\s*safety\s*st",
        r"am\s*segurança\s*st",
        r"instruções\s*$",
        r"technology.*health",
        r"^espaços\s*$",
        r"^confinados\s*$",
        r"corporativo",
        r"circulação\s*controlada",
    ]
    text_lower = text.lower().strip()
    
    if y_position < page_height * 0.20:
        for pattern in header_patterns:
            if re.search(pattern, text_lower):
                return True
    
    lines = text_lower.split('\n')
    header_line_count = 0
    for line in lines[:5]:
        line = line.strip()
        for pattern in header_patterns:
            if re.search(pattern, line):
                header_line_count += 1
                break
    if header_line_count >= 3:
        return True
    
    return False


def is_page_footer(text: str, y_position: float, page_height: float) -> bool:
    """Detect if text is likely a page footer."""
    if y_position > page_height * 0.9:
        footer_patterns = [
            r"^\d+\s*$",
            r"^página\s*\d",
            r"^page\s*\d",
        ]
        text_lower = text.lower().strip()
        for pattern in footer_patterns:
            if re.search(pattern, text_lower):
                return True
    return False


def detect_element_type(text: str, font_size: float = None, is_bold: bool = False) -> str:
    """Detect semantic type of text element."""
    text_stripped = text.strip()
    
    if re.match(r"^\d+\.?\s*[–\-:.]?\s*[A-ZÁÊÔÇ]", text_stripped):
        if len(text_stripped) < 100:
            return "Title"
    
    section_keywords = [
        "escopo", "definições", "definicoes", "responsabilidades", 
        "procedimentos", "objetivo", "anexo", "apêndice", "appendice"
    ]
    text_lower = text_stripped.lower()
    for kw in section_keywords:
        if text_lower.startswith(kw) and len(text_stripped) < 80:
            return "Title"
    
    if re.match(r"^[\-•●○◦▪]\s+", text_stripped):
        return "ListItem"
    if re.match(r"^\d+\.\d+\.\d+\.?\s+", text_stripped):
        return "ListItem"
    
    return "NarrativeText"


def extract_pdf(filepath: str) -> dict:
    """
    Extract structured elements from PDF using pdfplumber.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    
    elements = []
    tables_found = []
    
    with pdfplumber.open(str(path)) as pdf:
        page_count = len(pdf.pages)
        
        for page_num, page in enumerate(pdf.pages, start=1):
            page_height = page.height
            
            tables = page.find_tables()
            table_bboxes = [t.bbox for t in tables]
            
            for table in tables:
                table_data = table.extract()
                if table_data:
                    table_text = "\n".join(
                        " | ".join(str(cell) if cell else "" for cell in row)
                        for row in table_data
                    )
                    elements.append({
                        "type": "Table",
                        "text": table_text,
                        "page": page_num,
                        "rows": len(table_data),
                        "cols": len(table_data[0]) if table_data else 0,
                    })
                    tables_found.append(page_num)
            
            text_outside_tables = page.filter(
                lambda obj: not any(
                    bbox[0] <= obj.get("x0", 0) <= bbox[2] and
                    bbox[1] <= obj.get("top", 0) <= bbox[3]
                    for bbox in table_bboxes
                ) if "x0" in obj else True
            )
            
            text = text_outside_tables.extract_text(layout=True) or ""
            
            paragraphs = re.split(r'\n\s*\n', text)
            
            for para in paragraphs:
                para = para.strip()
                if not para or len(para) < 5:
                    continue
                
                lines = para.split('\n')
                first_line = lines[0] if lines else ""
                
                first_char = page.search(para[:20]) if len(para) >= 20 else []
                y_pos = first_char[0]["top"] if first_char else page_height / 2
                
                if is_page_header(para, y_pos, page_height):
                    continue
                if is_page_footer(para, y_pos, page_height):
                    continue
                
                element_type = detect_element_type(para)
                
                elements.append({
                    "type": element_type,
                    "text": para,
                    "page": page_num,
                })
    
    return {
        "filename": path.name,
        "filepath": str(path.absolute()),
        "pages": page_count,
        "element_count": len(elements),
        "tables_found": len(tables_found),
        "elements": elements,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Extract structured elements from PDF using pdfplumber"
    )
    parser.add_argument("pdf_file", help="Path to PDF file")
    parser.add_argument(
        "--output", "-o",
        help="Output file path (defaults to stdout)"
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty print JSON output"
    )
    
    args = parser.parse_args()
    
    try:
        result = extract_pdf(args.pdf_file)
        
        indent = 2 if args.pretty else None
        json_output = json.dumps(result, indent=indent, ensure_ascii=False)
        
        if args.output:
            Path(args.output).write_text(json_output, encoding="utf-8")
            print(f"Extracted {result['element_count']} elements to {args.output}", file=sys.stderr)
        else:
            print(json_output)
            
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error extracting PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
