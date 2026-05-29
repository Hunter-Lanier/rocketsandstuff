const MAX_REQUEST_LENGTH = 1200;
const MAX_CONTENT_LENGTH = 2000;
const MIN_FORM_AGE_MS = 1800;
const MAX_FORM_AGE_MS = 1000 * 60 * 60 * 2;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10;
const RATE_LIMIT_MAX_REQUESTS = 3;
const DISCORD_TIMEOUT_MS = 3500;
const rateLimit = new Map();

function getLocalEnv(name) {
  if (process.env.NODE_ENV === "production") {
    return "";
  }

  const fs = require("node:fs");
  const path = require("node:path");

  for (const fileName of [".env.development.local", ".env.local"]) {
    const filePath = path.join(process.cwd(), fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      if (!line || line.startsWith("#")) {
        continue;
      }

      const [key, ...valueParts] = line.split("=");

      if (key === name) {
        return valueParts.join("=").trim();
      }
    }
  }

  return "";
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!isAllowedOrigin(request)) {
    return response.status(403).json({ error: "Forbidden." });
  }

  if (!String(request.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return response.status(415).json({ error: "Unsupported content type." });
  }

  if (Number(request.headers["content-length"] || 0) > MAX_CONTENT_LENGTH) {
    return response.status(413).json({ error: "Request is too large." });
  }

  const webhookUrl = process.env.DISCORD_PRODUCT_REQUEST_WEBHOOK_URL || getLocalEnv("DISCORD_PRODUCT_REQUEST_WEBHOOK_URL");

  if (!webhookUrl) {
    return response.status(500).json({ error: "Discord webhook is not configured." });
  }

  const productRequest = String(request.body?.request || "").trim();
  const honeypot = String(request.body?.company || "").trim();
  const formLoadedAt = Number(request.body?.formLoadedAt || 0);
  const formAge = Date.now() - formLoadedAt;

  if (honeypot) {
    return response.status(200).json({ ok: true });
  }

  if (!Number.isFinite(formAge) || formAge < MIN_FORM_AGE_MS || formAge > MAX_FORM_AGE_MS) {
    return response.status(400).json({ error: "Invalid request timing." });
  }

  if (!productRequest || productRequest.length < 3) {
    return response.status(400).json({ error: "Request is required." });
  }

  if (productRequest.length > MAX_REQUEST_LENGTH) {
    return response.status(400).json({ error: "Request is too long." });
  }

  if (isRateLimited(request)) {
    return response.status(429).json({ error: "Too many requests." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);

  let discordResponse;

  try {
    discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        username: "Rockets & Stuff",
        content: [
          "**New store item request**",
          "",
          sanitizeDiscordText(productRequest)
        ].join("\n")
      })
    });
  } catch (error) {
    return response.status(502).json({ error: "Discord webhook request failed." });
  } finally {
    clearTimeout(timeout);
  }

  if (!discordResponse.ok) {
    return response.status(502).json({ error: "Discord webhook request failed." });
  }

  return response.status(200).json({ ok: true });
};

function isAllowedOrigin(request) {
  const origin = request.headers.origin;

  if (!origin) {
    return false;
  }

  try {
    const host = new URL(origin).host;
    const allowedHosts = new Set([
      "rocketsandstuff.com",
      "www.rocketsandstuff.com",
      "rocketsandstuff.vercel.app",
      "localhost:4176",
      "127.0.0.1:4176"
    ]);

    return allowedHosts.has(host);
  } catch (error) {
    return false;
  }
}

function isRateLimited(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "");
  const ip = forwardedFor.split(",")[0].trim() || request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateLimit.get(ip);

  for (const [key, value] of rateLimit) {
    if (now > value.resetAt) {
      rateLimit.delete(key);
    }
  }

  if (!record || now > record.resetAt) {
    rateLimit.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT_MAX_REQUESTS;
}

function sanitizeDiscordText(value) {
  return value
    .replace(/@/g, "@\u200b")
    .replace(/https?:\/\//gi, "hxxps://");
}
