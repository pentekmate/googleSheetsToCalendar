// calendar.js
const { google } = require("googleapis");
const path = require("path");
const crypto = require("crypto");

const KEYFILEPATH = path.join(__dirname, "service-account.json");
const CALENDAR_ID = "c_3bd606a5bf6d6cc292e308c4614a1e1ec001cf2dd50c430c97a1d907b59f9e93@group.calendar.google.com";

// Google Calendar kliens
async function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/calendar"],
    clientOptions: { subject: "pentek.mate@bocskai.net" }
  });
  return google.calendar({ version: "v3", auth });
}

// Dátum normalizálás (YYYY-MM-DD)
function normalizeDate(dateStr) {
  const parts = dateStr.split(".");
  const year = parts[0];
  const month = parts[1].padStart(2, "0");
  const day = parts[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}



// Insert új esemény
async function insertEvent(ev) {
  const calendar = await getCalendarClient();
  const id =ev.id

  console.log(id)
  const event = {
    summary: ev.title || "(Nincs cím)",
    location: ev.location || "",
  };

  if (ev.startDate) {
    const [hour, minute = "00"] = ev.startDate.split(":");
    const startDateTime = new Date(`${normalizeDate(ev.eventDay)}T${hour.padStart(2,"0")}:${minute.padStart(2,"0")}:00`);

    let endDateTime;
    if (ev.endDate) {
      const [endHour, endMinute = "00"] = ev.endDate.split(":");
      endDateTime = new Date(`${normalizeDate(ev.eventDay)}T${endHour.padStart(2,"0")}:${endMinute.padStart(2,"0")}:00`);
    } else {
      endDateTime = new Date(startDateTime.getTime() + 60*60*1000);
    }

    event.start = { dateTime: startDateTime.toISOString() };
    event.end = { dateTime: endDateTime.toISOString() };
  } else {
    const normalized = normalizeDate(ev.eventDay);
    event.start = { date: normalized };
    event.end = { date: normalized };
  }

  try {
    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: { ...event, id },
    });
    console.log(`✅ Insert: ${ev.title} (${ev.eventDay})`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`ℹ️ Már létezik az insertnél, használj updateEvent: ${ev.title} (${ev.eventDay})`);
      updateEvent(ev)
    } else {
      console.error(`❌ Insert hiba: ${err.message}`);
    }
  }
}

// Update meglévő esemény
async function updateEvent(ev) {
  const calendar = await getCalendarClient();
  const id =ev.id

 
  const event = {
    summary: ev.title || "(Nincs cím)",
    location: ev.location || "",
  };

  if (ev.startDate) {
    const [hour, minute = "00"] = ev.startDate.split(":");
    const startDateTime = new Date(`${normalizeDate(ev.eventDay)}T${hour.padStart(2,"0")}:${minute.padStart(2,"0")}:00`);

    let endDateTime;
    if (ev.endDate) {
      const [endHour, endMinute = "00"] = ev.endDate.split(":");
      endDateTime = new Date(`${normalizeDate(ev.eventDay)}T${endHour.padStart(2,"0")}:${endMinute.padStart(2,"0")}:00`);
    } else {
      endDateTime = new Date(startDateTime.getTime() + 60*60*1000);
    }

    event.start = { dateTime: startDateTime.toISOString() };
    event.end = { dateTime: endDateTime.toISOString() };
  } else {
    const normalized = normalizeDate(ev.eventDay);
    event.start = { date: normalized };
    event.end = { date: normalized };
  }

  try {
    await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId: id,
      resource: event,
    });
    console.log(`♻️ Update: ${ev.title} (${ev.eventDay})`);
  } catch (err) {
    console.error(`❌ Update hiba: ${err.message}`);
  }
}

// Törlés
async function deleteEvent(ev) {
  const calendar = await getCalendarClient();
  const id =ev.id

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: id,
    });
    console.log(`🗑️ Delete: ${ev.title} (${ev.eventDay})`);
  } catch (err) {
    if (err.code === 404) console.log(`ℹ️ Már nem létezik: ${ev.title}`);
    else console.error(`❌ Delete hiba: ${err.message}`);
  }
}

module.exports = {
  insertEvent,
  updateEvent,
  deleteEvent,
};
