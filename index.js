// index.js
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const KEYFILEPATH = path.join(__dirname, "service-account.json");
const SPREADSHEET_ID = "1zB2CzdN69F-Rv-VtMLpNuzbevNnan3lvw0cADXNDiUo";
const RANGE_LIMIT = 300;
let isRunning = false;
let cache = [];

// ----------------- Util: idő normalizálás -----------------
function normalizeTime(str) {
  if (!str) return null;
  let s = String(str).trim();

  // pontot kettősponttá
  s = s.replace(/\./g, ":");

  // 0830 vagy 830 -> 08:30
  if (/^\d{3,4}$/.test(s)) {
    const hh = s.length === 3 ? s.slice(0, 1) : s.slice(0, 2);
    const mm = s.slice(-2);
    return `${hh.padStart(2, "0")}:${mm}`;
  }

  // 8 -> 08:00
  if (/^\d{1,2}$/.test(s)) {
    return `${s.padStart(2, "0")}:00`;
  }

  // 8:3 -> 08:03 ; 8:30 -> 08:30
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  return s;
}

function expandDays(sheetTitle, rawDay) {
  if (!rawDay) return [];
  const s = String(rawDay).trim();

  // több érték vesszővel elválasztva
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  let days = [];

  for (const part of parts) {
    // ha teljes dátumintervallum: MM.DD - MM.DD
    let m = part.match(/^(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?$/);
    if (m) {
      let [ , m1, d1, m2, d2 ] = m.map(Number);
      const year = sheetTitle.split(".")[0]; // pl. "2025.09" → "2025"
      let start = new Date(year, m1 - 1, d1);
      let end   = new Date(year, m2 - 1, d2);

      if (end < start) { // ha fordítva van, cseréljük
        [start, end] = [end, start];
      }

      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        days.push(`${year}.${mm}.${dd}`);
      }
      continue;
    }

    // ha csak nap tartomány (pl. 5-8)
    const cleaned = part.replace(/[^\d\-–]/g, "");
    if (!cleaned) continue;

    const range = cleaned.split(/-|–/).map(x => parseInt(x, 10)).filter(n => !isNaN(n));
    if (range.length === 1) {
      days.push(`${sheetTitle}.${String(range[0]).padStart(2, "0")}`);
    } else if (range.length === 2) {
      let [start, end] = range;
      if (end < start) [start, end] = [end, start];
      for (let d = start; d <= end; d++) {
        days.push(`${sheetTitle}.${String(d).padStart(2, "0")}`);
      }
    }
  }

  return days;
}


// ----------------- Util: B oszlop parsolása egy elemre -----------------
function parseSingleEventPiece(piece) {
  let text = String(piece || "").trim();

  // Segédfüggvény: levágja a felesleges elválasztókat a title elejéről
  function cleanTitle(str) {
    return String(str || "").replace(/^[:\-\s\.]+/, "").trim();
  }

  // 1) Tartomány: "8.30-12 szöveg" vagy "16.00 - 18.00:: Szöveg"
  let m = text.match(/^\s*(\d{1,2}(?:(?:[:.])\d{1,2})?)[\s]*[-–][\s]*(\d{1,2}(?:(?:[:.])\d{1,2})?)\s*(.*)$/s);
  if (m) {
    const startRaw = m[1];
    const endRaw = m[2];
    const titleRest = cleanTitle(m[3]);
    return {
      startDate: normalizeTime(startRaw),
      endDate: normalizeTime(endRaw),
      title: titleRest
    };
  }

  // 2) Kezdőidő kettőspont után: "9.00: Alakuló értekezlet"
  m = text.match(/^\s*(\d{1,2}(?:(?:[:.])\d{1,2})?)\s*:\s*(.*)$/s);
  if (m) {
    const startRaw = m[1];
    const titleRest = cleanTitle(m[2]);
    return {
      startDate: normalizeTime(startRaw),
      endDate: null,
      title: titleRest
    };
  }

  // 3) Csak kezdőidő szóközzel: "8.00 Megbeszélés..."
  m = text.match(/^\s*(\d{1,2}(?:(?:[:.])\d{1,2})?)\s+(.*)$/s);
  if (m) {
    const startRaw = m[1];
    const titleRest = cleanTitle(m[2]);
    return {
      startDate: normalizeTime(startRaw),
      endDate: null,
      title: titleRest
    };
  }

  // 4) Nincs idő → egész szöveg a cím
  return {
    startDate: null,
    endDate: null,
    title: cleanTitle(text)
  };
}


// ----------------- Last cache betöltése -----------------
const lastCachePath = path.join(__dirname, "lastCache.txt");
if (fs.existsSync(lastCachePath)) {
  try {
    const raw = fs.readFileSync(lastCachePath, "utf-8");
    const lastCache = raw.split("\n").slice(1).join("\n"); // első sor timestamp
    cache = JSON.parse(lastCache);
  } catch (err) {
    console.error("Hiba a lastCache beolvasásakor, üres cache-t használunk:", err.message);
    cache = [];
  }
}
						
function getEventId(id, pieceIndex, eventDay) {
  const raw = `${id}-${pieceIndex}-${eventDay}`;
  const hash = crypto.createHash("md5").update(raw).digest("hex");
  return "e" + hash;
}


// ----------------- Google Sheets lekérés → events tömb -----------------
async function fetchEvents() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetTitles = spreadsheet.data.sheets.map((s) => s.properties.title);

  const events = [];

  for (const sheetTitle of sheetTitles) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetTitle}!A4:G${RANGE_LIMIT}`,
    });

    const rows = response.data.values || [];

    rows.forEach((row, idx) => {
      const rawDay = row[0];                // A oszlop
      const rawEventCell = row[1];          // B oszlop
      const location = (row[5] || "").trim(); // F oszlop
      const id = row[6]
      if (!rawDay || !rawEventCell ||!id) return;

      const eventDays = expandDays(sheetTitle, rawDay);
      if (eventDays.length === 0) return;

      // B cella darabolása
      const pieces = String(rawEventCell).split(/[\n\r]+|,(?![^()]*\))/).map(s => s.trim()).filter(Boolean);

      pieces.forEach((piece, pieceIndex) => {
        const parsed = parseSingleEventPiece(piece);
        eventDays.forEach(eventDay => {
          const ev = {
            sheetTitle,
            rowIndex: idx + 4,
            pieceIndex,
            eventDay,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            location,
            title: parsed.title,
            id: getEventId(id,pieceIndex,eventDay)
          };

          events.push(ev);
        });
      });
    });
  }

  return events;
}


function diffEvents(oldEvents, newEvents) {
  const changes = [];

  // Segédfüggvény: lényegi mezők stringgé alakítása
  function getEventContentKey(ev) {
    return [
      ev.sheetTitle,
      ev.eventDay,
      ev.startDate || "",
      ev.endDate || "",
      ev.title || "",
      ev.location || "",
      ev.pieceIndex != null ? ev.pieceIndex : ""
    ].join("||");
  }

  const oldMapById = new Map(oldEvents.map(ev => [ev.id, ev]));
  const newMapById = new Map(newEvents.map(ev => [ev.id, ev]));

  // Ellenőrizzük az új és frissített eseményeket
  for (const [id, newEv] of newMapById.entries()) {
    const oldEv = oldMapById.get(id);
    if (!oldEv) {
      // Nincs a régi listában → új esemény
      changes.push({ type: "newEvent", event: newEv });
    } else {
      // Van régi esemény → ellenőrizzük a lényegi mezők változását
      if (getEventContentKey(oldEv) !== getEventContentKey(newEv)) {
        changes.push({ type: "updatedEvent", oldEvent: oldEv, newEvent: newEv });
      }
    }
  }

  // Ellenőrizzük a törölt eseményeket
  for (const [id, oldEv] of oldMapById.entries()) {
    if (!newMapById.has(id)) {
      changes.push({ type: "deletedEvent", event: oldEv });
    }
  }

  return changes;
}

async function processChangesSequentially(changes) {
  const { insertEvent, updateEvent, deleteEvent } = require("./calendar");
  for (const change of changes) {
    if (change.type === "newEvent") {
      await insertEvent(change.event);
    } else if (change.type === "updatedEvent") {
      await updateEvent(change.newEvent);
    } else if (change.type === "deletedEvent") {
      await deleteEvent(change.event);
    }

    // várakozás 2 másodpercig
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}


async function poll() {
  if (isRunning) {
    console.log("Poll kihagyva, előző futás még tart.");
    return;
  }
  isRunning = true;

  try {
    const newEvents = await fetchEvents();
    const changes = diffEvents(cache, newEvents);

    const timestamp = new Date().toLocaleString("hu-HU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    fs.writeFileSync(
      lastCachePath,
      `[${timestamp}]\n${JSON.stringify(newEvents, null, 2)}\n`,
      "utf-8"
    );

    if (changes.length > 0) {
      console.log("Változások észlelve:", changes.length);
      fs.appendFileSync(
        path.join(__dirname, "changes.txt"),
        `[${timestamp}] ${JSON.stringify(changes, null, 2)}\n\n`,
        "utf-8"
      );

      await processChangesSequentially(changes);
    } else {
      console.log("Nincs változás");
    }

    cache = newEvents;
  } catch (err) {
    const timestamp = new Date().toLocaleString("hu-HU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const msg = `[${timestamp}] Hiba a lekérés során: ${err.message}\n`;
    console.error(msg);
    fs.appendFileSync(path.join(__dirname, "errors.txt"), msg, "utf-8");
  } finally {
    isRunning = false;
    console.log("Feltöltés kész.")
  }
}

poll();
setInterval(poll, 60 * 1000);
