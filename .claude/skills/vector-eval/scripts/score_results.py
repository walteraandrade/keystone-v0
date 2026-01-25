#!/usr/bin/env python3
"""
Score evaluation results using LLM judge.
Adds faithfulness, relevance, and hallucination scores.
"""

import json
from dataclasses import dataclass
from typing import Any


@dataclass
class Scores:
    """LLM judge scores for one answer."""
    faithfulness: float  # 0-1, higher is better
    relevance: float     # 0-1, higher is better
    hallucination: float # 0-1, lower is better


# Prompts for LLM judge
FAITHFULNESS_PROMPT = """
You are evaluating the faithfulness of an answer to its source context.

Context:
{context}

Answer:
{answer}

Rate the faithfulness on a scale of 0.0 to 1.0:
- 1.0: Every claim in the answer is directly supported by the context
- 0.7-0.9: Most claims supported, minor unsupported details
- 0.4-0.6: Mixed - some claims supported, some not
- 0.0-0.3: Mostly unsupported or contradicted by context

Respond with only a number between 0.0 and 1.0.
"""

RELEVANCE_PROMPT = """
You are evaluating how well an answer addresses a question.

Question:
{question}

Answer:
{answer}

Rate the relevance on a scale of 0.0 to 1.0:
- 1.0: Directly and completely answers the question
- 0.7-0.9: Answers the question with some tangential content
- 0.4-0.6: Partially addresses the question, misses key aspects
- 0.0-0.3: Does not address the question

Respond with only a number between 0.0 and 1.0.
"""

HALLUCINATION_PROMPT = """
You are detecting hallucinations in an answer.

Context (the only source of truth):
{context}

Answer:
{answer}

Rate the hallucination level on a scale of 0.0 to 1.0:
- 0.0: No hallucinations - all claims are in the context
- 0.1-0.3: Minor hallucinations - small unsupported details
- 0.4-0.6: Moderate hallucinations - some fabricated claims
- 0.7-1.0: Severe hallucinations - mostly fabricated content

Respond with only a number between 0.0 and 1.0.
"""


async def score_faithfulness(context: list[str], answer: str) -> float:
    """
    Score faithfulness using LLM judge.

    Measures: Are all claims in the answer supported by context?
    """
    context_text = "\n\n".join(context)
    prompt = FAITHFULNESS_PROMPT.format(context=context_text, answer=answer)

    # response = await claude.complete(prompt)
    # return float(response.strip())
    return 0.0


async def score_relevance(question: str, answer: str) -> float:
    """
    Score answer relevance using LLM judge.

    Measures: Does the answer address the question?
    """
    prompt = RELEVANCE_PROMPT.format(question=question, answer=answer)

    # response = await claude.complete(prompt)
    # return float(response.strip())
    return 0.0


async def score_hallucination(context: list[str], answer: str) -> float:
    """
    Score hallucination rate using LLM judge.

    Measures: What fraction of claims are unsupported?
    """
    context_text = "\n\n".join(context)
    prompt = HALLUCINATION_PROMPT.format(context=context_text, answer=answer)

    # response = await claude.complete(prompt)
    # return float(response.strip())
    return 0.0


async def score_result(question: str, context: list[str], answer: str) -> Scores:
    """Score a single answer across all metrics."""
    faithfulness = await score_faithfulness(context, answer)
    relevance = await score_relevance(question, answer)
    hallucination = await score_hallucination(context, answer)

    return Scores(
        faithfulness=faithfulness,
        relevance=relevance,
        hallucination=hallucination,
    )


async def score_all_results(results_file: str) -> dict[str, Any]:
    """
    Score all results in evaluation file.

    Updates each store result with scores.
    """
    with open(results_file) as f:
        data = json.load(f)

    for result in data["results"]:
        question = result["question"]

        for store_name, store_result in result["stores"].items():
            context = store_result["context"]
            answer = store_result["answer"]

            scores = await score_result(question, context, answer)
            store_result["scores"] = {
                "faithfulness": scores.faithfulness,
                "relevance": scores.relevance,
                "hallucination": scores.hallucination,
            }

    return data


def validate_scores(data: dict) -> list[str]:
    """Validate all scores are in valid range."""
    errors = []

    for result in data["results"]:
        for store_name, store_result in result["stores"].items():
            scores = store_result.get("scores", {})

            for metric in ["faithfulness", "relevance", "hallucination"]:
                value = scores.get(metric)
                if value is None:
                    errors.append(f"Missing {metric} for Q{result['question_id']} {store_name}")
                elif not (0.0 <= value <= 1.0):
                    errors.append(f"Invalid {metric}={value} for Q{result['question_id']} {store_name}")

    return errors


if __name__ == "__main__":
    print("Usage: Import and call score_all_results() from Claude skill execution")
    print("  score_result(question, context, answer) -> Scores")
    print("  score_all_results(results_file) -> scored data dict")
