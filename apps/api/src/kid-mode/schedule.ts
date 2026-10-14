import type { QuietHours } from 'contracts';

// Mirror of the extension's src/lib/schedule.js `isQuiet` (pinned by test/fixtures/schedule/cases.json).
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEK_MINUTES = 7 * 24 * 60;

const parseTime = (s: unknown): number | null => {
  const m = typeof s === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes since Sunday 00:00 in `timeZone`, or null on a bad date or zone. */
function localMinuteOfWeek(timeZone: string, now: Date): number | null {
  try {
    if (Number.isNaN(now.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const day = WEEKDAYS[get('weekday') ?? ''];
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    if (day === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return day * 1440 + hour * 60 + minute;
  } catch {
    return null;
  }
}

/**
 * True when `now` falls inside any window of `quietHours` (days 0 = Sunday, evaluated in its time
 * zone; start inclusive, end exclusive; `end < start` crosses midnight). `null` or malformed → false.
 */
export function isInsideWindows(quietHours: QuietHours | null | undefined, now: Date): boolean {
  try {
    if (!quietHours || typeof quietHours.timezone !== 'string') return false;
    const at = localMinuteOfWeek(quietHours.timezone, now);
    if (at === null) return false;
    for (const w of Array.isArray(quietHours.windows) ? quietHours.windows : []) {
      if (!w || !Array.isArray(w.days)) continue;
      const start = parseTime(w.start);
      const end = parseTime(w.end);
      if (start === null || end === null || start === end) continue;
      const length = end > start ? end - start : 1440 - start + end;
      for (const d of w.days) {
        if (!Number.isInteger(d) || d < 0 || d > 6) continue;
        if ((at - (d * 1440 + start) + WEEK_MINUTES) % WEEK_MINUTES < length) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
