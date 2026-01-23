import { schema, table, t } from 'spacetimedb/server';

export const spacetimedb = schema(
  table(
    { name: 'global_message' },
    {
      sender: t.string(),
      text: t.string(),
      sent_at: t.number(), // Timestamp
    }
  )
);

spacetimedb.init((_ctx) => {
  console.info('Module initialized');
});

spacetimedb.clientConnected((ctx) => {
  console.info(`Client connected: ${ctx.sender}`);
});

spacetimedb.clientDisconnected((ctx) => {
  console.info(`Client disconnected: ${ctx.sender}`);
});

// Reducer to send a message
spacetimedb.reducer('send_message', { text: t.string() }, (ctx, { text }) => {
  const senderId = ctx.sender.toHexString().substring(0, 8); // Short ID
  const timestamp = Date.now();

  console.info(`Message from ${senderId}: ${text}`);

  ctx.db.global_message.insert({
    sender: senderId,
    text: text,
    sent_at: timestamp
  });
});
