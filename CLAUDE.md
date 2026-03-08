# Concerts Agent

## Config
- Environment: C8 Run (local) → see docs/env-c8run.md
- Language: Node.js → see docs/lang-nodejs.md
- Dev patterns: see docs/camunda-dev-guide.md

## Process
Periodically check for upcoming concerts in and around Boston, cross-reference artists with the user's Spotify library, and if there are matches, hand off to an AI agent that communicates via WhatsApp. The agent notifies the user and their wife, answers questions ("what's the ticket price?"), and books tickets on request.

### Flow
1. **Timer start event** — triggers weekly
2. **Fetch upcoming concerts** — service task calling Ticketmaster Discovery API for Boston-area events
3. **Fetch Spotify library** — service task pulling user's top/saved artists from Spotify API
4. **Match artists** — service task cross-referencing concert artists with Spotify library
5. **Gateway** — any matches found?
   - **No matches** → end
   - **Matches found** → continue
6. **AI Agent ad-hoc sub-process** — Camunda AI Agent connector (Anthropic) drives a WhatsApp conversation with tools:
   - **Send message and wait for reply** — sub-flow: sends WhatsApp message → waits for reply via webhook connector (inbound, `io.camunda:webhook:1`)
   - **Get concert details** — looks up concert info from matched list
   - **Check ticket price** — checks pricing/availability
   - **Book tickets** — initiates booking
7. **End**

The agent loops naturally through tool calls — no explicit BPMN loop needed. Each "send + wait" tool call sends a message, then the built-in webhook connector waits for Meta's WhatsApp webhook POST at `http://<host>/inbound/whatsapp-reply`.

### Variables
| Name | Type | Set By | Description |
|------|------|--------|-------------|
| concertResults | array | fetch-concerts | Raw concert listings from API |
| spotifyArtists | array | fetch-spotify | User's library artists |
| matchedConcerts | array | match-artists | Concerts matching Spotify library |
| chatId | string | send-whatsapp-reply worker | WhatsApp phone for message correlation |
| userMessage | string | webhook connector (inbound) | Latest WhatsApp reply from user |
| agent | object | AI Agent connector | Agent state (context, response, toolCalls) |

### Error Handling
- Spotify API auth failure → boundary error event, retry with token refresh
- Concerts API unavailable → boundary timer, retry after delay
- WhatsApp send failure → agent error boundary → end
- Agent error → boundary error event on ad-hoc sub-process

## Components

### Workers (workers/)
| Task Type | File | Description |
|-----------|------|-------------|
| fetch-concerts | workers/fetch-concerts.js | Call Ticketmaster API for Boston-area events |
| fetch-spotify | workers/fetch-spotify.js | Pull user's saved/top artists from Spotify |
| match-artists | workers/match-artists.js | Cross-reference concerts with Spotify artists |
| send-whatsapp-reply | workers/send-whatsapp.js | Send WhatsApp message (agent tool) |
| get-concert-details | workers/get-concert-details.js | Look up concert details (agent tool) |
| check-ticket-price | workers/check-ticket-price.js | Check pricing (agent tool) |
| book-tickets | workers/book-tickets.js | Book tickets (agent tool) |

### Webhook Connector (built-in)
The "Wait for reply" receive task uses Camunda's HTTP webhook connector (`io.camunda:webhook:1`):
- Endpoint: `http://<host>/inbound/whatsapp-reply` (auto-created on deploy)
- Handles Meta verification challenge via response body expression
- Correlates replies by sender phone number (`chatId`)
- Extracts message text into `userMessage` variable
- No custom webhook server needed

### Resources (resources/)
- `concerts-agent.bpmn` — main process with AI Agent ad-hoc sub-process

## API Keys Required
| Secret | Environment Variable | Description |
|--------|---------------------|-------------|
| Ticketmaster | TICKETMASTER_API_KEY | Discovery API key |
| Spotify | SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN | OAuth credentials |
| WhatsApp | WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_RECIPIENT_PHONE | Meta Cloud API |
| Anthropic | ANTHROPIC_API_KEY | Set as env var before starting C8 Run (exposed as connector secret) |

## Build Order
1. ✅ Scaffold project structure, BPMN process with AI Agent
2. ✅ Implement `fetch-concerts` worker (Ticketmaster Discovery API)
3. ✅ Implement `fetch-spotify` worker (Spotify Web API)
4. ✅ Implement `match-artists` worker (pure logic with matched artist annotations)
5. ✅ Implement `send-whatsapp` worker (Meta WhatsApp Business API)
6. ✅ Implement `get-concert-details`, `check-ticket-price`, `book-tickets` workers
7. Configure Meta WhatsApp webhook URL → `http://<public-url>/inbound/whatsapp-reply`
8. Deploy and test end-to-end with C8 Run
