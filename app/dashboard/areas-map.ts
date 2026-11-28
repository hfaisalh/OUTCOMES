/**
 * areas-map.ts
 *
 * What it does: puts a real map (Leaflet, with OpenStreetMap tiles) under the Dashboard's "Where beneficiaries are" card (DECISIONS 279). Each place is a circle sized by how many beneficiaries are there, labelled with its name and count. The plain layout drawn by areas-page.ts stays underneath as the fallback, so the card still shows something when the map cannot load (no internet, blocked tiles).
 * Who calls it: app/main.ts, after every draw. Depends on: leaflet (loaded only when a map is needed, so other pages do not pay for it), and the card's #ar-leaflet element, which carries the places as JSON in data-rows.
 * Data flow: the card is redrawn often, which replaces its element. The map is built once and kept in a detached host that is moved into the new element, so it does not flash and the tiles are not fetched again. Only the circles are replaced.
 * Rules: the tiles come from tile.openstreetmap.org, which asks for light use and credit: the credit is shown on the map, the map zooms to the places and no further than street level is needed (zoom 12 at most), and scrolling the page does not zoom the map by accident. Only place names and positions are shown, never a person.
 */

import type { PlaceCount } from "../../modules/14-locations/areas";

// --- State kept between redraws ---
let host: HTMLElement | undefined;
let layer: { clearLayers(): void; addLayer(l: unknown): void; getBounds(): { isValid(): boolean } } | undefined;
let map: { fitBounds(b: unknown, o: unknown): void; invalidateSize(): void; setView(c: [number, number], z: number): void } | undefined;

// --- Mounting ---
export async function mountAreasMap(): Promise<void> {
  const el = typeof document === "undefined" ? null : document.getElementById("ar-leaflet");
  if (!el) return;
  let rows: PlaceCount[] = [];
  try { rows = JSON.parse(el.dataset["rows"] ?? "[]") as PlaceCount[]; } catch { rows = []; }
  if (rows.length === 0) return; // nothing to show: the card says so itself
  try {
    const L = (await import("leaflet")).default;
    await import("leaflet/dist/leaflet.css");
    if (!document.body.contains(el)) return; // the page changed while the map was loading
    if (!host || !map || !layer) {
      host = document.createElement("div");
      host.className = "ar-leaflet-host";
      const m = L.map(host, { scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "&copy; OpenStreetMap contributors" }).addTo(m);
      const g = L.featureGroup().addTo(m);
      map = m as never; layer = g as never;
    }
    el.classList.add("ar-live");
    el.replaceChildren(host);
    layer.clearLayers();
    const max = Math.max(...rows.map((r) => r.count));
    for (const r of rows) {
      const dot = L.circleMarker([r.lat, r.lon], { radius: Math.round(8 + 14 * Math.sqrt(r.count / max)), color: "#2f4b9a", weight: 1.5, fillColor: "#2f4b9a", fillOpacity: 0.5 });
      dot.bindTooltip(`${r.name}: ${r.count}`, { permanent: true, direction: "bottom", offset: [0, 4], className: "ar-tip" });
      layer.addLayer(dot);
    }
    map.invalidateSize();
    if (rows.length === 1) map.setView([rows[0]!.lat, rows[0]!.lon], 8);
    else map.fitBounds(layer.getBounds(), { padding: [70, 70], maxZoom: 9 });
  } catch {
    // Rule: a map that cannot load leaves the plain layout in place.
  }
}
