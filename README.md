# Messenger — backend

The server half of a tiny chat app. It's one Node function on Vercel plus a Redis database. The phone app that talks to it lives in a separate repo (`MessengerApp`) and is hosted on GitHub Pages.

```
Phone A ──POST /api/messages {room, from, text}──▶ this function ──RPUSH──▶ Redis
Phone B ──GET  /api/messages?room=…  (every 2 s)──▶ this function ──LRANGE─▶ Redis
```

## How it works

Every messaging app has to solve two separate problems:

1. **Where do the messages live?** Not inside the server. Vercel runs our function on whichever machine is free, and it forgets everything between requests. So messages go in a database. Think of Redis as a big JavaScript object that lives on the internet and survives between requests.
2. **How does your friend's phone find out you sent something?** It *asks*. The app fetches the room's messages every 2 seconds. This is called **polling**. It's the simplest approach there is, and in a two-person chat it feels instant.

There are no accounts. Both people just type the same **room code**; anyone with the code can read and write that room. A room keeps its last 100 messages and disappears after 24 hours of silence.

## The API

| Request | What it does | Response |
|---|---|---|
| `GET /api/messages?room=blue-fox-42` | Last 50 messages in the room, oldest first | `[{ "from": "Ann", "text": "hi", "time": 1757600000000 }, …]` |
| `POST /api/messages` with JSON body `{ "room": "blue-fox-42", "from": "Ann", "text": "hi" }` | Adds a message | `201` and the stored message |

Room codes are lower-cased and stripped to letters, digits and dashes. Names are capped at 30 characters, messages at 500. Errors come back as `{ "error": "…" }`.

## Files

| File | What it is |
|---|---|
| `api/messages.js` | The whole server. Vercel turns every file in `api/` into a URL. |
| `public/index.html` | A status page at `/` that checks the database is connected. Not the app; just so the deployment doesn't greet you with a 404. |
| `dev.js` | Runs the API on your laptop for testing. Vercel ignores it. |
| `package.json` | Declares the one dependency, `@upstash/redis`, and the `npm run dev` command |

## Deploying

1. Put this folder in a GitHub repository.
2. On [vercel.com](https://vercel.com) choose **Add New → Project** and import the repo. Leave the build settings at their defaults.
3. You need a Redis database. Two ways, pick one:

   **A. Let Vercel make one.** On the import screen, under *Optional integrations*, click **Upstash for Redis**, choose the free plan and a region near you (Sydney), and finish the import. The database's credentials are added to the project automatically, as `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Deploy and you're done.

   **B. Make one at upstash.com yourself.** Create a free database at [upstash.com](https://upstash.com). On its Details page, under *Connect → REST*, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Deploy the Vercel project, then go to **Settings → Environment Variables**, add both, and **Redeploy** (Deployments → ⋯ → Redeploy). Environment variables only take effect on a fresh deployment; this is the step everyone forgets.

   The code accepts either set of names. Whichever way you go, the token is a password: don't paste it into slides or commit it.
4. Check it: open `https://YOUR-PROJECT.vercel.app`. The status page says whether the database is connected, and if not, what's missing. (The raw API is at `/api/messages?room=test`; it should show `[]`.)
5. Put that `https://YOUR-PROJECT.vercel.app` address at the top of the app's `index.html`.

## Running on your laptop

Create a file called `.env.local` in this folder containing the database's URL and token, one per line as `NAME=value`. If Vercel made the database (route A), the ready-made snippet is under **Storage → your database → Quickstart**; if you made it at upstash.com (route B), it's on the database's Details page. The file is git-ignored, so it can't be committed by accident. Then:

```
npm install
npm run dev           # then open http://localhost:3000
```

`npm run dev` runs `node --env-file=.env.local dev.js`. The `--env-file` flag (built into Node 20.6 and later) loads the file into `process.env`, and `dev.js` is a 40-line stand-in for Vercel: it turns `api/messages.js` into a URL and adds the same `req.query`, `req.body`, `res.status()` and `res.json()` helpers. Read it; there's nothing in there you don't already know.

To test the app against it, set the app's `API` constant to `http://localhost:3000` and open `index.html` in a browser on the same laptop.

## Things worth knowing

**Where does `process.env.UPSTASH_REDIS_REST_URL` (or `KV_REST_API_URL`) come from?** Nothing in `api/messages.js` reads a file. On Vercel, the values you typed into Settings → Environment Variables are placed into `process.env` before your function runs; locally, `node --env-file` does the same from `.env.local`. That's the whole idea of environment variables: the code is identical everywhere, only its surroundings change, and the secret never has to live in the repo.

**CORS.** The app lives on `github.io` and the API on `vercel.app`. Browsers block a page from calling a different site unless that site explicitly allows it, which is what the `Access-Control-Allow-Origin` header at the top of the function does. Delete those lines and deploy: the app will stop working with a "Failed to fetch" error, even though the API still works when you open it in a browser tab.

**Polling costs something.** Each poll is one Redis command and each send is three. The free Upstash tier allows 500,000 commands a month (there's a usage graph on the database's Details page). One phone polling every 2 seconds uses about 1,800 an hour, which is plenty for a project, but it's why the app stops polling in the background, and why you shouldn't set `POLL_INTERVAL` to 100.

## Ideas to extend it

- **Who's online.** Add a `POST /api/presence` that does `SET presence:{room}:{name} 1 EX 5`, and have `GET` return anyone whose key still exists (`KEYS presence:{room}:*`).
- **Only send what's new.** Accept a `?since=<time>` parameter and return just the messages after it, so each poll is smaller.
- **Delete a room.** A `DELETE /api/messages?room=…` that calls `DEL`.
- **Make it truly instant.** Swap polling for WebSockets. That needs a server that stays running, which Vercel can't do, so look at Socket.IO on Render's free tier.
