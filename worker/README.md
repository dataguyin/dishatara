# DishaTara AI Worker

This is the server-side AI endpoint for the static DishaTara website. The OpenAI key is stored as a Cloudflare Worker secret; it is never sent to the browser or committed to GitHub.

## Deploy

1. Install Node.js, then open a terminal in this `worker` folder.
2. Run `npx wrangler login` and complete the Cloudflare sign-in.
3. Run `npx wrangler deploy`.
4. Set the API key as a Worker secret with `npx wrangler secret put OPENAI_API_KEY`. Paste the key only into the terminal prompt. Never put it in a source file or browser code.
5. In the repository root, edit `ai-config.js` and set `window.DISHATARA_AI_API_URL` to the deployed URL ending in `/api/ask`. For example: `https://dishatara-ai.<your-workers-subdomain>.workers.dev/api/ask`.
6. Publish that configuration to the website after checking the URL and the secret are set.

The default allowed origin is `https://dataguyin.github.io`. Change `ALLOWED_ORIGIN` in `wrangler.toml` if the public website uses another origin. The rate-limit namespace ID must be unique within your Cloudflare account; change it if that ID is already used.

## What the endpoint receives

The browser sends the current question, language, recent chat turns, and calculated D1 chart placements. It does not send the visitor's name, birth date, birth time, or birthplace. The endpoint does not log request contents. OpenAI receives the question and chart context to generate the response; its own data handling terms apply.

The endpoint caps request size and answer length and limits requests by IP to 10 per minute. The web page separately allows five successful AI answers per browser and permits only one request at a time. The browser counter is a lightweight prototype limit that can be reset by clearing browser storage or using another browser; it is not an account-level or billing-grade quota. Set up accounts and server-side usage records before adding paid question packs.

## Local check

Use `npx wrangler dev` from this folder. Configure a local `OPENAI_API_KEY` as a Wrangler secret before testing real answers. Do not commit `.dev.vars`.
