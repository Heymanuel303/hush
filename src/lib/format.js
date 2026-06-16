// Hush — display formatting helpers (popup only).
//
// Pure functions, loaded as a plain <script> by panel.html before panel.js and
// `require()`d by the Node test suite. The trailing `module.exports` is a no-op
// in the browser and the export hook for `node --test`.

// Locale-aware integer formatting, e.g. 12345 → "12,345" in en-US.
function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

// Human "time saved" estimate from a count of seconds: "<1m", "5m", "2h 10m",
// "1d 3h". Rounds to the nearest minute and shows at most two units.
function formatDuration(totalSeconds) {
  const m = Math.round(totalSeconds / 60);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { formatNumber, formatDuration };
}
