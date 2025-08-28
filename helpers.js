// helpers.js

// Idő normalizáló függvény
function normalizeDate(dateStr) {
  // dateStr = "2025.09.1"
  const parts = dateStr.split(".");      // ["2025", "09", "1"]
  const year = parts[0];
  const month = parts[1].padStart(2,"0"); // "09"
  const day = parts[2].padStart(2,"0");   // "01"
  return `${year}-${month}-${day}`;       // "2025-09-01"
}


// Esemény cellák feldolgozása
function parseEventsCell(cellText, location) {
    location = location ? location.replace(/\n/g, ' ') : '';

  const events = [];
  const parts = cellText.split("\n"); // több esemény esetén
  parts.forEach(p => {
    p = p.trim(); // először trim

    let start = null;
    let end = null;
    let title = p;

    // Regex: bármennyi szóköz lehet a - előtt/után
    const match = p.match(/^(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]?\d{0,2})\s*:?\s*(.+)/);
    if (match) {
      start = match[1].replace(".", ":");
      end = match[2] ? match[2].replace(".", ":") : null;
      title = match[3].trim();
    } else {
      const singleMatch = p.match(/^(\d{1,2}[:.]\d{2})\s*:?\s*(.+)/);
      if (singleMatch) {
        start = singleMatch[1].replace(".", ":");
        title = singleMatch[2].trim();
      }
    }

    events.push({
      eventStart: start,
      eventEnd: end,
      eventTitle: title,
      location
    });
  });

  return events;
}




// Napok tisztítása (pont, whitespace eltávolítás)
function cleanDay(day) {
  if (!day) return "";
  return String(day)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/\.$/, "");
}

// Események rendezése idő szerint
function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (!a.eventStart) return 1;
    if (!b.eventStart) return -1;
    return a.eventStart.localeCompare(b.eventStart);
  });
}

function eventsEqual(aEvents, bEvents) {
  if (aEvents.length !== bEvents.length) return false;

  for (let i = 0; i < aEvents.length; i++) {
    const a = aEvents[i];
    const b = bEvents[i];

    if (a.eventStart !== b.eventStart) return false;
    if (a.eventTitle !== b.eventTitle) return false;
    if (a.location !== b.location) return false;
  }

  return true;
}

// Exportáld, ha még nincs exportálva



module.exports = { normalizeDate, parseEventsCell, cleanDay, sortEvents,eventsEqual };
