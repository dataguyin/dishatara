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

  if (!ascendant || !moonSign || !nakshatra ||
      !Number.isInteger(pada) || pada < 1 || pada > 4) {
    return null;
  }

  if (!Array.isArray(value.planets) ||
      value.planets.length < 1 ||
      value.planets.length > 16) {
    return null;
  }

  const planets = value.planets.map((planet) => ({
    name: cleanText(planet && planet.name, 40),
    sign: cleanText(planet && planet.sign, 40),
    position: cleanText(planet && planet.position, 40),
    house: Number(planet && planet.house)
  })).filter((planet) =>
    planet.name &&
    planet.sign &&
    planet.position &&
    Number.isInteger(planet.house) &&
    planet.house >= 1 &&
    planet.house <= 12
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
    return text ? { role, content: text } : null;
  }).filter(Boolean);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const allowedOrigin = allowedOrigins.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigin) {
        return new Response(null, { status: 403 });
      }

      return jsonResponse({ ok: true }, 200, origin, allowedOrigin);
    }

    if (!origin || !allowedOrigin) {
      return jsonResponse(
        { error: "This site is not allowed to use the AI service." },
        403,
        origin,
        allowedOrigin
      );
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ ok: true }, 200, origin, allowedOrigin);
    }

    if (url.pathname !== "/api/ask" || request.method !== "POST") {
      return jsonResponse(
        { error: "Not found." },
        404,
        origin,
        allowedOrigin
      );
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse(
        { error: "Request is too large." },
        413,
        origin,
        allowedOrigin
      );
    }

    let body;
    try {
      const bytes = await request.arrayBuffer();

      if (bytes.byteLength > MAX_BODY_BYTES) {
        return jsonResponse(
          { error: "Request is too large." },
          413,
          origin,
          allowedOrigin
        );
      }

      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return jsonResponse(
        { error: "The request could not be read." },
        400,
        origin,
        allowedOrigin
      );
    }

    const question = cleanText(body && body.question, MAX_QUESTION_CHARS);
    const language = cleanText(body && body.language, 12);
    const chart = validateChart(body && body.chart);
    const history = cleanHistory(body && body.history);

    if (!question || !["en", "hi", "hinglish"].includes(language) || !chart) {
      return jsonResponse(
        { error: "Please provide a question and a calculated chart." },
        400,
        origin,
        allowedOrigin
      );
    }

    if (!env.AI) {
      return jsonResponse(
        { error: "The AI service is not configured yet." },
        503,
        origin,
        allowedOrigin
      );
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    if (!env.AI_LIMITER) {
      return jsonResponse(
        { error: "The AI service is temporarily unavailable." },
        503,
        origin,
        allowedOrigin
      );
    }

    const rate = await env.AI_LIMITER.limit({ key: ip });

    if (!rate.success) {
      return jsonResponse(
        { error: "Too many questions at once. Please wait a minute and try again." },
        429,
        origin,
        allowedOrigin
      );
    }

    const input = history.slice(-MAX_HISTORY_ITEMS);
    input.push({
      role: "user",
      content: JSON.stringify({ language, chart, question })
    });

    const instructions = `
You are DishaTara, an AI astrology companion. You offer thoughtful explanations of astrological traditions for reflection and entertainment, not factual predictions.

LANGUAGE AND TONE
- The user message contains JSON with "language", "chart", and "question". Answer in the requested language: "en" means clear English, "hi" means natural Hindi, and "hinglish" means natural Hinglish.
- Be warm, respectful, calm, and non-judgmental. Use simple language. Explain unfamiliar astrology terms the first time.
- Answer the question directly, then explain the relevant chart information in a useful, easy-to-follow way. Usually use 2 to 4 short paragraphs.
- Do not use frightening, shaming, fatalistic, manipulative, or engagement-bait language. Never call a person an enemy or label them as harmful based on a chart.
- You may end with one gentle, relevant follow-up question only when it would genuinely help. Do not pressure the user to continue.

CHART ACCURACY
- Treat the supplied chart JSON as the only source for the user's placements. Do not invent or guess signs, houses, degrees, nakshatras, dashas, transits, yogas, doshas, or other chart facts.
- Before making a chart-specific claim, check that the required placement or calculation is actually present in the supplied data.
- If the chart does not contain enough information to answer, say what is missing and give a limited general explanation. Do not pretend you calculated anything that was not provided.
- If the user's description conflicts with the supplied chart data, politely point out the mismatch and explain what the supplied data says. Do not silently choose one version.
- Do not claim that a planet is absent if it appears in the supplied chart.
- Explain interpretations as traditional astrological beliefs, for example: "In Vedic astrology, this placement is often interpreted as..." Make clear that interpretations vary and are not scientifically established predictions.
- Never present astrology as proof of a person's character, intentions, health, relationships, or future.

SAFETY AND HIGH-STAKES TOPICS
- Never guarantee that an event will happen or give exact certainty about marriage, death, illness, pregnancy, accidents, legal outcomes, investments, wealth, employment, or other major life events.
- Do not give medical, mental-health, legal, financial, or safety-critical advice. Do not diagnose, prescribe treatment, recommend stopping medication, tell someone to make an investment, or tell them to take legal action based on astrology.
- For high-stakes questions, briefly state that astrology cannot reliably decide the matter. Offer general, non-directive reflection and encourage the user to consult a suitably qualified professional.
- If the user expresses immediate danger, abuse, self-harm, or intent to harm someone, respond with empathy, prioritize immediate real-world safety, and encourage contacting local emergency services or a trusted person. Do not interpret the danger astrologically.
- Do not make claims that a curse, dosha, planet, or another person is causing harm. Do not sell or recommend rituals, gemstones, paid remedies, or services as necessary to prevent disaster.

PRIVACY AND HONESTY
- Do not ask for or repeat the user's name, birth date, birth time, birthplace, contact details, or other identifying information. The service should use only the chart data already supplied.
- Do not claim to be a human astrologer, licensed professional, or a substitute for qualified advice. If asked, say plainly that you are an AI assistant.
- Do not claim to have searched the web, checked live planetary positions, or performed a new calculation unless that capability and result are explicitly provided.
- Be transparent about uncertainty. If unsure, say so briefly instead of making up an answer.
`;

    let result;
    try {
      result = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
        messages: [
          { role: "system", content: instructions },
          ...input
        ],
        max_tokens: 1200,
	chat_template_kwargs: { enable_thinking: false }
      });
    } catch (error) {
      console.error("Workers AI request failed", error);

      return jsonResponse(
        { error: "The AI service could not complete that answer. Please try again." },
        502,
        origin,
        allowedOrigin
      );
    }

    const answer = cleanText(
      result && (
        result.response ||
        (result.choices &&
          result.choices[0] &&
          result.choices[0].message &&
          result.choices[0].message.content)
      ),
      6000
    );

    if (!answer) {
      return jsonResponse(
        { error: "The AI service returned an empty answer. Please try again." },
        502,
        origin,
        allowedOrigin
      );
    }

    return jsonResponse({ answer }, 200, origin, allowedOrigin);
  }
};