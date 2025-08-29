function expandDays(sheetTitle, rawDay) {
  if (!rawDay) return [];
  const s = String(rawDay).trim();

  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  let days = [];

  for (const part of parts) {
    try {
      // teljes dátumintervallum: MM.DD - MM.DD
      let m = part.match(/^(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?$/);
      if (m) {
        let [ , m1, d1, m2, d2 ] = m.map(Number);
        const year = sheetTitle.split(".")[0]; // pl. "2025.09" → "2025"
        let start = new Date(year, m1 - 1, d1);
        let end   = new Date(year, m2 - 1, d2);

        if (isNaN(start) || isNaN(end)) {
          console.warn("Invalid date range, skipping:", part);
          continue;
        }

        if (end < start) [start, end] = [end, start];

        for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
          const mm = String(dt.getMonth() + 1).padStart(2, "0");
          const dd = String(dt.getDate()).padStart(2, "0");
          days.push(`${year}.${mm}.${dd}`);
        }
        continue;
      }

      // nap tartomány: 5-8 vagy csak 5
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
      } else {
        console.warn("Unrecognized day format, skipping:", part);
      }
    } catch (err) {
      console.warn("Error parsing day, skipping:", part, err.message);
    }
  }

  console.log(days) ;
}


expandDays("2025.01","12-31")