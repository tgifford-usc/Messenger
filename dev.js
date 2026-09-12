// Runs the API on your laptop, no Vercel account or CLI needed.
//
//   npm run dev      (which runs:  node --env-file=.env.local dev.js)
//
// On Vercel, every file in api/ becomes a URL, and each request is handed to that file's
// function with a few helpers attached: req.query, req.body, res.status(), res.json().
// This file does the same job in ~40 lines, so you can see there's no magic in it.

import http from "node:http";
import messages from "./api/messages.js";

const PORT = 3000;
const routes = { "/api/messages": messages };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = routes[url.pathname];
  if (!handler) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end(`Nothing at ${url.pathname}. Try /api/messages?room=test`);
    return;
  }

  // The helpers Vercel adds to req and res
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readJsonBody(req);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return res; };

  console.log(req.method, req.url);
  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}).listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}/api/messages`);
  console.log(`Try it: http://localhost:${PORT}/api/messages?room=test`);
});

// Collect the request body and parse it as JSON (undefined if there isn't one).
function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : undefined); }
      catch { resolve(undefined); }
    });
  });
}
