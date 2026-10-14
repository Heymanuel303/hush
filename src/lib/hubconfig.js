// Hush — hub config validator.
//
// Validates the DeviceConfig the household hub sends (GET /api/device/config) before
// the extension stores it. The extension never trusts the hub: any violation rejects
// the WHOLE config so the previous one stays in place. Arrays over a cap are rejected,
// never truncated.
//
// Pure, no storage or DOM. Needs `compileRule` from lib/words.js, read from the shared
// scope (load words.js first) — or passed as the optional 3rd argument (the tests do).
// Loaded as a plain <script> and `require()`d by the Node tests.

// Same numbers as test/fixtures/device-config/caps.json (pinned by the tests).
const HUB_CAPS = {
  maxWords: 500,
  maxWordLength: 64,
  maxSiteWords: 200,
  maxPacks: 50,
  maxPackWords: 200,
  maxNameLength: 40,
  maxWindows: 14,
};

// Known per-site option keys (the SITE_OPTIONS in popup/panel-sites.js).
const HUB_SITE_OPTION_KEYS = ["ytHomeRedirect"];

function hubIsObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Returns the trimmed word list, or a string error.
function hubWords(list, max, label, compile) {
  if (!Array.isArray(list)) return `${label} must be an array`;
  if (list.length > max) return `${label} has more than ${max} entries`;
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") return `${label} must contain only strings`;
    const word = raw.trim();
    if (word.length < 1 || word.length > HUB_CAPS.maxWordLength) {
      return `${label} word must be 1..${HUB_CAPS.maxWordLength} characters`;
    }
    if (!compile(word)) return `${label} word "${word}" is not a usable rule`;
    out.push(word);
  }
  return out;
}

function hubQuietHours(q) {
  if (q === null) return null;
  if (!hubIsObject(q)) return "quietHours must be null or an object";
  if (typeof q.timezone !== "string" || !q.timezone) return "quietHours.timezone is required";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: q.timezone });
  } catch (e) {
    return "quietHours.timezone is not a valid time zone";
  }
  if (!Array.isArray(q.windows)) return "quietHours.windows must be an array";
  if (q.windows.length > HUB_CAPS.maxWindows) {
    return `quietHours has more than ${HUB_CAPS.maxWindows} windows`;
  }
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const windows = [];
  for (const w of q.windows) {
    if (!hubIsObject(w)) return "quietHours window must be an object";
    if (!Array.isArray(w.days) || w.days.length < 1 || w.days.length > 7) {
      return "quietHours window needs 1..7 days";
    }
    const seen = new Set();
    for (const d of w.days) {
      if (!Number.isInteger(d) || d < 0 || d > 6 || seen.has(d)) {
        return "quietHours window days must be unique integers 0..6";
      }
      seen.add(d);
    }
    if (typeof w.start !== "string" || !time.test(w.start)) return "quietHours start must be HH:MM";
    if (typeof w.end !== "string" || !time.test(w.end)) return "quietHours end must be HH:MM";
    if (w.start === w.end) return "quietHours window start and end must differ";
    windows.push({ days: w.days.slice(), start: w.start, end: w.end });
  }
  return { timezone: q.timezone, windows };
}

// → { ok: true, config } (normalised copy) or { ok: false, error }.
// `siteIds` = SITES.map(s => s.id); `compile` defaults to the shared-scope compileRule.
function validateDeviceConfig(obj, siteIds, compile) {
  const rule = compile || (typeof compileRule === "function" ? compileRule : null);
  if (!rule) return { ok: false, error: "no word compiler available" };
  const fail = (error) => ({ ok: false, error });
  try {
    if (!hubIsObject(obj)) return fail("config must be an object");
    const ids = Array.isArray(siteIds) ? siteIds : [];

    if (!Number.isInteger(obj.version) || obj.version < 1) {
      return fail("version must be a positive integer");
    }
    if (typeof obj.profileName !== "string" || obj.profileName.trim().length > HUB_CAPS.maxNameLength) {
      return fail(`profileName must be a string of at most ${HUB_CAPS.maxNameLength} characters`);
    }
    if (typeof obj.locked !== "boolean") return fail("locked must be a boolean");

    const blockWords = hubWords(obj.blockWords, HUB_CAPS.maxWords, "blockWords", rule);
    if (typeof blockWords === "string") return fail(blockWords);

    if (!Array.isArray(obj.enabledPacks)) return fail("enabledPacks must be an array");
    if (obj.enabledPacks.length > HUB_CAPS.maxPacks) {
      return fail(`enabledPacks has more than ${HUB_CAPS.maxPacks} entries`);
    }
    if (obj.enabledPacks.some((n) => typeof n !== "string")) {
      return fail("enabledPacks must contain only strings");
    }
    const enabledPacks = obj.enabledPacks.map((n) => n.trim());

    if (!Array.isArray(obj.packs)) return fail("packs must be an array");
    if (obj.packs.length > HUB_CAPS.maxPacks) return fail(`packs has more than ${HUB_CAPS.maxPacks} entries`);
    const packs = [];
    for (const p of obj.packs) {
      if (!hubIsObject(p) || typeof p.name !== "string") return fail("each pack needs a name");
      const name = p.name.trim();
      if (!name || name.length > HUB_CAPS.maxNameLength) {
        return fail(`pack name must be 1..${HUB_CAPS.maxNameLength} characters`);
      }
      const words = hubWords(p.words, HUB_CAPS.maxPackWords, `pack "${name}"`, rule);
      if (typeof words === "string") return fail(words);
      packs.push({ name, words });
    }

    if (!hubIsObject(obj.siteWords)) return fail("siteWords must be an object");
    const siteWords = {};
    for (const key of Object.keys(obj.siteWords)) {
      if (!ids.includes(key)) return fail(`siteWords has unknown site "${key}"`);
      const words = hubWords(obj.siteWords[key], HUB_CAPS.maxSiteWords, `siteWords.${key}`, rule);
      if (typeof words === "string") return fail(words);
      siteWords[key] = words;
    }

    if (!hubIsObject(obj.siteOptions)) return fail("siteOptions must be an object");
    const siteOptions = {};
    for (const key of Object.keys(obj.siteOptions)) {
      if (!HUB_SITE_OPTION_KEYS.includes(key)) return fail(`siteOptions has unknown key "${key}"`);
      if (typeof obj.siteOptions[key] !== "boolean") return fail(`siteOptions.${key} must be a boolean`);
      siteOptions[key] = obj.siteOptions[key];
    }

    const quietHours = hubQuietHours(obj.quietHours === undefined ? undefined : obj.quietHours);
    if (typeof quietHours === "string") return fail(quietHours);

    return {
      ok: true,
      config: {
        version: obj.version,
        profileName: obj.profileName.trim(),
        locked: obj.locked,
        blockWords,
        enabledPacks,
        packs,
        siteWords,
        siteOptions,
        quietHours,
      },
    };
  } catch (e) {
    return fail("config could not be read");
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HUB_CAPS, HUB_SITE_OPTION_KEYS, validateDeviceConfig };
}
