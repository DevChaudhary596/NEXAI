# SatQuery AI (SIH26167) — QA Evaluation Scorecard

**Run Timestamp:** `2026-09-08 09:02:14`  
**Test Mode:** `ROUTER`  
**Lead Evaluator:** Member 6 (QA Lead)

---

## 📊 High-Level KPI Summary

| Metric | Measured Value | Acceptance Threshold | Evaluation Status |
| :--- | :--- | :--- | :--- |
| **Pass Rate** | **100.0%** (5/5) | $\ge 80.0\%$ | ✅ PASS |
| **Average Latency** | **2.61 ms** | $< 4,000\text{ ms}$ | ✅ OPTIMAL |
| **Max Peak Latency** | **3.6 ms** | $< 6,000\text{ ms}$ | ✅ PASS |
| **Peak Resident RAM** | **590.73 MB** | $< 4,000\text{ MB}$ | ✅ LIGHTWEIGHT |
| **Zero GPU Compliance**| **100% CPU** | Pure CPU Execution | ✅ MET |

---

## 📋 Detailed Query Log (Sample)

| ID | Category | Complexity | Expected Path | Actual Path | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Q-001` | counting | simple | `detection` | `detection` | 3.6 ms | ✅ PASS |
| `Q-002` | detection | simple | `detection` | `detection` | 2.5 ms | ✅ PASS |
| `Q-003` | counting | simple | `detection` | `detection` | 2.2 ms | ✅ PASS |
| `Q-004` | detection | moderate | `detection` | `detection` | 2.3 ms | ✅ PASS |
| `Q-005` | counting | simple | `detection` | `detection` | 2.4 ms | ✅ PASS |
