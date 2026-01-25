#!/usr/bin/env python3
"""
Extract entities, relationships, and themes from documents.
Used by question-generator skill to populate question templates.
"""

import json
import sys
from dataclasses import dataclass
from typing import Any


@dataclass
class ExtractedThemes:
    """Container for extracted document themes."""
    entities: dict[str, list[str]]  # type -> names
    relationships: list[dict[str, str]]  # source, rel, target
    topics: list[str]
    processes: list[str]
    documents: list[str]


def extract_from_text(text: str, doc_name: str) -> dict[str, Any]:
    """
    Extract entities and themes from document text.

    In practice, this would use NER/LLM extraction.
    Here we provide the structure for Claude to populate.
    """
    return {
        "document": doc_name,
        "entities": {
            "FailureMode": [],
            "Risk": [],
            "Control": [],
            "Finding": [],
            "Process": [],
            "RootCause": [],
        },
        "relationships": [],
        "key_phrases": [],
        "section_headers": [],
    }


def merge_extractions(extractions: list[dict]) -> ExtractedThemes:
    """Merge extractions from multiple documents."""
    all_entities: dict[str, list[str]] = {}
    all_relationships: list[dict[str, str]] = []
    all_topics: set[str] = set()
    all_processes: set[str] = set()
    documents: list[str] = []

    for ext in extractions:
        documents.append(ext["document"])

        for etype, names in ext["entities"].items():
            if etype not in all_entities:
                all_entities[etype] = []
            all_entities[etype].extend(names)

        all_relationships.extend(ext["relationships"])
        all_topics.update(ext.get("key_phrases", []))
        all_processes.update(ext["entities"].get("Process", []))

    # Dedupe entity lists
    for etype in all_entities:
        all_entities[etype] = list(set(all_entities[etype]))

    return ExtractedThemes(
        entities=all_entities,
        relationships=all_relationships,
        topics=list(all_topics),
        processes=list(all_processes),
        documents=documents,
    )


def generate_questions_from_themes(themes: ExtractedThemes) -> dict[str, list[dict]]:
    """
    Generate evaluation questions from extracted themes.

    Returns dict with 4 categories, 5 questions each.
    """
    questions = {
        "local_similarity": [],
        "global_understanding": [],
        "multi_hop_reasoning": [],
        "aggregation": [],
    }

    # Local similarity - use specific entities
    failure_modes = themes.entities.get("FailureMode", [])
    controls = themes.entities.get("Control", [])
    risks = themes.entities.get("Risk", [])

    for i, fm in enumerate(failure_modes[:3]):
        questions["local_similarity"].append({
            "question": f"What controls mitigate '{fm}'?",
            "expected_entities": [fm] + controls[:2],
            "ground_truth": "TBD - requires document analysis",
        })

    for topic in themes.topics[:2]:
        questions["local_similarity"].append({
            "question": f"Find sections similar to '{topic}'",
            "expected_entities": [],
            "ground_truth": "TBD",
        })

    # Global understanding
    questions["global_understanding"] = [
        {"question": "What are the main risk themes across all documents?",
         "expected_entities": risks[:5],
         "ground_truth": "TBD"},
        {"question": "Which processes have the most unmitigated risks?",
         "expected_entities": themes.processes[:3],
         "ground_truth": "TBD"},
        {"question": "What is the overall compliance posture?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "Which entities appear in multiple documents?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "What are the common control gaps?",
         "expected_entities": controls[:3],
         "ground_truth": "TBD"},
    ]

    # Multi-hop reasoning
    questions["multi_hop_reasoning"] = [
        {"question": "Which controls are ineffective for high-RPN failure modes?",
         "expected_entities": failure_modes[:2] + controls[:2],
         "ground_truth": "TBD"},
        {"question": f"Trace the provenance of '{risks[0] if risks else 'Risk-001'}' across documents",
         "expected_entities": themes.documents,
         "ground_truth": "TBD"},
        {"question": "What findings reference controls that mitigate critical risks?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "Which audits identified risks that led to process changes?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "What failure modes share common root causes?",
         "expected_entities": failure_modes[:3],
         "ground_truth": "TBD"},
    ]

    # Aggregation
    questions["aggregation"] = [
        {"question": "Count risks by severity across all audits",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "Which documents share the most entities?",
         "expected_entities": themes.documents,
         "ground_truth": "TBD"},
        {"question": "How many controls have no linked risks?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "What's the distribution of finding types by document?",
         "expected_entities": [],
         "ground_truth": "TBD"},
        {"question": "What is the average RPN by process area?",
         "expected_entities": themes.processes[:3],
         "ground_truth": "TBD"},
    ]

    return questions


def format_questions_markdown(questions: dict[str, list[dict]], themes: ExtractedThemes) -> str:
    """Format questions as markdown for evaluation-questions.md."""
    from datetime import datetime

    lines = [
        "# Evaluation Questions",
        "",
        f"Generated: {datetime.now().isoformat()}",
        f"Documents: {', '.join(themes.documents)}",
        "",
    ]

    category_names = {
        "local_similarity": "Local Similarity",
        "global_understanding": "Global Understanding",
        "multi_hop_reasoning": "Multi-hop Reasoning",
        "aggregation": "Aggregation",
    }

    for cat_key, cat_name in category_names.items():
        lines.append(f"## {cat_name}")
        lines.append("")

        for i, q in enumerate(questions[cat_key], 1):
            lines.append(f"{i}. {q['question']}")
            lines.append(f"   - Expected entities: {q['expected_entities']}")
            lines.append(f"   - Ground truth: {q['ground_truth']}")
            lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    # Example usage - in practice, Claude orchestrates this
    print("Usage: Import and call functions from Claude skill execution")
    print("  extract_from_text(text, doc_name) -> extraction dict")
    print("  merge_extractions([...]) -> ExtractedThemes")
    print("  generate_questions_from_themes(themes) -> questions dict")
    print("  format_questions_markdown(questions, themes) -> markdown string")
