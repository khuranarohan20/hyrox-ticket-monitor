const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL = "https://hyrox.co.in/event/hyrox-bengaluru/";
const STATE_FILE = "state.json";

async function sendTelegram(message) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
  });
}

function getPreviousState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { registrationOpen: false };
  }

  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function check() {
  const previous = getPreviousState();

  const { data } = await axios.get(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const $ = cheerio.load(data);

  const text = $("body").text().replace(/\s+/g, " ").toLowerCase();

  const waiting = text.includes("registration will open soon");

  const registrationOpen = !waiting;

  if (!previous.registrationOpen && registrationOpen) {
    await sendTelegram(
      `🚨 HYROX Bengaluru registrations appear to be LIVE!

${URL}`,
    );

    console.log("Notification sent!");
  } else {
    console.log("No change.");
  }

  saveState({ registrationOpen });
}

check().catch(console.error);
