# SatQuery AI (SIH26167) — QA Evaluation Scorecard

**Run Timestamp:** `2026-09-03 00:24:09`  
**Test Mode:** `ROUTER`  
**Lead Evaluator:** Member 6 (QA Lead)

---

## 📊 High-Level KPI Summary

| Metric | Measured Value | Acceptance Threshold | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Pass Rate** | **100.0%** (50/50) | $\ge 80.0\%$ | ✅ PASS |
| **Average Latency** | **6.67 ms** | $< 4,000\text{ ms}$ | ✅ OPTIMAL |
| **Max Peak Latency** | **19.42 ms** | $< 6,000\text{ ms}$ | ✅ PASS |
| **Peak Resident RAM** | **70.76 MB** | $< 4,000\text{ MB}$ | ✅ LIGHTWEIGHT |
| **Zero GPU Compliance**| **100% CPU** | Pure CPU Execution | ✅ MET |

---

## 📋 Detailed Query Log (Sample)

| ID | Category | Complexity | Expected Path | Actual Path | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Q-001` | counting | simple | `detection` | `detection` | 19.4 ms | ✅ PASS |
| `Q-002` | detection | simple | `detection` | `detection` | 6.1 ms | ✅ PASS |
| `Q-003` | counting | simple | `detection` | `detection` | 4.9 ms | ✅ PASS |
| `Q-004` | detection | moderate | `detection` | `detection` | 6.2 ms | ✅ PASS |
| `Q-005` | counting | simple | `detection` | `detection` | 6.8 ms | ✅ PASS |
| `Q-006` | detection | simple | `detection` | `detection` | 5.4 ms | ✅ PASS |
| `Q-007` | counting | moderate | `detection` | `detection` | 6.2 ms | ✅ PASS |
| `Q-008` | detection | moderate | `detection` | `detection` | 5.3 ms | ✅ PASS |
| `Q-009` | detection | moderate | `detection` | `detection` | 6.0 ms | ✅ PASS |
| `Q-010` | counting | complex | `detection` | `detection` | 6.7 ms | ✅ PASS |
| `Q-011` | counting | moderate | `detection` | `detection` | 5.4 ms | ✅ PASS |
| `Q-012` | detection | complex | `detection` | `detection` | 6.6 ms | ✅ PASS |
| `Q-013` | counting | simple | `vqa` | `general_vqa` | 6.0 ms | ✅ PASS |
| `Q-014` | counting | complex | `detection` | `detection` | 5.8 ms | ✅ PASS |
| `Q-015` | detection | complex | `detection` | `detection` | 12.0 ms | ✅ PASS |
| `Q-016` | segmentation | simple | `segmentation` | `segmentation` | 7.2 ms | ✅ PASS |
| `Q-017` | segmentation | simple | `segmentation` | `segmentation` | 5.4 ms | ✅ PASS |
| `Q-018` | spectral | moderate | `spectral` | `spectral` | 5.5 ms | ✅ PASS |
| `Q-019` | segmentation | moderate | `segmentation` | `segmentation` | 6.2 ms | ✅ PASS |
| `Q-020` | spectral | moderate | `spectral` | `spectral` | 5.8 ms | ✅ PASS |

*...and 30 more test queries logged in [`qa_run_latest.json`](file:///C:/Users/Dell/Documents/SIH2026/qa_eval/reports/qa_run_latest.json)*
