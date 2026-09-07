# SatQuery AI (SIH26167) — QA Evaluation Scorecard

**Run Timestamp:** `2026-09-03 08:49:50`  
**Test Mode:** `ROUTER`  
**Lead Evaluator:** Member 6 (QA Lead)

---

## 📊 High-Level KPI Summary

| Metric | Measured Value | Acceptance Threshold | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Pass Rate** | **100.0%** (5/5) | $\ge 80.0\%$ | ✅ PASS |
| **Average Latency** | **9.26 ms** | $< 4,000\text{ ms}$ | ✅ OPTIMAL |
| **Max Peak Latency** | **15.27 ms** | $< 6,000\text{ ms}$ | ✅ PASS |
| **Peak Resident RAM** | **353.19 MB** | $< 4,000\text{ MB}$ | ✅ LIGHTWEIGHT |
| **Zero GPU Compliance**| **100% CPU** | Pure CPU Execution | ✅ MET |

---

## 📋 Detailed Query Log (Sample)

| ID | Category | Complexity | Expected Path | Actual Path | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Q-001` | counting | simple | `detection` | `detection` | 8.4 ms | ✅ PASS |
| `Q-002` | detection | simple | `detection` | `detection` | 9.0 ms | ✅ PASS |
| `Q-003` | counting | simple | `detection` | `detection` | 7.4 ms | ✅ PASS |
| `Q-004` | detection | moderate | `detection` | `detection` | 6.2 ms | ✅ PASS |
| `Q-005` | counting | simple | `detection` | `detection` | 15.3 ms | ✅ PASS |
