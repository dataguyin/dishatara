const MAX_BODY_BYTES = 16000;
const MAX_QUESTION_CHARS = 600;
const MAX_HISTORY_ITEMS = 8;

function jsonResponse(body, status, origin, allowedOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateChart(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ascendant = cleanText(value.ascendant, 100);
  const moonSign = cleanText(value.moonSign, 100);
  const nakshatra = cleanText(value.nakshatra, 100);
  const pada = Number(value.pada);
  if (!ascendant || !moonSign || !nakshatra || !Number.isInteger(pada) || pada < 1 || pada > 4) return null;
  if (!Array.isArray(value.planets) || value.planets.length < 1 || value.planets.length > 16) return null;
  const planets = value.planets.map((planet) => ({
    name: cleanText(planet && planet.name, 40),
    sign: cleanText(planet && planet.sign, 40),
    position: cleanText(planet && planet.position, 40),
    house: Number(planet && planet.house)
  })).filter((planet) =>
    planet.name && planet.sign && planet.position &&
    Number.isInteger(planet.house) && planet.house >= 1 && planet.house <= 12
  );
  if (!planets.length) return null;
  return {
    ascendant,
    moonSign,
    nakshatra,
    pada,
    planets,
    dasha: cleanText(value.dasha, 240)
  };
}

function cleanHistory(value) {
  if (!Array.isArray(value) || value.length > MAX_HISTORY_ITEMS) return [];
  return value.map((item) => {
    const role = item && item.role;
    if (role !== "user" && role !== "assistant") return null;
    const text = cleanText(item.text, MAX_QUESTION_CHARS);
    return text ? { role, content: [{ type: "input_text", text }] } : null;
  }).filter(Boolean);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "";

    if (request.method === "OPTIONS") {
      if (!origin || origin !== allowedOrigin) return new Response(null, { status: 403 });
      return jsonResponse({}, 204, origin, allowedOrigin);
    }

    if (!origin || !allowedOrigin || origin !== allowedOrigin) {
      return jsonResponse({ error: "This site is not allowed to use the AI service." }, 403, origin, allowedOrigin);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ ok: true }, 200, origin, allowedOrigin);
    }

    if (url.pathname !== "/api/ask" || request.method !== "POST") {
      return jsonResponse({ error: "Not found." }, 404, origin, allowedOrigin);
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request is too large." }, 413, origin, allowedOrigin);
    }

    let body;
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: "Request is too large." }, 413, origin, allowedOrigin);
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return jsonResponse({ error: "The request could not be read." }, 400, origin, allowedOrigin);
    }

    const question = cleanText(body && body.question, MAX_QUESTION_CHARS);
    const language = cleanText(body && body.language, 12);
    const chart = validateChart(body && body.chart);
    const history = cleanHistory(body && body.history);
    if (!question || !["en", "hi", "hinglish"].includes(language) || !chart) {
      return jsonResponse({ error: "Please provide a question and a calculated chart." }, 400, origin, allowedOrigin);
    }
    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: "The AI service is not configured yet." }, 503, origin, allowedOrigin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!env.AI_LIMITER) {
      return jsonResponse({ error: "The AI service is temporarily unavailable." }, 503, origin, allowedOrigin);
    }
    const rate = await env.AI_LIMITER.limit({ key: ip });
    if (!rate.success) {
      return jsonResponse({ error: "Too many questions at once. Please wait a minute and try again." }, 429, origin, allowedOrigin);
    }

    const input = history.slice(-MAX_HISTORY_ITEMS);
    input.push({
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({ language, chart, question })
      }]
    });

    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5-mini",
          instructions: "You are DishaTara, a careful astrology companion. Answer in the requested language (English, Hindi, or Hinglish). Explain the supplied chart placements clearly and in a satisfying, conversational way, usually in 2 to 4 short paragraphs. Use only the chart data supplied; never invent placements. Describe astrology as a cultural or reflective tradition, not scientifically proven fact. Do not guarantee events or give medical, legal, financial, or mental-health advice. For those topics, offer general reflection and recommend a qualified professional. Ask at most one gentle follow-up question when it would help the conversation. Do not ask for name, birth date, birth time, or birthplace.",
          input,
          max_output_tokens: 700,
          store: false
        })
      });
    } catch {
      return jsonResponse({ error: "The AI service could not be reached. Please try again." }, 502, origin, allowedOrigin);
    }

    if (!upstream.ok) {
      return jsonResponse({ error: "The AI service could not complete that answer. Please try again." }, 502, origin, allowedOrigin);
    }

    let result;
    try {
      result = await upstream.json();
    } catch {
      return jsonResponse({ error: "The AI service returned an unreadable answer." }, 502, origin, allowedOrigin);
    }
    const answer = (result.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!answer) {
      return jsonResponse({ error: "The AI service returned an empty answer. Please try again." }, 502, origin, allowedOrigin);
    }
    return jsonResponse({ answer }, 200, origin, allowedOrigin);
  }
};
