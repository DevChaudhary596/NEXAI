# SatQuery AI (SIH26167) — QA Evaluation Scorecard

**Run Timestamp:** `2026-09-02 21:57:51`  
**Test Mode:** `ROUTER`  
**Lead Evaluator:** Member 6 (QA Lead)

---

## 📊 High-Level KPI Summary

| Metric | Measured Value | Acceptance Threshold | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Pass Rate** | **100.0%** (5/5) | $\ge 80.0\%$ | ✅ PASS |
| **Average Latency** | **6.09 ms** | $< 4,000\text{ ms}$ | ✅ OPTIMAL |
| **Max Peak Latency** | **10.4 ms** | $< 6,000\text{ ms}$ | ✅ PASS |
| **Peak Resident RAM** | **298.18 MB** | $< 4,000\text{ MB}$ | ✅ LIGHTWEIGHT |
| **Zero GPU Compliance**| **100% CPU** | Pure CPU Execution | ✅ MET |

---

## 📋 Detailed Query Log (Sample)

| ID | Category | Complexity | Expected Path | Actual Path | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Q-001` | counting | simple | `detection` | `detection` | 10.4 ms | ✅ PASS |
| `Q-002` | detection | simple | `detection` | `detection` | 5.4 ms | ✅ PASS |
| `Q-003` | counting | simple | `detection` | `detection` | 5.4 ms | ✅ PASS |
| `Q-004` | detection | moderate | `detection` | `detection` | 5.3 ms | ✅ PASS |
| `Q-005` | counting | simple | `detection` | `detection` | 3.9 ms | ✅ PASS |
