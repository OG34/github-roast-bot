import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function generateRoast(githubData) {
  const { user, repos } = githubData;

  const topRepos = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10);

  const languages = [...new Set(repos.map((r) => r.language).filter(Boolean))];
  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const totalForks = repos.reduce((s, r) => s + r.forks_count, 0);

  const repoSummary = topRepos
    .map(
      (r) =>
        `- ${r.name} (${r.language || "no language"}, ★${r.stargazers_count}): ${r.description || "no description"}`
    )
    .join("\n");

  const prompt = `You are a savage but hilarious roast comedian. Roast this GitHub user based on their profile and repos. Be funny, sarcastic, and brutally honest — but keep it in good spirit. Do NOT be genuinely mean or personal. Focus on their coding habits, tech choices, commit patterns, and project quality.

GitHub Profile:
- Username: ${user.login}
- Name: ${user.name || "Anonymous"}
- Bio: ${user.bio || "No bio (too busy coding, apparently)"}
- Location: ${user.location || "the void"}
- Company: ${user.company || "unemployed / freelance / still in school"}
- Public repos: ${user.public_repos}
- Followers: ${user.followers}
- Following: ${user.following}
- Account created: ${user.created_at?.split("T")[0]}
- Total stars across repos: ${totalStars}
- Total forks: ${totalForks}
- Languages used: ${languages.join(", ") || "none (markdown warrior?)"}

Top repos:
${repoSummary || "No repos — truly a lurker."}

Write a 3-5 paragraph roast. Be clever and specific to their actual data. End with one backhanded compliment.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/roast") {
    try {
      const body = await readBody(req);
      if (!body.user || !body.repos) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing user or repos data" }));
        return;
      }
      const roast = await generateRoast(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ roast }));
    } catch (err) {
      console.error("Roast error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve static files
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  urlPath = urlPath.split("?")[0];
  const filePath = path.join(__dirname, "public", urlPath);
  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`GitHub Roast Bot running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set");
  }
});
