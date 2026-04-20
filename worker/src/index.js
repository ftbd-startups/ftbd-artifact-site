const CORS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
});

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const tierLabels = {
  pilot: "Пилот",
  starter: "Старт",
  growth: "Рост",
  scale: "Масштаб",
  enterprise: "Корпоративный",
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const corsOrigin = origin && (origin === allowed || origin === "http://localhost:8080") ? origin : allowed;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS(corsOrigin) });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS(corsOrigin) });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400, corsOrigin);
    }

    // Honeypot field — silently accept if filled
    if (data.website) return json({ ok: true }, 200, corsOrigin);

    const name = (data.name || "").toString().trim().slice(0, 200);
    const email = (data.email || "").toString().trim().slice(0, 200);
    const contact = (data.contact || "").toString().trim().slice(0, 200);
    const tier = (data.tier || "").toString().trim().slice(0, 40);
    const idea = (data.idea || "").toString().trim().slice(0, 4000);

    if (!name || !email || !contact || !idea) {
      return json({ ok: false, error: "missing_fields" }, 400, corsOrigin);
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return json({ ok: false, error: "bad_email" }, 400, corsOrigin);

    const tierLabel = tierLabels[tier] || tier || "—";

    const text =
      `<b>🆕 Новая заявка с сайта</b>\n` +
      `\n<b>Имя:</b> ${escapeHtml(name)}` +
      `\n<b>Email:</b> ${escapeHtml(email)}` +
      `\n<b>Telegram/телефон:</b> ${escapeHtml(contact)}` +
      `\n<b>Тариф:</b> ${escapeHtml(tierLabel)}` +
      `\n\n<b>Идея:</b>\n${escapeHtml(idea)}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const errBody = await tgRes.text();
      console.error("telegram_error", tgRes.status, errBody);
      return json({ ok: false, error: "telegram_failed" }, 502, corsOrigin);
    }

    return json({ ok: true }, 200, corsOrigin);
  },
};

function json(obj, status, corsOrigin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS(corsOrigin) },
  });
}
