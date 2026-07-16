const cityEl = document.getElementById("city");
const countryEl = document.getElementById("country");
const methodEl = document.getElementById("method");
const enabledEl = document.getElementById("enabled");
const statusEl = document.getElementById("status");
const nextEl = document.getElementById("next");

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

async function load() {
  const defaults = { city: "", country: "", method: "2", enabled: true };
  const s = await chrome.storage.sync.get(defaults);
  cityEl.value = s.city;
  countryEl.value = s.country;
  methodEl.value = String(s.method);
  enabledEl.checked = s.enabled;
  renderNext();
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

async function renderNext() {
  const { todayTimings } = await chrome.storage.local.get("todayTimings");
  if (!todayTimings) {
    nextEl.textContent = "No prayer times loaded yet. Enter your city and save.";
    return;
  }
  const now = new Date();
  let lines = "";
  let foundNext = false;
  for (const p of PRAYERS) {
    const clean = (todayTimings[p] || "").split(" ")[0];
    if (!clean) continue;
    const [h, m] = clean.split(":").map(Number);
    const t = new Date();
    t.setHours(h, m, 0, 0);
    const isNext = !foundNext && t > now;
    if (isNext) foundNext = true;
    lines += `${isNext ? "<b>▸ " : ""}${p}: ${clean}${isNext ? "</b>" : ""}<br/>`;
  }
  nextEl.innerHTML = lines;
}

document.getElementById("save").addEventListener("click", async () => {
  const city = cityEl.value.trim();
  const country = countryEl.value.trim();
  const method = parseInt(methodEl.value, 10);
  const enabled = enabledEl.checked;

  if (!city || !country) {
    statusEl.textContent = "Please enter both city and country.";
    return;
  }

  await chrome.storage.sync.set({ city, country, method, enabled });
  statusEl.textContent = "Saving and fetching today's prayer times…";

  chrome.runtime.sendMessage({ type: "RESCHEDULE" }, (resp) => {
    if (resp?.ok) {
      statusEl.textContent = "Saved! Times updated.";
      renderNext();
    } else {
      statusEl.textContent = "Saved, but couldn't fetch times — check city/country spelling.";
    }
  });
});

load();
