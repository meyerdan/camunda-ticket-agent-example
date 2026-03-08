// Local chat interface for testing the AI Agent conversation loop.
// Replaces WhatsApp during development — same flow, just in a browser.
//
// - Serves a chat UI at http://localhost:3001
// - POST /message — receives outgoing messages from the send-message worker
// - User replies in the browser → correlated via webhook connector
//
// Usage: node workers/chat-server.js

import http from 'node:http';

const PORT = 3001;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:8086/inbound/whatsapp-reply';

// In-memory message store and SSE clients
const messages = [];
const clients = new Set();

// Tracks the correlation key for the most recent agent message.
// Each "send message and wait for reply" tool call generates a unique key.
let pendingCorrelationKey = null;

function broadcast(msg) {
  messages.push(msg);
  for (const res of clients) {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }
}

const server = http.createServer(async (req, res) => {
  // --- CORS headers for local dev ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- Chat UI ---
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }

  // --- SSE stream ---
  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // Send existing messages
    for (const msg of messages) {
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // --- Receive message from the send-message worker ---
  if (url.pathname === '/message' && req.method === 'POST') {
    const body = await readBody(req);
    const data = JSON.parse(body);
    console.log(`[chat] Agent: ${data.text?.substring(0, 80)}...`);

    // Store the correlation key so the next user reply reaches the right catch event
    if (data.replyCorrelationKey) {
      pendingCorrelationKey = data.replyCorrelationKey;
      console.log(`[chat] Correlation key: ${pendingCorrelationKey}`);
    }

    broadcast({ role: 'agent', text: data.text, ts: Date.now() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- User sends a reply from the browser ---
  if (url.pathname === '/reply' && req.method === 'POST') {
    const body = await readBody(req);
    const data = JSON.parse(body);
    console.log(`[chat] User: ${data.text}`);
    broadcast({ role: 'user', text: data.text, ts: Date.now() });

    // Correlate message via Zeebe REST API
    if (!pendingCorrelationKey) {
      console.error('[chat] No pending correlation key — agent has not sent a message yet');
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No pending correlation key' }));
      return;
    }

    const correlationKey = pendingCorrelationKey;
    pendingCorrelationKey = null; // consume it — each key is single-use
    try {
      const webhookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlationKey,
          text: data.text,
        }),
      });
      const webhookBody = await webhookRes.text();
      console.log(`[chat] Webhook response (${webhookRes.status}): ${webhookBody}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, webhook: webhookRes.status }));
    } catch (err) {
      console.error(`[chat] Webhook error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

server.listen(PORT, () => {
  console.log(`\n💬 Chat UI ready at http://localhost:${PORT}\n`);
  console.log(`Webhook: ${WEBHOOK_URL}\n`);
});

// ── HTML Chat UI ──────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Concert Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5ddd5; height: 100vh; display: flex; flex-direction: column; }
    header { background: #075e54; color: white; padding: 14px 20px; font-size: 18px; font-weight: 600; flex-shrink: 0; }
    #messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 75%; padding: 8px 12px; border-radius: 8px; font-size: 15px; line-height: 1.5; word-wrap: break-word; }
    .msg.agent { background: white; align-self: flex-start; border-bottom-left-radius: 2px; }
    .msg.user { background: #dcf8c6; align-self: flex-end; border-bottom-right-radius: 2px; white-space: pre-wrap; }
    .msg .meta { font-size: 11px; color: #999; margin-top: 4px; text-align: right; }
    .msg a { color: #075e54; text-decoration: underline; }
    .msg ul, .msg ol { margin: 4px 0 4px 18px; padding: 0; }
    .msg li { margin: 2px 0; }
    .msg p { margin: 6px 0; }
    .msg p:first-child { margin-top: 0; }
    .msg p:last-child { margin-bottom: 0; }
    #input-bar { display: flex; gap: 8px; padding: 10px 16px; background: #f0f0f0; flex-shrink: 0; }
    #input-bar input { flex: 1; padding: 10px 14px; border: none; border-radius: 20px; font-size: 15px; outline: none; }
    #input-bar button { background: #075e54; color: white; border: none; border-radius: 50%; width: 42px; height: 42px; font-size: 20px; cursor: pointer; }
    #input-bar button:hover { background: #064e46; }
    .typing { align-self: flex-start; color: #999; font-style: italic; font-size: 13px; padding: 4px 12px; }
  </style>
</head>
<body>
  <header>Concert Assistant</header>
  <div id="messages"></div>
  <div id="input-bar">
    <input id="input" type="text" placeholder="Type a message..." autocomplete="off" />
    <button onclick="sendReply()">&#9654;</button>
  </div>
  <script>
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');

    // SSE for real-time messages
    const source = new EventSource('/events');
    source.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      addMessage(msg);
    };

    function addMessage(msg) {
      const div = document.createElement('div');
      div.className = 'msg ' + msg.role;
      const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const content = msg.role === 'agent' ? renderMarkdown(msg.text) : escapeHtml(msg.text);
      div.innerHTML = content + '<div class="meta">' + time + '</div>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    function renderMarkdown(text) {
      let html = escapeHtml(text);
      // Bold: **text**
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      // Links: [text](url)
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
      // Bare URLs not already in an <a> tag
      html = html.replace(/(^|[^"'>])(https?:\\/\\/[^\\s<]+)/g, '$1<a href="$2" target="_blank">$2</a>');
      // Process lines: lists and paragraphs
      const lines = html.split('\\n');
      let out = '', inList = false;
      for (const line of lines) {
        const li = line.match(/^\\s*[-*]\\s+(.*)/);
        if (li) {
          if (!inList) { out += '<ul>'; inList = true; }
          out += '<li>' + li[1] + '</li>';
        } else {
          if (inList) { out += '</ul>'; inList = false; }
          out += (line.trim() === '' ? '<br>' : line + '\\n');
        }
      }
      if (inList) out += '</ul>';
      return out;
    }

    async function sendReply() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      inputEl.focus();
      try {
        await fetch('/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } catch (err) {
        console.error('Reply failed:', err);
      }
    }

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendReply();
    });

    inputEl.focus();
  </script>
</body>
</html>`;
