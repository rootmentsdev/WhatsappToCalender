




// const express = require("express");
// const bodyParser = require("body-parser");
// const { google } = require("googleapis");
// const dotenv = require("dotenv");
// const axios = require("axios");
// const dayjs = require("dayjs");
// const customParseFormat = require("dayjs/plugin/customParseFormat");
// dayjs.extend(customParseFormat);

// dotenv.config();

// const app = express();
// app.use(bodyParser.json());

// // ───────────────────────────────────────────────────────────
// //  Google Sheets setup (unchanged)
// // ───────────────────────────────────────────────────────────
// const auth = new google.auth.GoogleAuth({
//   keyFile: "credentials.json",
//   scopes: ["https://www.googleapis.com/auth/spreadsheets"],
// });
// const SHEET_ID = process.env.SHEET_ID;

// async function addEventToSheet([title, start, end]) {
//   const client = await auth.getClient();
//   const sheets = google.sheets({ version: "v4", auth: client });

//   await sheets.spreadsheets.values.append({
//     spreadsheetId: SHEET_ID,
//     range: "Sheet1!A1",
//     valueInputOption: "USER_ENTERED",
//     resource: { values: [[title, start, end]] },
//   });
// }

// // ───────────────────────────────────────────────────────────
// //  WhatsApp reply sender (Meta)
// // ───────────────────────────────────────────────────────────
// async function sendWhatsAppMessage(to, message) {
//   const phoneNumberId = process.env.PHONE_NUMBER_ID;
//   const token = process.env.ACCESS_TOKEN;

//   await axios.post(
//     `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
//     {
//       messaging_product: "whatsapp",
//       to,
//       type: "text",
//       text: { body: message },
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );
// }

// // ───────────────────────────────────────────────────────────
// //  NEW: simple in-memory session store (user ↔️ step state)
// // ───────────────────────────────────────────────────────────
// const sessions = new Map(); // key = senderId, value = { step, data }

// function getSenderId(body) {
//   return (
//     body?.From ||
//     body?.from ||
//     body?.contacts?.[0]?.wa_id ||
//     "anonymous"
//   );
// }

// function getMessageText(body) {
//   return (
//     body?.Body ||
//     body?.text ||
//     body?.message?.text?.body ||
//     ""
//   ).trim();
// }

// // 🆕 Date parser: converts "2 Jul 25 10:00" → "2025-07-02 10:00"
// function parseDate(input) {
//   const formats = [
//     "D MMM YY HH:mm",
//     "DD MMM YY HH:mm",
//     "D MMM YYYY HH:mm",
//     "DD MMM YYYY HH:mm"
//   ];

//   for (let format of formats) {
//     const parsed = dayjs(input, format, true);
//     if (parsed.isValid()) return parsed.format("YYYY-MM-DD HH:mm");
//   }

//   return input;
// }

// // ───────────────────────────────────────────────────────────
// // ✅ Meta webhook verification route (GET)
// // ───────────────────────────────────────────────────────────
// app.get("/webhook/meta", (req, res) => {
//   const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];

//   if (mode === "subscribe" && token === VERIFY_TOKEN) {
//     console.log("✅ Meta webhook verified");
//     return res.status(200).send(challenge);
//   } else {
//     return res.sendStatus(403);
//   }
// });

// // ───────────────────────────────────────────────────────────
// // ✅ Meta WhatsApp message handler (POST)
// // ───────────────────────────────────────────────────────────
// app.post("/webhook/meta", async (req, res) => {
//   try {
//     const entry = req.body.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const message = changes?.value?.messages?.[0];

//     if (!message) return res.sendStatus(200); // no message, just acknowledge

//     const sender = message.from;
//     const text = message.text?.body;

//     if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
//     const session = sessions.get(sender);

//     if (/^add event$/i.test(text)) {
//       session.step = "await_title";
//       session.data = {};
//       await sendWhatsAppMessage(sender, "Add your Event Title");
//     } else if (session.step === "await_title") {
//       session.data.title = text;
//       session.step = "await_start";
//       await sendWhatsAppMessage(sender, "Add the start date (e.g. 2 Jul 25 10:00)");
//     } else if (session.step === "await_start") {
//       session.data.start = parseDate(text);
//       session.step = "await_end";
//       await sendWhatsAppMessage(sender, "Add the end date (e.g. 2 Jul 25 11:00)");
//     } else if (session.step === "await_end") {
//       session.data.end = parseDate(text);
//       await addEventToSheet([session.data.title, session.data.start, session.data.end]);
//       sessions.delete(sender);
//       await sendWhatsAppMessage(sender, "✅ Event added. Have a nice day!");
//     } else {
//       await sendWhatsAppMessage(sender, "Send 'Add event' to start adding an event.");
//     }

//     res.sendStatus(200);
//   } catch (err) {
//     console.error("❌ Error in POST /webhook/meta:", err);
//     res.sendStatus(500);
//   }
// });

// // ───────────────────────────────────────────────────────────
// //  WhatsApp message handler (for manual/curl testing)
// // ───────────────────────────────────────────────────────────
// app.post("/webhook", async (req, res) => {
//   const sender = getSenderId(req.body);
//   const message = getMessageText(req.body);

//   if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
//   const session = sessions.get(sender);

//   try {
//     if (message.startsWith("Add Event |")) {
//       const parts = message.split("|").map((p) => p.trim());
//       if (parts.length !== 4) {
//         return res
//           .status(400)
//           .json({ message: "Invalid format. Use: Add Event | Title | Start | End" });
//       }
//       const [, title, startTime, endTime] = parts;
//       await addEventToSheet([
//         title,
//         parseDate(startTime),
//         parseDate(endTime)
//       ]);
//       sessions.delete(sender);
//       return res.json({ message: "✅ Event added to sheet" });
//     }

//     if (/^add event$/i.test(message)) {
//       session.step = "await_title";
//       session.data = {};
//       return res.json({ message: "Add your Event Title" });
//     }

//     if (session.step === "await_title") {
//       session.data.title = message;
//       session.step = "await_start";
//       return res.json({ message: "Add the start date (e.g. 2 Jul 25 10:00)" });
//     }

//     if (session.step === "await_start") {
//       session.data.start = parseDate(message);
//       session.step = "await_end";
//       return res.json({ message: "Add the end date (e.g. 2 Jul 25 11:00)" });
//     }

//     if (session.step === "await_end") {
//       session.data.end = parseDate(message);
//       await addEventToSheet([
//         session.data.title,
//         session.data.start,
//         session.data.end
//       ]);
//       sessions.delete(sender);
//       return res.json({ message: "✅ Event added. Have a nice day!" });
//     }

//     return res.json({ message: "Send 'Add event' to start adding an event." });
//   } catch (err) {
//     console.error("Error:", err);
//     sessions.delete(sender);
//     return res
//       .status(500)
//       .json({ message: "❌ Something went wrong. Please try again." });
//   }
// });

// // ───────────────────────────────────────────────────────────
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () =>
//   console.log(`🚀 Server running on http://localhost:${PORT}`)
// );


const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const axios = require("axios");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

dotenv.config();
const app = express();
app.use(bodyParser.json());

// ───────────────────────────────────────────────────────────
// Google Sheets setup
// ───────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const SHEET_ID = process.env.SHEET_ID;

async function addEventToSheet([title, start, end]) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    resource: { values: [[title, start, end]] },
  });
}

// ───────────────────────────────────────────────────────────
// WhatsApp sender helper
// ───────────────────────────────────────────────────────────
async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const token = process.env.ACCESS_TOKEN;

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ───────────────────────────────────────────────────────────
// Session store (user ↔ step)
// ───────────────────────────────────────────────────────────
const sessions = new Map();

function parseDate(input) {
  const formats = [
    "D MMM YY HH:mm",
    "DD MMM YY HH:mm",
    "D MMM YYYY HH:mm",
    "DD MMM YYYY HH:mm"
  ];
  for (let format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) return parsed.format("YYYY-MM-DD HH:mm");
  }
  return input;
}

// ───────────────────────────────────────────────────────────
// Meta Webhook verification (GET)
// ───────────────────────────────────────────────────────────
app.get("/webhook/meta", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Meta webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ───────────────────────────────────────────────────────────
// Meta Webhook Handler (POST)
// ───────────────────────────────────────────────────────────
const OWNER_NUMBER = process.env.OWNER_NUMBER;
const ALLOWED_NUMBERS = [OWNER_NUMBER, "15551281515"]; // Allow sandbox too

app.post("/webhook/meta", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const text = message.text?.body?.trim();
    console.log("📩 Message from:", sender, "|", text);

    // Restrict access
    if (!ALLOWED_NUMBERS.includes(sender)) {
    
      return res.sendStatus(200);
    }

    if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
    const session = sessions.get(sender);

    if (/^add event$/i.test(text)) {
      session.step = "await_title";
      session.data = {};
      await sendWhatsAppMessage(sender, "Add your Event Title");
    } else if (session.step === "await_title") {
      session.data.title = text;
      session.step = "await_start";
      await sendWhatsAppMessage(sender, "Add the start date (e.g. 2 Jul 25 10:00)");
    } else if (session.step === "await_start") {
      session.data.start = parseDate(text);
      session.step = "await_end";
      await sendWhatsAppMessage(sender, "Add the end date (e.g. 2 Jul 25 11:00)");
    } else if (session.step === "await_end") {
      session.data.end = parseDate(text);
      await addEventToSheet([
        session.data.title,
        session.data.start,
        session.data.end
      ]);
      sessions.delete(sender);
      await sendWhatsAppMessage(sender, "✅ Event added. Have a nice day!");
    } else {
      await sendWhatsAppMessage(sender, "Send 'Add event' to start adding an event.");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err);
    res.sendStatus(500);
  }
});

// ───────────────────────────────────────────────────────────
// Local curl/webhook testing route (optional)
// ───────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const sender = req.body.from || "anonymous";
  const message = req.body.text?.trim();

  if (!sessions.has(sender)) sessions.set(sender, { step: null, data: {} });
  const session = sessions.get(sender);

  try {
    if (message.startsWith("Add Event |")) {
      const parts = message.split("|").map(p => p.trim());
      if (parts.length !== 4) {
        return res.status(400).json({ message: "Use: Add Event | Title | Start | End" });
      }
      const [, title, start, end] = parts;
      await addEventToSheet([title, parseDate(start), parseDate(end)]);
      sessions.delete(sender);
      return res.json({ message: "✅ Event added to sheet" });
    }

    if (/^add event$/i.test(message)) {
      session.step = "await_title";
      session.data = {};
      return res.json({ message: "Add your Event Title" });
    }

    if (session.step === "await_title") {
      session.data.title = message;
      session.step = "await_start";
      return res.json({ message: "Add the start date (e.g. 2 Jul 25 10:00)" });
    }

    if (session.step === "await_start") {
      session.data.start = parseDate(message);
      session.step = "await_end";
      return res.json({ message: "Add the end date (e.g. 2 Jul 25 11:00)" });
    }

    if (session.step === "await_end") {
      session.data.end = parseDate(message);
      await addEventToSheet([
        session.data.title,
        session.data.start,
        session.data.end
      ]);
      sessions.delete(sender);
      return res.json({ message: "✅ Event added. Have a nice day!" });
    }

    return res.json({ message: "Send 'Add event' to start adding an event." });
  } catch (err) {
    console.error("❌ Error:", err);
    sessions.delete(sender);
    return res.status(500).json({ message: "❌ Something went wrong." });
  }
});

// ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
