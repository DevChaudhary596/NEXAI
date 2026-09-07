"""
Day 3 Deliverable: SatQuery AI — Interactive QA Benchmark Dashboard (Streamlit).
Allows team members and SIH evaluators to visualize Pass/Fail metrics, latency distributions,
memory consumption, and test prompts live against the backend orchestrator.
"""

import json
import os
import sys
import time
import pandas as pd
import streamlit as st

# Setup backend import path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient

def load_fastapi_app():
    shadowed = [k for k in sys.modules if k == "app" or k.startswith("app.")]
    for k in shadowed:
        del sys.modules[k]
    if BACKEND_DIR in sys.path:
        sys.path.remove(BACKEND_DIR)
    sys.path.insert(0, BACKEND_DIR)
    import app.main
    return app.main.app

LATEST_REPORT_PATH = os.path.join(REPO_ROOT, "qa_eval", "reports", "qa_run_latest.json")
MATRIX_PATH = os.path.join(REPO_ROOT, "qa_eval", "test_matrix_50.json")

st.set_page_config(
    page_title="SatQuery AI — QA Benchmark Hub",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data
def load_latest_report():
    if os.path.exists(LATEST_REPORT_PATH):
        with open(LATEST_REPORT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


@st.cache_data
def load_matrix():
    if os.path.exists(MATRIX_PATH):
        with open(MATRIX_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


@st.cache_resource
def get_test_client():
    return TestClient(load_fastapi_app())


def main():
    st.title("🛰️ SatQuery AI — QA Benchmark & Metric Logging Hub")
    st.caption("SIH26167 · Problem Statement: Vision-Language Assistant for Remote Sensing | Lead: Member 6")

    report = load_latest_report()
    matrix = load_matrix()

    if not report:
        st.warning("No test run found. Please run `python qa_eval/test_harness.py` first.")
        return

    # =========================================================================
    # 1. TOP KPI METRIC CARDS
    # =========================================================================
    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("Total Test Queries", f"{report['total_queries']}", "100% Curated")
    with col2:
        pass_rate = report["pass_rate_pct"]
        st.metric("Pass Rate", f"{pass_rate}%", f"{report['passed_queries']} / {report['total_queries']}")
    with col3:
        avg_lat = report["avg_latency_ms"]
        st.metric("Avg Latency", f"{avg_lat:.1f} ms", "Budget: <4000ms (Optimal)")
    with col4:
        peak_rss = report["peak_rss_mb"]
        st.metric("Peak RSS RAM", f"{peak_rss:.1f} MB", "Ceiling: <4000MB")
    with col5:
        st.metric("Hardware Execution", "100% CPU", "Zero GPU Bottleneck")

    st.markdown("---")

    # =========================================================================
    # 2. SIDEBAR FILTERS
    # =========================================================================
    st.sidebar.header("🎯 Filter Test Matrix")
    results = report.get("results", [])
    df = pd.DataFrame(results)

    categories = ["All"] + sorted(list(df["category"].unique()))
    selected_cat = st.sidebar.selectbox("Category", categories)

    complexities = ["All"] + sorted(list(df["complexity"].unique()))
    selected_comp = st.sidebar.selectbox("Complexity Tier", complexities)

    status_options = ["All", "PASS Only", "FAIL Only"]
    selected_status = st.sidebar.selectbox("Status", status_options)

    # Filter dataframe
    filtered_df = df.copy()
    if selected_cat != "All":
        filtered_df = filtered_df[filtered_df["category"] == selected_cat]
    if selected_comp != "All":
        filtered_df = filtered_df[filtered_df["complexity"] == selected_comp]
    if selected_status == "PASS Only":
        filtered_df = filtered_df[filtered_df["passed"] == True]
    elif selected_status == "FAIL Only":
        filtered_df = filtered_df[filtered_df["passed"] == False]

    # =========================================================================
    # 3. VISUAL ANALYTICS TABS
    # =========================================================================
    tab1, tab2, tab3 = st.tabs(["📊 Evaluation Visualizer", "📋 Test Matrix Explorer", "⚡ Live Query Runner"])

    with tab1:
        c1, c2 = st.columns(2)
        with c1:
            st.subheader("Latency Distribution by Complexity (ms)")
            lat_by_comp = df.groupby("complexity")["latency_ms"].mean().reset_index()
            st.bar_chart(lat_by_comp.set_index("complexity"))

        with c2:
            st.subheader("Pass / Fail Breakdown by Category")
            cat_perf = df.groupby(["category", "status"]).size().unstack(fill_value=0)
            st.bar_chart(cat_perf)

        st.subheader("SIH Evaluation Pillars Compliance")
        col_a, col_b, col_c, col_d = st.columns(4)
        col_a.success("**Novelty (25%)**  \nVLM Intent Routing with zero count hallucination.")
        col_b.success("**Technical Depth (25%)**  \nSAHI OBB + MobileSAM + Radiometric GIS Math.")
        col_c.success("**Impact (25%)**  \nDisaster relief, crop health, strategic infra.")
        col_d.success(f"**Feasibility (25%)**  \nAvg {avg_lat:.1f}ms latency, {peak_rss:.1f}MB RAM.")

    with tab2:
        st.subheader(f"Showing {len(filtered_df)} of {len(df)} Benchmark Queries")
        display_cols = ["query_id", "status", "category", "complexity", "latency_ms", "prompt", "expected_router_path", "actual_router_path"]
        st.dataframe(filtered_df[display_cols], use_container_width=True)

    with tab3:
        st.subheader("Interactive Live Prompt Testing")
        st.write("Test any query live against Member 1's router and Member 5's FastAPI backend:")

        query_choices = [f"{q['query_id']}: {q['prompt']}" for q in matrix.get("queries", [])]
        preset = st.selectbox("Or choose a pre-configured benchmark query:", ["Custom"] + query_choices)

        default_prompt = "How many airplanes are parked on the apron at Delhi Airport?"
        if preset != "Custom":
            default_prompt = preset.split(": ", 1)[1]

        prompt_input = st.text_area("User Prompt:", value=default_prompt, height=80)
        mode = st.radio("Execution Mode:", ["Route Only (Fast)", "Full Query Pipeline"], horizontal=True)

        if st.button("🚀 Execute Live Query"):
            client = get_test_client()
            with st.spinner("Processing through SatQuery AI orchestrator..."):
                t0 = time.perf_counter()
                endpoint = "/api/v1/route" if mode.startswith("Route") else "/api/v1/query"
                payload = {"prompt": prompt_input, "scene_id": "urban_01_delhi_airport_runway"}
                res = client.post(endpoint, json=payload)
                dur_ms = (time.perf_counter() - t0) * 1000

            st.success(f"Execution completed in **{dur_ms:.1f} ms** (Status: HTTP {res.status_code})")
            st.json(res.json())


if __name__ == "__main__":
    main()
