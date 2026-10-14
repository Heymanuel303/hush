// Hush — quiet hours.
//
// The single definition of quiet-hour semantics on the extension side (the hub's
// api mirrors it in schedule.ts; both are pinned by test/fixtures/schedule/cases.json).
//
// Hub rules apply INSIDE the windows; a profile with no quietHours (null/absent)
// means the rules apply always. This file only answers "is `now` inside a window";
// callers decide what that means for filtering.
//
//   quietHours = { timezone, windows: [{ days: [0..6], start: "HH:MM", end: "HH:MM" }] }
//
// days use 0 = Sunday … 6 = Saturday, evaluated in `quietHours.timezone`. Start is
// inclusive, end exclusive. An `end` before `start` crosses midnight, and the part
// after midnight counts for the day the window started on.
//
// Pure functions, never throw. Loaded as a plain <script> (content script / background)
// and `require()`d by the Node tests.

const SCHEDULE_WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const SCHEDULE_WEEK_MINUTES = 7 * 24 * 60;

// "HH:MM" → minutes since midnight, or null when malformed.
function scheduleParseTime(s) {
  const m = typeof s === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Minutes since Sunday 00:00 in `timeZone` for `now`, or null on a bad date/zone.
function scheduleLocalMinuteOfWeek(timeZone, now) {
  try {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type) => (parts.find((p) => p.type === type) || {}).value;
    const day = SCHEDULE_WEEKDAYS[get("weekday")];
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (day === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return day * 1440 + hour * 60 + minute;
  } catch (e) {
    return null;
  }
}

// Each usable window as week-minute intervals [from, to) (to may exceed the week;
// callers wrap). Malformed windows are skipped.
function scheduleIntervals(quietHours) {
  const out = [];
  const windows = quietHours && Array.isArray(quietHours.windows) ? quietHours.windows : [];
  for (const w of windows) {
    if (!w || !Array.isArray(w.days)) continue;
    const start = scheduleParseTime(w.start);
    const end = scheduleParseTime(w.end);
    if (start === null || end === null || start === end) continue;
    const length = end > start ? end - start : 1440 - start + end;
    for (const d of w.days) {
      if (!Number.isInteger(d) || d < 0 || d > 6) continue;
      out.push({ from: d * 1440 + start, length });
    }
  }
  return out;
}

// True when `now` falls inside any window. Anything malformed → false.
function isQuiet(quietHours, now) {
  try {
    if (!quietHours || typeof quietHours.timezone !== "string") return false;
    const at = scheduleLocalMinuteOfWeek(quietHours.timezone, now);
    if (at === null) return false;
    return scheduleIntervals(quietHours).some(
      ({ from, length }) => (at - from + SCHEDULE_WEEK_MINUTES) % SCHEDULE_WEEK_MINUTES < length
    );
  } catch (e) {
    return false;
  }
}

// The Date of the next window start or end strictly after `now`'s minute, or null
// when there are no usable windows. Computed from wall-clock minutes, so across a
// DST change it can be an hour off — callers should re-run isQuiet when it fires.
function nextBoundary(quietHours, now) {
  try {
    if (!quietHours || typeof quietHours.timezone !== "string") return null;
    const at = scheduleLocalMinuteOfWeek(quietHours.timezone, now);
    if (at === null) return null;
    let best = null;
    for (const { from, length } of scheduleIntervals(quietHours)) {
      for (const edge of [from, from + length]) {
        let delta = (edge - at) % SCHEDULE_WEEK_MINUTES;
        if (delta <= 0) delta += SCHEDULE_WEEK_MINUTES;
        if (best === null || delta < best) best = delta;
      }
    }
    if (best === null) return null;
    return new Date(now.getTime() - (now.getTime() % 60000) + best * 60000);
  } catch (e) {
    return null;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isQuiet, nextBoundary };
}
