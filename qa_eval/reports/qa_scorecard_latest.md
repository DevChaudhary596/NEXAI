# SatQuery AI (SIH26167) — QA Evaluation Scorecard

**Run Timestamp:** `2026-09-02 22:31:45`  
**Test Mode:** `ROUTER`  
**Lead Evaluator:** Member 6 (QA Lead)

---

## 📊 High-Level KPI Summary

| Metric | Measured Value | Acceptance Threshold | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Pass Rate** | **100.0%** (5/5) | $\ge 80.0\%$ | ✅ PASS |
| **Average Latency** | **5.55 ms** | $< 4,000\text{ ms}$ | ✅ OPTIMAL |
| **Max Peak Latency** | **6.82 ms** | $< 6,000\text{ ms}$ | ✅ PASS |
| **Peak Resident RAM** | **297.92 MB** | $< 4,000\text{ MB}$ | ✅ LIGHTWEIGHT |
| **Zero GPU Compliance**| **100% CPU** | Pure CPU Execution | ✅ MET |

---

## 📋 Detailed Query Log (Sample)

| ID | Category | Complexity | Expected Path | Actual Path | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Q-001` | counting | simple | `detection` | `detection` | 6.1 ms | ✅ PASS |
| `Q-002` | detection | simple | `detection` | `detection` | 6.8 ms | ✅ PASS |
| `Q-003` | counting | simple | `detection` | `detection` | 5.3 ms | ✅ PASS |
| `Q-004` | detection | moderate | `detection` | `detection` | 4.5 ms | ✅ PASS |
| `Q-005` | counting | simple | `detection` | `detection` | 5.0 ms | ✅ PASS |
