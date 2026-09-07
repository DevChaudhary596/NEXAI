"""
Day 2 QA Validation Suite: 50-Query Prompt Test Matrix Verification.
Ensures the test matrix conforms to strict schema standards, all referenced benchmark
scenes exist on disk, and evaluation bounds are mathematically sound.
"""

import json
import os
import pytest


MATRIX_PATH = "qa_eval/test_matrix_50.json"
VALID_ROUTER_PATHS = {"detection", "segmentation", "spectral", "vqa"}
VALID_COMPLEXITY = {"simple", "moderate", "complex"}
VALID_CATEGORIES = {"counting", "detection", "segmentation", "spectral", "change_detection", "edge_case"}


@pytest.fixture(scope="module")
def matrix_data():
    assert os.path.exists(MATRIX_PATH), f"Matrix file not found at {MATRIX_PATH}"
    with open(MATRIX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def test_matrix_total_count_and_keys(matrix_data):
    """Verify matrix contains exactly 50 queries and required root metadata."""
    assert matrix_data.get("total_queries") == 50
    queries = matrix_data.get("queries", [])
    assert len(queries) == 50

    summary_intent = matrix_data.get("summary_by_intent", {})
    assert sum(summary_intent.values()) == 50

    summary_complexity = matrix_data.get("summary_by_complexity", {})
    assert sum(summary_complexity.values()) == 50


def test_query_ids_unique_and_sequential(matrix_data):
    """Verify query IDs are strictly formatted as Q-001 through Q-050 with no duplicates."""
    queries = matrix_data["queries"]
    ids = [q["query_id"] for q in queries]

    assert len(ids) == len(set(ids)), "Query IDs must be strictly unique"

    for i in range(1, 51):
        expected_id = f"Q-{i:03d}"
        assert expected_id in ids, f"Missing expected query ID: {expected_id}"


def test_query_schemas_and_fields(matrix_data):
    """Verify all queries contain required schema fields and valid categorical values."""
    required_fields = {
        "query_id",
        "prompt",
        "category",
        "complexity",
        "target_scene",
        "expected_router_path",
        "expected_output_schema",
        "expected_bounds",
        "pass_criteria",
    }

    for q in matrix_data["queries"]:
        qid = q["query_id"]
        for field in required_fields:
            assert field in q, f"Query {qid} missing required field: '{field}'"

        assert q["category"] in VALID_CATEGORIES, f"Invalid category in {qid}: {q['category']}"
        assert q["complexity"] in VALID_COMPLEXITY, f"Invalid complexity in {qid}: {q['complexity']}"
        assert q["expected_router_path"] in VALID_ROUTER_PATHS, f"Invalid router path in {qid}: {q['expected_router_path']}"
        assert len(q["prompt"].strip()) >= 15, f"Prompt too short in {qid}"


def test_all_target_scenes_exist_on_disk(matrix_data):
    """Verify every target scene referenced in the matrix exists in data/benchmark_scenes/."""
    for q in matrix_data["queries"]:
        scene_path = q["target_scene"]
        assert os.path.exists(scene_path), (
            f"Query {q['query_id']} references missing benchmark scene: {scene_path}"
        )


def test_coverage_distribution_quotas(matrix_data):
    """Verify matrix has robust coverage across simple, moderate, and complex queries."""
    complexities = [q["complexity"] for q in matrix_data["queries"]]
    simple_count = complexities.count("simple")
    mod_count = complexities.count("moderate")
    comp_count = complexities.count("complex")

    assert simple_count >= 15, f"Expected at least 15 simple queries, got {simple_count}"
    assert mod_count >= 15, f"Expected at least 15 moderate queries, got {mod_count}"
    assert comp_count >= 10, f"Expected at least 10 complex queries, got {comp_count}"

    paths = [q["expected_router_path"] for q in matrix_data["queries"]]
    assert paths.count("detection") >= 15, "Expected at least 15 detection/counting queries"
    assert paths.count("segmentation") >= 10, "Expected at least 10 segmentation queries"
    assert paths.count("spectral") >= 10, "Expected at least 10 spectral queries"
    assert paths.count("vqa") >= 2, "Expected at least 2 VQA fallback queries"
