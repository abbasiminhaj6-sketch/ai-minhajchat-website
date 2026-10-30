require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY set nahi hai. .env file dekhein.");
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `You are a friendly, helpful assistant on a chat website.
Always reply in the same language the user writes in: Urdu script, Roman Urdu, or English.
Keep answers clear and reasonably short unless the user asks for detail.`;

const MAX_MESSAGES = 20; // kitni purani messages bhejni hain
const MAX_CHARS = 4000; // aik message ki hadd

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Har IP se 1 minute mein 15 requests (kharcha aur misuse rokne ke liye)
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Bohat zyada requests. Thori der baad try karein." },
  })
);

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages zaroori hain." });
    }

    const clean = messages
      .slice(-MAX_MESSAGES)
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

    // Pehla message user ka hona chahiye
    while (clean.length && clean[0].role !== "user") clean.shift();
    if (!clean.length || clean[clean.length - 1].role !== "user") {
      return res.status(400).json({ error: "Aakhri message user ka hona chahiye." });
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: clean,
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    res.json({ reply });
  } catch (err) {
    console.error(err?.status, err?.message);
    res.status(500).json({ error: "Server mein masla aa gaya. Dobara koshish karein." });
  }
});

app.listen(PORT, () => console.log(`Server chal raha hai: http://localhost:${PORT}`));
