/**
 * Client-side "Export Intelligence Report" — a multi-page formal PDF dossier
 * suitable for executive and government briefings.
 * Built with jsPDF: no external server-side renderer required.
 */
import jsPDF from "jspdf";
import type { Classification, QueryResponse, UploadResponse } from "@/types";

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

async function solenLogoDataUrl(): Promise<string | null> {
  try {
    const dataUrl = await imageUrlToDataUrl("/images/solen_logo_light.png");
    if (dataUrl) return dataUrl;
    return await imageUrlToDataUrl("/images/solen_logo_dark.png");
  } catch {
    return null;
  }
}

function toolCallLabel(response: QueryResponse): string {
  const call = response.routing.tool_call;
  switch (call.action) {
    case "detection":
      return `Detection — Target: ${call.target}`;
    case "segmentation":
      return `Segmentation — Target: ${call.target}`;
    case "spectral":
      return `Spectral Analysis — ${call.index.toUpperCase()} ${call.operator} ${call.threshold}${call.bi_temporal ? " (bi-temporal)" : ""}`;
    default:
      return "General Multispectral Visual Query";
  }
}

export async function exportIntelligenceReport(params: {
  sceneName: string;
  scene: UploadResponse | null;
  thumbnailUrl: string;
  question: string;
  response: QueryResponse;
  workspaceName?: string;
  classification?: Classification;
}): Promise<void> {
  const {
    sceneName,
    scene,
    thumbnailUrl,
    question,
    response,
    workspaceName = "Primary Workspace",
    classification = "unclassified",
  } = params;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const classLabel = classification.toUpperCase();
  const isRestricted = classification !== "unclassified";

  // ── Header Banner Bar ──────────────────────────────────────────
  doc.setFillColor(isRestricted ? 185 : 30, isRestricted ? 28 : 41, isRestricted ? 28 : 59);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`SECURITY CLASSIFICATION: ${classLabel}`, pageWidth / 2, 16, { align: "center" });

  y = 48;

  // SOLEN's approved logo is embedded from the shipped brand asset, so the
  // downloaded dossier remains branded even when opened outside the app.
  const logoDataUrl = await solenLogoDataUrl();
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, y - 10, 96, 30);
    } catch {
      // A report remains usable if a browser blocks the local brand asset.
    }
  }
  y += 30;

  // ── Document Title ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("SOLEN — Intelligence Dossier", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Workspace: ${workspaceName}  ·  Generated: ${new Date().toLocaleString()} UTC  ·  Status: Verified Analysis`,
    margin,
    y
  );
  y += 16;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Scene Thumbnail & Observation Metadata ─────────────────────
  const dataUrl = await imageUrlToDataUrl(thumbnailUrl);
  const imgSize = 150;
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, "JPEG", margin, y, imgSize, imgSize);
    } catch {
      /* continue without thumbnail */
    }
  }

  const textX = margin + imgSize + 20;
  let ty = y + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(sceneName, textX, ty);
  ty += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  const metaLines: string[] = [];
  if (scene?.satellite) metaLines.push(`Satellite Sensor: ${scene.satellite}`);
  if (scene?.capture_date) metaLines.push(`Observation Timestamp: ${scene.capture_date}`);
  if (scene?.cloud_cover_pct != null) metaLines.push(`Cloud Cover: ${scene.cloud_cover_pct.toFixed(1)}%`);
  if (scene?.resolution_m) metaLines.push(`Ground Sample Distance: ${scene.resolution_m}m / px`);
  if (scene?.crs) metaLines.push(`Coordinate System: ${scene.crs}`);
  if (scene?.bounds) {
    const [w, s, e, n] = scene.bounds;
    metaLines.push(`Geographic Extent: ${s.toFixed(3)}, ${w.toFixed(3)} to ${n.toFixed(3)}, ${e.toFixed(3)}`);
  }

  for (const line of metaLines) {
    doc.text(line, textX, ty);
    ty += 14;
  }

  y += imgSize + 22;

  // ── Query & Method ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Operational Query", margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const questionLines = doc.splitTextToSize(`"${question}"`, pageWidth - margin * 2);
  doc.text(questionLines, margin, y);
  y += questionLines.length * 12 + 6;

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Methodology: ${toolCallLabel(response)}`, margin, y);
  y += 18;

  // ── Findings ───────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Computed Intelligence Findings", margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const answerLines = doc.splitTextToSize(response.answer, pageWidth - margin * 2);
  doc.text(answerLines, margin, y);
  y += answerLines.length * 12 + 14;

  // ── Statistical Metrics & Detections ───────────────────────────
  const statEntries = Object.entries(response.stats);
  const detectedFeatures = response.geojson?.features || [];

  if (detectedFeatures.length > 0 || statEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Quantitative Metrics & Target Inventory", margin, y);
    y += 14;

    if (detectedFeatures.length > 0) {
      const classMap: Record<string, number> = {};
      for (const f of detectedFeatures) {
        const lbl = f.properties?.label || "target";
        classMap[lbl] = (classMap[lbl] || 0) + 1;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`• TOTAL DETECTED OBJECTS: ${detectedFeatures.length} Targets`, margin + 10, y);
      y += 13;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      for (const [clsName, cnt] of Object.entries(classMap)) {
        const pct = ((cnt / detectedFeatures.length) * 100).toFixed(1);
        doc.text(`    - ${clsName}: ${cnt} (${pct}%)`, margin + 10, y);
        y += 12;
      }
      y += 4;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    for (const [key, val] of statEntries) {
      if (key === "count" && detectedFeatures.length > 0) continue;
      const formatted = typeof val === "number" && val % 1 !== 0 ? val.toFixed(3) : String(val);
      doc.text(`• ${key.replace(/_/g, " ").toUpperCase()}:`, margin + 10, y);
      doc.text(formatted, margin + 180, y);
      y += 12;
    }
    y += 8;
  }

  // ── Provenance & Uncertainty Box ───────────────────────────────
  const prov = response.provenance;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 70, 4, 4, "FD");

  let py = y + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Chain of Custody & Traceable Provenance", margin + 12, py);
  py += 13;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (prov) {
    doc.text(`Scene ID: ${prov.scene_id}  ·  Input: ${prov.source_type}`, margin + 12, py);
    py += 11;
    doc.text(`Bands: ${prov.bands_used.join(", ")}  ·  Method: ${prov.analysis_method}`, margin + 12, py);
    py += 11;
    doc.text(`SHA-256: ${prov.sha256}`, margin + 12, py);
    py += 11;
  }
  if (response.uncertainty) {
    doc.setFont("helvetica", "normal");
    doc.text(`Uncertainty: ${response.uncertainty.lower.toFixed(1)}–${response.uncertainty.upper.toFixed(1)} (${response.uncertainty.method}). ${response.uncertainty.caveat}`, margin + 12, py);
  }

  y += 85;

  // ── Formal Sign-off Block ──────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Analyst Signature: _______________________", margin, y);
  doc.text("Reviewer Sign-off: _______________________", pageWidth / 2, y);

  // ── Bottom Classification Footer ───────────────────────────────
  doc.setFillColor(isRestricted ? 185 : 30, isRestricted ? 28 : 41, isRestricted ? 28 : 59);
  doc.rect(0, pageHeight - 20, pageWidth, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`SECURITY CLASSIFICATION: ${classLabel}`, pageWidth / 2, pageHeight - 6, { align: "center" });

  const safeName = sceneName.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`SOLEN_Dossier_${safeName}.pdf`);
}
