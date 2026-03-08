// Send messages to the chat interface (local dev) or WhatsApp (production).
//
// Used as a tool inside the AI Agent ad-hoc sub-process.
// Receives `messageText` from the agent via fromAi(), sends it, and
// completes with a unique `replyCorrelationKey` for message correlation.
//
// The key is unique per tool call, so multiple catch events in the same
// process instance (or across instances) never steal each other's replies.

import crypto from 'node:crypto';

const CHAT_SERVER = process.env.CHAT_SERVER_URL || 'http://localhost:3001';
const CHAT_ID = 'local-user';

export function registerSendWhatsAppReply(zeebe) {
  zeebe.createWorker({
    taskType: 'send-whatsapp-reply',
    taskHandler: async (job) => {
      const { messageText } = job.variables;
      console.log(`[send-message] Sending: "${(messageText || '').substring(0, 80)}..."`);

      // Generate a unique correlation key for this specific tool call.
      // Combines the chat ID (identifies the user) with a random suffix
      // (isolates this catch event from all others).
      const replyCorrelationKey = `${CHAT_ID}-${crypto.randomUUID()}`;

      const response = await fetch(`${CHAT_SERVER}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          replyCorrelationKey,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return job.fail(`Chat server error (${response.status}): ${body}`);
      }

      console.log(`[send-message] Delivered (correlationKey: ${replyCorrelationKey})`);
      return job.complete({ replyCorrelationKey });
    },
  });
}
