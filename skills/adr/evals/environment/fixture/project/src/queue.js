'use strict';

const amqp = require('amqplib');

const EXCHANGE = 'shop';
let channelPromise;

function channel() {
  if (!channelPromise) {
    channelPromise = amqp
      .connect(process.env.AMQP_URL)
      .then((connection) => connection.createChannel())
      .then(async (created) => {
        await created.assertExchange(EXCHANGE, 'topic', { durable: true });
        return created;
      });
  }
  return channelPromise;
}

async function publish(routingKey, payload) {
  const open = await channel();
  open.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

async function subscribe(routingKey, queueName, handler) {
  const open = await channel();
  await open.assertQueue(queueName, { durable: true });
  await open.bindQueue(queueName, EXCHANGE, routingKey);
  await open.consume(queueName, async (message) => {
    await handler(JSON.parse(message.content.toString()));
    open.ack(message);
  });
}

module.exports = { publish, subscribe };
