const Stripe = require("stripe");

const ALLOWED_PRODUCTS = {
  "sheet-metal-cigar-cutter": {
    name: "Sheet Metal Cigar Cutter (304 SS)",
    description: "Sheet Metal Cigar Cutter (304 SS) from Rockets & Stuff.",
    unitAmount: Number(process.env.SHEET_METAL_CIGAR_CUTTER_AMOUNT || 100),
    currency: "usd"
  }
};

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

  if ((process.env.CHECKOUT_ENABLED || getLocalEnv("CHECKOUT_ENABLED")) !== "true") {
    return response.status(503).json({ error: "Checkout is not open yet." });
  }

  if (!String(request.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return response.status(415).json({ error: "Unsupported content type." });
  }

  const productId = String(request.body?.productId || "").trim();
  const product = ALLOWED_PRODUCTS[productId];

  if (!product) {
    return response.status(400).json({ error: "Unknown product." });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || getLocalEnv("STRIPE_SECRET_KEY");

  if (!stripeSecretKey) {
    return response.status(500).json({ error: "Stripe is not configured." });
  }

  const siteUrl = getSiteUrl(request);
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover"
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: product.currency,
            product_data: {
              name: product.name,
              description: product.description
            },
            unit_amount: product.unitAmount
          },
          quantity: 1
        }
      ],
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart.html?item=${encodeURIComponent(productId)}`
    });

    return response.status(200).json({ url: session.url });
  } catch (error) {
    return response.status(502).json({ error: "Stripe checkout session failed." });
  }
};

function getSiteUrl(request) {
  const origin = request.headers.origin;

  if (origin) {
    return origin;
  }

  const host = request.headers.host || "rocketsandstuff.com";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

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
