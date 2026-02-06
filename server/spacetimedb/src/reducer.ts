export const sendMessage = (ctx: any, { text }: { text: string }) => {
  if (text.length > 1000) {
    throw new Error('Message too long');
  }

  const senderId = ctx.sender.toHexString().substring(0, 8); // Short ID
  const timestamp = Date.now();

  console.info(`Message from ${senderId}: ${text}`);

  ctx.db.global_message.insert({
    sender: senderId,
    text: text,
    sent_at: timestamp
  });
};
