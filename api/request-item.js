const MAX_REQUEST_LENGTH = 1200;

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

  const webhookUrl = process.env.DISCORD_PRODUCT_REQUEST_WEBHOOK_URL || getLocalEnv("DISCORD_PRODUCT_REQUEST_WEBHOOK_URL");

  if (!webhookUrl) {
    return response.status(500).json({ error: "Discord webhook is not configured." });
  }

  const productRequest = String(request.body?.request || "").trim();

  if (!productRequest) {
    return response.status(400).json({ error: "Request is required." });
  }

  if (productRequest.length > MAX_REQUEST_LENGTH) {
    return response.status(400).json({ error: "Request is too long." });
  }

  const discordResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Rockets & Stuff",
      content: [
        "**New store item request**",
        "",
        productRequest
      ].join("\n")
    })
  });

  if (!discordResponse.ok) {
    return response.status(502).json({ error: "Discord webhook request failed." });
  }

  return response.status(200).json({ ok: true });
};
