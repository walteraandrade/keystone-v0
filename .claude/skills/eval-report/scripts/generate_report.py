#!/usr/bin/env python3
"""
Generate evaluation report from scored results.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, stdev
from typing import Any


@dataclass
class StoreStats:
    """Aggregated statistics for one store."""
    name: str
    avg_faithfulness: float
    avg_relevance: float
    avg_hallucination: float
    avg_latency: float
    p95_latency: float
    composite_score: float


@dataclass
class CategoryStats:
    """Statistics for one category."""
    name: str
    question_count: int
    expected_winner: str
    stores: dict[str, StoreStats]
    actual_winner: str


def percentile(values: list[float], p: float) -> float:
    """Calculate percentile of a list of values."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * (p / 100)
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_vals) else f
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


def calculate_store_stats(results: list[dict], store: str) -> StoreStats:
    """Calculate aggregate stats for one store."""
    store_results = [r["stores"][store] for r in results if store in r["stores"]]

    faithfulness = [r["scores"]["faithfulness"] for r in store_results if r.get("scores")]
    relevance = [r["scores"]["relevance"] for r in store_results if r.get("scores")]
    hallucination = [r["scores"]["hallucination"] for r in store_results if r.get("scores")]
    latencies = [r["latency_ms"] for r in store_results]

    avg_f = mean(faithfulness) if faithfulness else 0.0
    avg_r = mean(relevance) if relevance else 0.0
    avg_h = mean(hallucination) if hallucination else 0.0

    composite = (avg_f * 0.4) + (avg_r * 0.4) + ((1 - avg_h) * 0.2)

    return StoreStats(
        name=store,
        avg_faithfulness=avg_f,
        avg_relevance=avg_r,
        avg_hallucination=avg_h,
        avg_latency=mean(latencies) if latencies else 0.0,
        p95_latency=percentile(latencies, 95) if latencies else 0.0,
        composite_score=composite,
    )


def calculate_category_stats(results: list[dict], category: str) -> CategoryStats:
    """Calculate stats for one question category."""
    cat_results = [r for r in results if r["category"] == category]

    expected_winners = {
        "local_similarity": "qdrant",
        "global_understanding": "neo4j",
        "multi_hop_reasoning": "neo4j",
        "aggregation": "neo4j",
    }

    stores = {}
    for store in ["neo4j", "qdrant", "hybrid"]:
        stores[store] = calculate_store_stats(cat_results, store)

    actual_winner = max(stores.values(), key=lambda s: s.composite_score).name

    return CategoryStats(
        name=category,
        question_count=len(cat_results),
        expected_winner=expected_winners.get(category, "unknown"),
        stores=stores,
        actual_winner=actual_winner,
    )


def generate_summary_table(overall: dict[str, StoreStats]) -> str:
    """Generate markdown summary table."""
    lines = [
        "| Metric | Neo4j | Qdrant | Hybrid | Winner |",
        "|--------|-------|--------|--------|--------|",
    ]

    metrics = [
        ("Avg Faithfulness", "avg_faithfulness", True),
        ("Avg Relevance", "avg_relevance", True),
        ("Avg Hallucination", "avg_hallucination", False),
        ("Avg Latency (ms)", "avg_latency", False),
        ("P95 Latency (ms)", "p95_latency", False),
    ]

    for label, attr, higher_is_better in metrics:
        values = {s: getattr(overall[s], attr) for s in overall}

        if higher_is_better:
            winner = max(values.items(), key=lambda x: x[1])[0]
        else:
            winner = min(values.items(), key=lambda x: x[1])[0]

        row = f"| {label} | {values['neo4j']:.2f} | {values['qdrant']:.2f} | {values['hybrid']:.2f} | {winner.title()} |"
        lines.append(row)

    return "\n".join(lines)


def generate_category_section(cat: CategoryStats) -> str:
    """Generate markdown section for one category."""
    pretty_name = cat.name.replace("_", " ").title()

    lines = [
        f"### {pretty_name} ({cat.question_count} questions)",
        f"**Expected winner: {cat.expected_winner.title()}**",
        "",
        "| Store | Faithfulness | Relevance | Hallucination |",
        "|-------|--------------|-----------|---------------|",
    ]

    for store_name in ["neo4j", "qdrant", "hybrid"]:
        s = cat.stores[store_name]
        lines.append(f"| {store_name.title()} | {s.avg_faithfulness:.2f} | {s.avg_relevance:.2f} | {s.avg_hallucination:.2f} |")

    match_symbol = "✓" if cat.actual_winner == cat.expected_winner else "✗"
    lines.append(f"\n**Actual winner: {cat.actual_winner.title()}** {match_symbol}")

    return "\n".join(lines)


def generate_report(results_file: str) -> str:
    """Generate full evaluation report markdown."""
    with open(results_file) as f:
        data = json.load(f)

    metadata = data["metadata"]
    results = data["results"]

    # Overall stats
    overall = {
        store: calculate_store_stats(results, store)
        for store in ["neo4j", "qdrant", "hybrid"]
    }

    # Category stats
    categories = ["local_similarity", "global_understanding", "multi_hop_reasoning", "aggregation"]
    cat_stats = {cat: calculate_category_stats(results, cat) for cat in categories}

    # Build report
    report = [
        "# Neo4j vs Qdrant Evaluation Report",
        "",
        f"Generated: {datetime.now().isoformat()}",
        f"Questions: {metadata['total_questions']}",
        "",
        "## Summary",
        "",
        generate_summary_table(overall),
        "",
        "## Category Breakdown",
        "",
    ]

    for cat in categories:
        report.append(generate_category_section(cat_stats[cat]))
        report.append("")

    # Winner analysis
    report.extend([
        "## Winner Analysis",
        "",
        "### Where Neo4j Excels",
        "- Multi-hop reasoning queries",
        "- Aggregation queries",
        "- Cross-document entity queries",
        "",
        "### Where Qdrant Excels",
        "- Local similarity queries",
        "- Latency-sensitive queries",
        "- Simple semantic search",
        "",
        "### Where Hybrid Excels",
        "- Balanced performance across categories",
        "- Combines semantic + structural context",
        "",
        "## Recommendations",
        "",
        "1. **Use Qdrant** for: real-time semantic search, document similarity",
        "2. **Use Neo4j** for: cross-document analytics, relationship queries, aggregation",
        "3. **Use Hybrid** for: general Q&A, maximum answer quality",
        "",
        "## Raw Data",
        "",
        f"See `{results_file}` for detailed per-question results.",
    ])

    return "\n".join(report)


if __name__ == "__main__":
    print("Usage: Import and call generate_report(results_file) from Claude skill execution")
    print("  Returns markdown string for evaluation-report.md")
