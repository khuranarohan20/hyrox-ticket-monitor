const axios = require("axios");
const cheerio = require("cheerio");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Events to monitor. `slug` is the city token used to ignore other cities'
// event links that show up on the page.
const EVENTS = [
  {
    name: "HYROX Bengaluru",
    url: "https://hyrox.co.in/event/hyrox-bengaluru/",
    slug: "bengaluru",
  },
  {
    name: "HYROX Hong Kong",
    url: "https://hyrox.com/event/hyrox-hong-kong/",
    slug: "hong-kong",
  },
];

async function sendTelegram(message) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
    disable_web_page_preview: false,
  });
}

// The sites are slow/flaky from GitHub's runners, so give them a generous
// timeout and retry a few times before treating it as a real error.
async function fetchPage(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 30000,
      });
      return data;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Fetch attempt ${i} failed (${err.message}), retrying...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Heuristic: registration is open when a real registration/ticket link for THIS
// event is present. Site-structure-dependent — the thing to revisit when tuning.
function isRegistrationOpen(html, slug) {
  const $ = cheerio.load(html);

  return $("a")
    .toArray()
    .some((el) => {
      const href = ($(el).attr("href") || "").toLowerCase();
      const text = $(el).text().trim().toLowerCase();

      // Ignore unrelated promo links (e.g. "Race for Impact" charity tickets on
      // hyrox.com) — they contain "ticket" but aren't event registration.
      if (href.includes("charity") || href.includes("race-for-impact")) {
        return false;
      }

      // Ignore links to other cities' events (e.g. a "Register Now!" for
      // hyrox-mumbai on this page) — those aren't our registration.
      if (href.includes("/event/hyrox-") && !href.includes(slug)) {
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
}

async function checkEvent(event) {
  const html = await fetchPage(event.url);
  const registrationOpen = isRegistrationOpen(html, event.slug);

  // GitHub Actions cron is UTC.
  // 23:30 UTC = 05:00 IST
  const now = new Date();
  const isDailyStatus = now.getUTCHours() === 23 && now.getUTCMinutes() === 30;

  // Set when the job is triggered manually (workflow_dispatch) so a manual run
  // always sends a status message for testing.
  const forceNotify = process.env.FORCE_NOTIFY === "true";

  if (isDailyStatus || forceNotify) {
    await sendTelegram(
      `☀️ ${event.name} Daily Status

${registrationOpen ? "🟢 Registration: OPEN" : "🔴 Registration: NOT OPEN"}

Checked at:
${now.toISOString()}

${event.url}`,
    );

    console.log(`${event.name}: daily status sent.`);
    return;
  }

  if (registrationOpen) {
    await sendTelegram(
      `🚨 ${event.name} Registration appears to be LIVE!

Check immediately:
${event.url}`,
    );

    console.log(`${event.name}: registration notification sent.`);
  } else {
    await sendTelegram(
      `🔴 ${event.name}: registration still NOT open

Checked at:
${now.toISOString()}

${event.url}`,
    );

    console.log(`${event.name}: not open — status sent.`);
  }
}

async function main() {
  // Check each event independently so one failing page doesn't block the other.
  for (const event of EVENTS) {
    try {
      await checkEvent(event);
    } catch (err) {
      console.error(`${event.name} check failed:`, err);
      try {
        await sendTelegram(`❌ ${event.name} Monitor Error\n\n${err.message}`);
      } catch (_) {}
    }
  }
}

main();
