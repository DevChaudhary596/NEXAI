"use client";

import type { Classification, QueryResponse } from "@/types";

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 8
): number {
  const words = text.replace(/[*_`#]/g, "").split(/\s+/);
  let line = "";
  let currentY = y;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
      linesDrawn++;
      if (linesDrawn >= maxLines) {
        ctx.fillText(line + "…", x, currentY);
        return currentY + lineHeight;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

export async function exportAnswerCardAsImage(params: {
  sceneId: string;
  prompt: string;
  response: QueryResponse;
  classification?: Classification;
}): Promise<void> {
  const { sceneId, prompt, response, classification = "unclassified" } = params;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675; // 16:9 ratio
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize canvas context.");

  // 1. Background gradient
  const bg = ctx.createLinearGradient(0, 0, 1200, 675);
  bg.addColorStop(0, "#020617");
  bg.addColorStop(0.5, "#0b1329");
  bg.addColorStop(1, "#020617");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 675);

  // 2. Subtle grid lines
  ctx.strokeStyle = "rgba(34, 197, 94, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 40; x < 1200; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 675);
    ctx.stroke();
  }
  for (let y = 40; y < 675; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  // 3. Glowing border
  ctx.strokeStyle = "rgba(34, 197, 94, 0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 1140, 615);

  // 4. Header Bar
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 13px monospace";
  ctx.fillText("SATQUERY AI // AUTONOMOUS GEOSPATIAL INTELLIGENCE DOSSIER", 60, 75);

  // Classification Badge
  const classText = classification.toUpperCase();
  ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
  ctx.fillRect(980, 58, 160, 26);
  ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
  ctx.strokeRect(980, 58, 160, 26);
  ctx.fillStyle = "#fca5a5";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(classText, 1060, 75);
  ctx.textAlign = "left";

  // 5. Query Box
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px monospace";
  ctx.fillText("ANALYST QUERY:", 60, 130);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 20px sans-serif";
  wrapText(ctx, `"${prompt}"`, 60, 160, 1080, 28, 2);

  // Divider
  ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
  ctx.beginPath();
  ctx.moveTo(60, 215);
  ctx.lineTo(1140, 215);
  ctx.stroke();

  // 6. Findings / Answer
  ctx.fillStyle = "#86efac";
  ctx.font = "bold 13px monospace";
  ctx.fillText("COMPUTED INTELLIGENCE FINDINGS:", 60, 250);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "15px sans-serif";
  wrapText(ctx, response.answer, 60, 280, 1080, 24, 6);

  // 7. Provenance & Metrics Box
  const prov = response.provenance;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(60, 480, 1080, 135);
  ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
  ctx.strokeRect(60, 480, 1080, 135);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 11px monospace";
  ctx.fillText("TRACEABLE PROVENANCE & CHAIN OF CUSTODY", 80, 508);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px monospace";
  ctx.fillText(`SCENE ID:   ${prov ? prov.scene_id : sceneId}`, 80, 535);
  ctx.fillText(`METHOD:     ${prov ? prov.analysis_method : response.routing.tool_call.action}`, 80, 560);
  ctx.fillText(`BANDS:      ${prov ? prov.bands_used.join(", ") : "RGB"}`, 80, 585);

  ctx.fillText(`SHA-256:    ${prov ? prov.sha256 : "Calculated at ingest"}`, 560, 535);
  ctx.fillText(`LATENCY:    ${response.timings.total_ms ? response.timings.total_ms.toFixed(0) + " ms" : "N/A"}`, 560, 560);
  if (response.uncertainty) {
    ctx.fillText(`UNCERTAINTY: ${response.uncertainty.lower.toFixed(1)}–${response.uncertainty.upper.toFixed(1)} (${response.uncertainty.method})`, 560, 585);
  }

  // Convert to PNG blob and download
  canvas.toBlob((blob) => {
    if (blob) {
      download(blob, `${sceneId}_intel_card.png`);
    }
  }, "image/png");
}
