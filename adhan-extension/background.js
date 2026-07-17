const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const API_BASE = "https://api.aladhan.com/v1/timingsByCity";

// ---------- Helpers ----------

function pad(n) {
  return n.toString().padStart(2, "0");
}

function todayDMY() {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

async function getSettings() {
  const defaults = {
    city: "",
    country: "",
    method: 2, // Islamic Society of North America default; user can change
    enabled: true
  };
  const stored = await chrome.storage.sync.get(defaults);
  return stored;
}

// Turn "HH:mm" (assumed to be local time of the browser, i.e. the city you're actually in)
// into today's Date object.
function timeStringToDate(hhmm) {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function fetchTimings(settings) {
  const url = `${API_BASE}?city=${encodeURIComponent(
    settings.city
  )}&country=${encodeURIComponent(settings.country)}&method=${settings.method}&date=${todayDMY()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan API error: ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error("Aladhan API returned non-200 code");
  return json.data.timings; // { Fajr: "04:30", Dhuhr: "12:15", ... }
}

async function clearAdhanAlarms() {
  const all = await chrome.alarms.getAll();
  const clears = all
    .filter((a) => a.name.startsWith("adhan:"))
    .map((a) => chrome.alarms.clear(a.name));
  await Promise.all(clears);
}

async function scheduleToday() {
  const settings = await getSettings();

  if (!settings.enabled) return;
  if (!settings.city || !settings.country) {
    console.log("Adhan Reminder: city/country not set yet.");
    return;
  }

  await clearAdhanAlarms();

  let timings;
  try {
    timings = await fetchTimings(settings);
  } catch (err) {
    console.error("Adhan Reminder: failed to fetch timings", err);
    return;
  }

  const now = Date.now();

  for (const prayer of PRAYERS) {
    const raw = timings[prayer]; // e.g. "13:05 (CEST)" sometimes includes tz suffix
    if (!raw) continue;
    const clean = raw.split(" ")[0]; // strip any "(TZ)" suffix
    const prayerDate = timeStringToDate(clean);
    const prayerTime = prayerDate.getTime();
    const preTime = prayerTime - 5 * 60 * 1000;

    // Only schedule alarms that are still in the future today
    if (preTime > now) {
      chrome.alarms.create(`adhan:${prayer}:pre`, { when: preTime });
    }
    if (prayerTime > now) {
      chrome.alarms.create(`adhan:${prayer}:now`, { when: prayerTime });
    }
  }

  // Store today's timings so the popup can show "next prayer"
  await chrome.storage.local.set({ todayTimings: timings, fetchedFor: todayDMY() });

  // Schedule a refresh shortly after midnight to pull tomorrow's timings
  const midnight = new Date();
  midnight.setHours(24, 0, 30, 0); // 00:00:30 tomorrow
  chrome.alarms.create("adhan:refresh", { when: midnight.getTime() });
}

function notify(title, message) {
  chrome.notifications.create(
    `adhan-${Date.now()}`,
    {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 2,
      requireInteraction: true
    }
  );
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "adhan:refresh") {
    await scheduleToday();
    return;
  }

  const match = alarm.name.match(/^adhan:(\w+):(pre|now)$/);
  if (!match) return;
  const [, prayer, when] = match;

  if (when === "pre") {
    notify("Adhan in 5 minutes 🕌", `${prayer} is coming up in 5 minutes. Time to take out your earphones, don't you think?`);
  } else {
    notify("Adhan time 🕌", `It's time for ${prayer}.`);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleToday();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleToday();
});

// Let the popup trigger an immediate reschedule after settings change
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RESCHEDULE") {
    scheduleToday().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
});
