// The entire Messenger backend: one serverless function.
//
//   GET  /api/messages?room=blue-fox-42        → the last 50 messages in that room
//   POST /api/messages  { room, from, text }   → adds a message to that room
//
// The function remembers nothing between requests: Vercel may run it on a different
// machine every time. All state lives in Redis.

import { Redis } from "@upstash/redis";

// Vercel's own Redis integration names the variables KV_*; a database created directly
// at upstash.com names them UPSTASH_REDIS_*. Accept either.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

const MAX_MESSAGES = 100;           // keep only the newest 100 messages per room
const ROOM_LIFETIME = 60 * 60 * 24; // a room disappears after 24 hours of silence (seconds)

export default async function handler(req, res) {
  // The web page lives on a different site (GitHub Pages), so the browser will only let it
  // talk to us if we say so. These CORS headers say "any site may call this API".
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end(); // the browser's pre-flight check

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({
      error: "Redis is not configured. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are missing. " +
             "On Vercel: add them under Settings → Environment Variables, then redeploy. Locally: put them in .env.local.",
    });
  }

  try {
    if (req.method === "GET") return await getMessages(req, res);
    if (req.method === "POST") return await postMessage(req, res);
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (error) {
    // If we let this escape, Vercel replies with its own error page, which has no CORS headers,
    // and the browser reports a confusing "CORS error" instead of the real problem.
    console.error(error);
    return res.status(500).json({ error: "Redis request failed: " + error.message });
  }
}

async function getMessages(req, res) {
  const room = cleanRoom(req.query.room);
  if (!room) return res.status(400).json({ error: "room is required" });

  // LRANGE with -50, -1 means "the last 50 items in the list"
  const messages = await redis.lrange(`room:${room}`, -50, -1);
  return res.status(200).json(messages);
}

async function postMessage(req, res) {
  const room = cleanRoom(req.body?.room);
  const from = String(req.body?.from ?? "").trim().slice(0, 30);
  const text = String(req.body?.text ?? "").trim().slice(0, 500);
  if (!room || !from || !text) {
    return res.status(400).json({ error: "room, from and text are required" });
  }

  const message = { from, text, time: Date.now() };
  const key = `room:${room}`;
  await redis.rpush(key, message);           // add to the end of the room's list
  await redis.ltrim(key, -MAX_MESSAGES, -1); // throw away the oldest if over the limit
  await redis.expire(key, ROOM_LIFETIME);    // restart the room's 24h countdown
  return res.status(201).json(message);
}

// Room codes: lowercase letters, digits and dashes only, up to 40 characters.
function cleanRoom(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
}
