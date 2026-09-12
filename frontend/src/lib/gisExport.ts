"use client";

import { zip } from "@mapbox/shp-write";

import type { Classification, FeatureCollection, Provenance } from "@/types";

const WGS84_PRJ = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

function filename(base: string, extension: string): string {
  return `${base.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "solen_analysis"}.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportGeoJSON(collection: FeatureCollection, baseName = "solen_analysis"): void {
  download(new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" }), filename(baseName, "geojson"));
}

function coordinates(value: unknown): string {
  if (!Array.isArray(value)) return "";
  if (typeof value[0] === "number") return `${value[0]},${value[1]},${value[2] ?? 0}`;
  return value.map(coordinates).join(" ");
}

function geometryKml(geometry: GeoJSON.Geometry): string {
  if (geometry.type === "Point") return `<Point><coordinates>${coordinates(geometry.coordinates)}</coordinates></Point>`;
  if (geometry.type === "LineString") return `<LineString><coordinates>${coordinates(geometry.coordinates)}</coordinates></LineString>`;
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring, index) => index === 0 ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates(ring)}</coordinates></LinearRing></outerBoundaryIs>` : `<innerBoundaryIs><LinearRing><coordinates>${coordinates(ring)}</coordinates></LinearRing></innerBoundaryIs>`).join("") + "</Polygon>";
  if (geometry.type === "MultiPoint") return `<MultiGeometry>${geometry.coordinates.map((point) => `<Point><coordinates>${coordinates(point)}</coordinates></Point>`).join("")}</MultiGeometry>`;
  if (geometry.type === "MultiLineString") return `<MultiGeometry>${geometry.coordinates.map((line) => `<LineString><coordinates>${coordinates(line)}</coordinates></LineString>`).join("")}</MultiGeometry>`;
  if (geometry.type === "MultiPolygon") return `<MultiGeometry>${geometry.coordinates.map((polygon) => geometryKml({ type: "Polygon", coordinates: polygon })).join("")}</MultiGeometry>`;
  return "";
}

export function exportKML(collection: FeatureCollection, baseName = "solen_analysis"): void {
  const placemarks = collection.features.map((feature) => `<Placemark><name>${escapeXml(feature.properties.label)}</name><description>${escapeXml(JSON.stringify(feature.properties.extra))}</description>${geometryKml(feature.geometry)}</Placemark>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
  download(new Blob([body], { type: "application/vnd.google-earth.kml+xml" }), filename(baseName, "kml"));
}

function escapeXml(value: string): string { return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char); }

export function generateISO19115XML(
  collection: FeatureCollection,
  sceneId = "solen_analysis",
  provenance?: Provenance | null,
  classification: Classification = "unclassified"
): string {
  let west = -180, south = -90, east = 180, north = 90;
  if (collection.features.length > 0) {
    const coords: number[][] = [];
    const extractCoords = (val: unknown) => {
      if (Array.isArray(val)) {
        if (typeof val[0] === "number") coords.push(val as number[]);
        else val.forEach(extractCoords);
      }
    };
    collection.features.forEach((f) => {
      if (f.geometry && "coordinates" in f.geometry) {
        extractCoords((f.geometry as { coordinates: unknown }).coordinates);
      }
    });
    if (coords.length > 0) {
      west = Math.min(...coords.map((c) => c[0]));
      east = Math.max(...coords.map((c) => c[0]));
      south = Math.min(...coords.map((c) => c[1]));
      north = Math.max(...coords.map((c) => c[1]));
    }
  }

  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" xmlns:gml="http://www.opengis.net/gml">
  <gmd:fileIdentifier><gco:CharacterString>${escapeXml(sceneId)}</gco:CharacterString></gmd:fileIdentifier>
  <gmd:language><gco:CharacterString>eng</gco:CharacterString></gmd:language>
  <gmd:characterSet><gmd:MD_CharacterSetCode codeList="http://www.isotc211.org/2005/resources/Codelist/gmxCodelists.xml#MD_CharacterSetCode" codeListValue="utf8"/></gmd:characterSet>
  <gmd:dateStamp><gco:DateTime>${now}</gco:DateTime></gmd:dateStamp>
  <gmd:metadataStandardName><gco:CharacterString>ISO 19115 Geographic information - Metadata</gmd:CharacterString></gmd:metadataStandardName>
  <gmd:metadataStandardVersion><gco:CharacterString>ISO 19115-1:2014</gmd:CharacterString></gmd:metadataStandardVersion>
  <gmd:identificationInfo>
    <gmd:MD_DataIdentification>
      <gmd:citation>
        <gmd:CI_Citation>
          <gmd:title><gco:CharacterString>SOLEN Intelligence Dataset — ${escapeXml(sceneId)}</gco:CharacterString></gmd:title>
          <gmd:date><gmd:CI_Date><gmd:date><gco:DateTime>${now}</gco:DateTime></gmd:date><gmd:dateType><gmd:CI_DateTypeCode codeList="http://www.isotc211.org/2005/resources/Codelist/gmxCodelists.xml#CI_DateTypeCode" codeListValue="creation"/></gmd:dateType></gmd:CI_Date></gmd:date>
        </gmd:CI_Citation>
      </gmd:citation>
      <gmd:abstract><gco:CharacterString>Multispectral inference dataset produced by SOLEN AI. Method: ${escapeXml(provenance?.analysis_method ?? "remote_sensing")}. Source Scene: ${escapeXml(provenance?.source_filename ?? sceneId)}. SHA-256 Provenance: ${escapeXml(provenance?.sha256 ?? "N/A")}. Data Classification: ${classification.toUpperCase()}.</gco:CharacterString></gmd:abstract>
      <gmd:status><gmd:MD_ProgressCode codeList="http://www.isotc211.org/2005/resources/Codelist/gmxCodelists.xml#MD_ProgressCode" codeListValue="completed"/></gmd:status>
      <gmd:extent>
        <gmd:EX_Extent>
          <gmd:geographicElement>
            <gmd:EX_GeographicBoundingBox>
              <gmd:westBoundLongitude><gco:Decimal>${west.toFixed(6)}</gco:Decimal></gmd:westBoundLongitude>
              <gmd:eastBoundLongitude><gco:Decimal>${east.toFixed(6)}</gco:Decimal></gmd:eastBoundLongitude>
              <gmd:southBoundLatitude><gco:Decimal>${south.toFixed(6)}</gco:Decimal></gmd:southBoundLatitude>
              <gmd:northBoundLatitude><gco:Decimal>${north.toFixed(6)}</gco:Decimal></gmd:northBoundLatitude>
            </gmd:EX_GeographicBoundingBox>
          </gmd:geographicElement>
        </gmd:EX_Extent>
      </gmd:extent>
    </gmd:MD_DataIdentification>
  </gmd:identificationInfo>
  <gmd:dataQualityInfo>
    <gmd:DQ_DataQuality>
      <gmd:lineage>
        <gmd:LI_Lineage>
          <gmd:statement><gco:CharacterString>Processed via SOLEN Deterministic GIS &amp; CV Engine. SHA-256: ${escapeXml(provenance?.sha256 ?? "N/A")}. Spectral Bands: ${escapeXml((provenance?.bands_used ?? []).join(", ") || "optical")}. Security Classification: ${classification.toUpperCase()}.</gco:CharacterString></gmd:statement>
        </gmd:LI_Lineage>
      </gmd:lineage>
    </gmd:DQ_DataQuality>
  </gmd:dataQualityInfo>
</gmd:MD_Metadata>`;
}

export function exportISO19115XML(
  collection: FeatureCollection,
  baseName = "solen_analysis",
  provenance?: Provenance | null,
  classification: Classification = "unclassified"
): void {
  const xml = generateISO19115XML(collection, baseName, provenance, classification);
  download(new Blob([xml], { type: "application/xml" }), filename(baseName, "iso19115.xml"));
}

export async function exportShapefile(collection: FeatureCollection, baseName = "solen_analysis"): Promise<void> {
  if (!collection.features.length) throw new Error("There are no geospatial features to export.");
  const blob = await zip<"blob">(collection, { outputType: "blob", compression: "STORE", filename: baseName, prj: WGS84_PRJ });
  download(blob, filename(baseName, "zip"));
}

