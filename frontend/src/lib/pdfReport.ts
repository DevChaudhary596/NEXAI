/**
 * Client-side "Export Intelligence Report" — a one-page PDF a decision-maker
 * (municipal engineer, insurance adjuster) can forward without opening the
 * app. Built entirely in the browser with jsPDF: no new backend endpoint,
 * and the only image it embeds is the scene's own JPEG thumbnail (already
 * served by the backend), so there's no live-map screenshot/CORS fragility
 * to worry about.
 */
import jsPDF from "jspdf";
import type { QueryResponse, UploadResponse } from "@/types";

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function toolCallLabel(response: QueryResponse): string {
  const call = response.routing.tool_call;
  switch (call.action) {
    case "detection":
      return `Detection — target: ${call.target}`;
    case "segmentation":
      return `Segmentation — target: ${call.target}`;
    case "spectral":
      return `Spectral — ${call.index.toUpperCase()} ${call.operator} ${call.threshold}${call.bi_temporal ? " (bi-temporal)" : ""}`;
    default:
      return "General visual question";
  }
}

export async function exportIntelligenceReport(params: {
  sceneName: string;
  scene: UploadResponse | null;
  thumbnailUrl: string;
  question: string;
  response: QueryResponse;
}): Promise<void> {
  const { sceneName, scene, thumbnailUrl, question, response } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("SatQuery AI — Intelligence Report", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 20;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Scene thumbnail
  const dataUrl = await imageUrlToDataUrl(thumbnailUrl);
  const imgSize = 180;
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, "JPEG", margin, y, imgSize, imgSize);
    } catch {
      /* unreadable image format - continue without it rather than fail the whole export */
    }
  }

  // Scene metadata, to the right of the thumbnail
  const textX = margin + imgSize + 24;
  let ty = y + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(sceneName, textX, ty);
  ty += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const metaLines: string[] = [];
  if (scene?.satellite) metaLines.push(`Satellite: ${scene.satellite}`);
  if (scene?.capture_date) metaLines.push(`Pass date: ${scene.capture_date}`);
  if (scene?.cloud_cover_pct != null) metaLines.push(`Cloud cover: ${scene.cloud_cover_pct.toFixed(1)}%`);
  if (scene?.resolution_m) metaLines.push(`Resolution: ${scene.resolution_m}m / pixel`);
  if (scene?.crs) metaLines.push(`CRS: ${scene.crs}`);
  if (scene?.bounds) {
    const [w, s, e, n] = scene.bounds;
    metaLines.push(`Bounds: ${s.toFixed(4)}, ${w.toFixed(4)} to ${n.toFixed(4)}, ${e.toFixed(4)}`);
  }
  for (const line of metaLines) {
    doc.text(line, textX, ty);
    ty += 14;
  }

  y += imgSize + 28;

  // Query
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Query", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  const questionLines = doc.splitTextToSize(question, pageWidth - margin * 2);
  doc.text(questionLines, margin, y);
  y += questionLines.length * 13 + 10;

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(toolCallLabel(response), margin, y);
  y += 22;

  // Findings
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Findings", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  const answerLines = doc.splitTextToSize(response.answer, pageWidth - margin * 2);
  doc.text(answerLines, margin, y);
  y += answerLines.length * 13 + 16;

  // Stats table
  const statEntries = Object.entries(response.stats);
  if (statEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Statistics", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    for (const [key, val] of statEntries) {
      const formatted = typeof val === "number" && val % 1 !== 0 ? val.toFixed(3) : String(val);
      doc.text(`${key.replace(/_/g, " ")}:`, margin, y);
      doc.text(formatted, margin + 160, y);
      y += 15;
    }
    y += 10;
  }

  if (response.geojson.features.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${response.geojson.features.length} geospatial feature(s) identified in this pass.`, margin, y);
    y += 16;
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Generated by SatQuery AI - remote-sensing vision-language assistant. Figures are computed directly from the imagery, not model-generated.",
    margin,
    pageHeight - 26
  );

  const safeName = sceneName.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`SatQuery_Report_${safeName}.pdf`);
}
