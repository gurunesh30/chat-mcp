# Choosing a message queue: Kafka vs RabbitMQ

## User

We're building an event-driven microservices architecture and need to choose between Kafka and RabbitMQ. Our main use case is processing order events — about 50k events per day, with some downstream services that need guaranteed delivery. Which should we choose?

## Assistant

For your use case — 50k events/day with guaranteed delivery across microservices — either would work, but they're architecturally different. Here's a practical breakdown:

**RabbitMQ** (message broker model)
- Push-based: broker routes messages to consumers and removes them on acknowledgement
- Built for guaranteed delivery with dead-letter queues, retries, and message TTL
- Easier to set up and operate for smaller throughput
- Better for: task queues, RPC patterns, complex routing (exchanges/bindings)

**Kafka** (distributed log model)
- Pull-based: consumers read from an immutable log at their own pace
- Messages are retained for a configurable period (not deleted on consumption)
- Horizontal scale and replay are first-class features
- Better for: event sourcing, audit logs, multiple independent consumer groups

**My recommendation for your case: RabbitMQ**

50k events/day is well within RabbitMQ's comfort zone (it handles millions). Your "guaranteed delivery" requirement maps naturally to RabbitMQ's acknowledgement model. Kafka would be over-engineered here unless you anticipate:
- Needing to replay order history
- 10× or more growth in event volume
- Multiple independent teams consuming the same event stream

## User

What's the dead-letter queue pattern in RabbitMQ and how do we use it for failed order processing?

## Assistant

A dead-letter queue (DLQ) in RabbitMQ is a holding area for messages that couldn't be processed successfully. Messages are routed there automatically when they're rejected, expire, or exceed the queue length limit.

**Setup:**

```
Normal Queue: orders.process
  ↓ (on rejection/expiry)
Dead-letter Exchange: orders.dlx
  ↓
DLQ: orders.dead
```

**Configuration (Node.js with amqplib):**

```js
const channel = await connection.createChannel();

// 1. Declare the dead-letter exchange
await channel.assertExchange('orders.dlx', 'direct', { durable: true });

// 2. Declare the DLQ bound to the DLX
await channel.assertQueue('orders.dead', { durable: true });
await channel.bindQueue('orders.dead', 'orders.dlx', 'failed');

// 3. Declare the main queue with DLX config
await channel.assertQueue('orders.process', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'failed',
    'x-message-ttl': 30000,  // auto-DLQ after 30s if unacked
  }
});
```

**Consumer with retry logic:**

```js
channel.consume('orders.process', async (msg) => {
  if (!msg) return;
  
  try {
    await processOrder(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  } catch (err) {
    const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
    
    if (retryCount < 3) {
      // Re-queue with incremented retry count
      channel.publish('', 'orders.process', msg.content, {
        headers: { 'x-retry-count': retryCount },
      });
      channel.ack(msg);
    } else {
      // Give up — send to DLQ
      channel.nack(msg, false, false);
    }
  }
});
```

A separate consumer on `orders.dead` can alert on-call or trigger manual review workflows.

## User

Should we use a separate exchange per microservice or one central exchange?

## Assistant

Go with **one exchange per bounded domain, not one per microservice**. Here's the reasoning:

**One central exchange (anti-pattern for your case)**
- Creates tight coupling — all services publish to the same exchange
- Routing logic becomes complex as you add services
- A misconfigured binding can accidentally send order events to the wrong service

**One exchange per service (also problematic)**
- Services that publish to each other need to know each other's exchange names
- Creates a web of dependencies instead of clean event flows

**Recommended: domain exchange pattern**
- `orders.exchange` — all order lifecycle events (created, paid, shipped, cancelled)
- `inventory.exchange` — stock updates, reservations
- `notifications.exchange` — email/SMS triggers

Each service publishes to its own domain exchange using a routing key like `order.created` or `order.paid`. Downstream services bind their queues to whichever exchanges and routing keys they care about.

```
orders-service  →  orders.exchange  →  (routing key: order.created)
                                         ↓ bound queue: payments.order-created
                                         ↓ bound queue: inventory.order-created
                                         ↓ bound queue: notifications.order-created
```

This gives you loose coupling (services don't know about each other), easy fan-out (add a new consumer without changing the publisher), and clean audit trails per domain.
