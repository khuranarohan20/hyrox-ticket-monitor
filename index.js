const axios = require("axios");
const cheerio = require("cheerio");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL = "https://hyrox.co.in/event/hyrox-bengaluru/";

async function sendTelegram(message) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
    disable_web_page_preview: false,
  });
}

async function checkRegistration() {
  const { data } = await axios.get(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(data);

  const bodyText = $("body").text().replace(/\s+/g, " ").trim().toLowerCase();

  // Current banner shown while registrations are closed
  const registrationClosed = bodyText.includes("registration will open soon");

  // Look for possible registration links/buttons for THIS event.
  const registrationLinkExists = $("a")
    .toArray()
    .some((el) => {
      const href = ($(el).attr("href") || "").toLowerCase();
      const text = $(el).text().trim().toLowerCase();

      // Ignore links to other cities' events (e.g. a "Register Now!" for
      // hyrox-mumbai on the Bengaluru page) — those aren't our registration.
      if (href.includes("/event/hyrox-") && !href.includes("bengaluru")) {
        return false;
      }

      return (
        href.includes("register") ||
        href.includes("registration") ||
        href.includes("ticket") ||
        href.includes("raceid") ||
        href.includes("myraceresult") ||
        text.includes("register") ||
        text.includes("buy ticket") ||
        text.includes("buy tickets") ||
        text.includes("book now")
      );
    });

  const registrationOpen = registrationLinkExists || !registrationClosed;

  // GitHub Actions cron is UTC.
  // 23:30 UTC = 05:00 IST
  const now = new Date();
  const isDailyStatus = now.getUTCHours() === 23 && now.getUTCMinutes() === 30;

  // Set when the job is triggered manually (workflow_dispatch) so a manual run
  // always sends a status message for testing.
  const forceNotify = process.env.FORCE_NOTIFY === "true";

  if (isDailyStatus || forceNotify) {
    await sendTelegram(
      `☀️ HYROX Bengaluru Daily Status

${registrationOpen ? "🟢 Registration: OPEN" : "🔴 Registration: NOT OPEN"}

Checked at:
${now.toISOString()}

${URL}`,
    );

    console.log("Daily status sent.");
    return;
  }

  if (registrationOpen) {
    await sendTelegram(
      `🚨 HYROX Bengaluru Registration appears to be LIVE!

Check immediately:
${URL}`,
    );

    console.log("Registration notification sent.");
  } else {
    console.log("Registration not open.");
  }
}

checkRegistration().catch(async (err) => {
  console.error(err);

  try {
    await sendTelegram(
      `❌ HYROX Monitor Error

${err.message}`,
    );
  } catch (_) {}
});
