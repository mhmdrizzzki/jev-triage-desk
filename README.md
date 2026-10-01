# Jev Triage Desk

Paste an inbox — one item per line. **[Jev](https://gen.pollinations.ai/docs)** decides, for every item:

| Decision | Question type | What the app does with it |
|---|---|---|
| Owning team | `choice` (`engineering` / `support` / `content` / `growth`) | Moves the card into that team's column |
| Urgency | `score` (rungs `low → critical`) | Draws the urgency bar, sorts the board |
| Page now? | `noul` | Adds a `PAGE NOW` badge above 50% |

The page code contains **no heuristics of its own** — it never guesses a team, never ranks text, never decides anything. It only lays out what Jev returned. One `POST /alpha/decisions` call carries every item, three questions each.

## Run it

Live: **https://mhmdrizzzki.github.io/jev-triage-desk/**

It is a single static `index.html`, no build step, no bundler, no server.

## Sign-in

The app uses **Bring Your Own Pollen** (OAuth authorization-code + PKCE, no client secret, browser-only).
You sign in with Pollinations and the app receives a scoped `sk_...` key that **you** fund — the app never pays for your usage.

- Authorize: `https://enter.pollinations.ai/authorize`
- Token: `POST https://enter.pollinations.ai/api/oauth/token`
- Decisions: `POST https://gen.pollinations.ai/alpha/decisions` with body `{ model: "jev", state, questions }`

Request shape:

```json
{
  "model": "jev",
  "state": { "task": "Triage this inbox", "inbox": ["..."], "urgency_scale": ["low","medium","high","critical"] },
  "questions": {
    "i0_lane":     { "type": "choice", "instructions": "...", "criteria": { "support": "...", "engineering": "..." } },
    "i0_priority": { "type": "score",  "instructions": "...", "criteria": ["low","medium","high","critical"] },
    "i0_now":      { "type": "noul",   "instructions": "Should this page someone on call right now?" }
  }
}
```

Note: `score` needs `criteria` as an **ordered array** of rungs (at least two).

## Privacy

The inbox text you paste is sent only to Pollinations, with your own key. The app stores your token in `sessionStorage` and never in `localStorage`, a URL, or analytics. No backend, no logging.

## Credits

Decisions by the `jev` decision model through [Pollinations](https://pollinations.ai).

MIT licensed.
