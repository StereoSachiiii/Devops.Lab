import * as amqp from "amqplib";

import { requireEnv } from "@devops/observability";

export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private reconnecting: boolean = false;
  private consumerRegistrations: { queue: string; handler: any }[] = [];
  private failedAttempts: number = 0;
  private lastFailureLogMs: number = 0;

  constructor(private readonly url: string = requireEnv("RABBITMQ_URL")) {}

  private async reconnectWithBackoff(attempt: number = 1): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const maxAttempts = 10;
    const baseDelayMs = 1000;

    while (attempt <= maxAttempts) {
      const now = Date.now();
      if (attempt === 1 || now - this.lastFailureLogMs > 30000) {
        console.log(`[RabbitMQ] Reconnecting... attempt ${attempt}/${maxAttempts} (retrying in background)`);
      }
      try {
        await this.init();
        if (this.channel) {
          console.log("[RabbitMQ] Reconnected successfully! Restoring consumers...");
          for (const reg of this.consumerRegistrations) {
            await this.consume(reg.queue, reg.handler);
          }
          this.reconnecting = false;
          return;
        }
      } catch (err) {
        this.failedAttempts++;
        if (attempt === 1 || now - this.lastFailureLogMs > 30000) {
          console.warn(
            `[RabbitMQ] Connection attempt ${attempt} failed (will retry in background):`,
            (err as any)?.message || err
          );
          this.lastFailureLogMs = now;
        }
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 30000); // cap at 30s
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }

    console.warn("[RabbitMQ] Max initial reconnect attempts reached. Background listener will self-heal when broker is started.");
    this.reconnecting = false;
  }

  /**
   * Initialize connection and channel with DLQ support
   */
  async init(): Promise<void> {
    if (!this.connection) {
      try {
        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();

        this.connection.on("error", (err: any) => {
          console.error("[RabbitMQ] connection error:", err);
          this.channel = null;
          this.connection = null;
          this.reconnectWithBackoff();
        });
        this.connection.on("close", () => {
          console.warn("[RabbitMQ] connection closed");
          this.channel = null;
          this.connection = null;
          this.reconnectWithBackoff();
        });

        if (this.channel) {
          this.channel.on("close", () => {
            console.warn("[RabbitMQ] channel closed");
            this.channel = null;
            this.reconnectWithBackoff();
          });
          this.channel.on("error", (err: any) => {
            console.error("[RabbitMQ] channel error:", err);
            this.channel = null;
            this.reconnectWithBackoff();
          });

          // Ensure prefetch is 1 for fair dispatch (perfect load balancing for slow tasks)
          await this.channel.prefetch(1);
        }

        if (this.failedAttempts > 0) {
          console.log(`🐇 RabbitMQ Connected successfully (recovered after ${this.failedAttempts} background retries)`);
        } else {
          console.log("🐇 RabbitMQ Connected");
        }
        this.failedAttempts = 0;
      } catch (err) {
        this.failedAttempts++;
        const now = Date.now();
        if (this.failedAttempts === 1 || now - this.lastFailureLogMs > 30000) {
          console.warn(
            "[RabbitMQ] Broker not available at " + this.url + " (will self-heal when broker starts):",
            (err as any)?.message || err
          );
          this.lastFailureLogMs = now;
        }
        this.reconnectWithBackoff();
      }
    }
  }

  /**
   * Ensure a queue exists with a dead-letter exchange configured
   */
  private async assertQueueWithDLQ(queue: string): Promise<void> {
    if (!this.channel) return;

    const dlx = `${queue}.dlx`;
    const dlq = `${queue}.dlq`;

    // Declare the Dead Letter Exchange
    await this.channel.assertExchange(dlx, "direct", { durable: true });

    // Declare the Dead Letter Queue
    await this.channel.assertQueue(dlq, { durable: true });
    await this.channel.bindQueue(dlq, dlx, queue); // Routing key is the original queue name

    // Declare the main queue, routing rejections to the DLX
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": dlx,
        "x-dead-letter-routing-key": queue,
      },
    });
  }

  /**
   * Publish a task/command to a specific queue
   */
  async publish<T>(queue: string, event: T): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] channel not initialized (queue=${queue}), attempting ad-hoc init...`);
      await this.init();
      if (!this.channel) {
        throw new Error(`RabbitMQ channel not initialized for queue=${queue}`);
      }
    }

    try {
      await this.assertQueueWithDLQ(queue);
      this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(event)), {
        persistent: true,
      });
    } catch (err) {
      console.error(`[RabbitMQ] publish failed for queue=${queue}:`, err);
      throw err;
    }
  }

  /**
   * Consume tasks from a queue (with native backpressure and DLQ routing)
   */
  async consume<T>(queue: string, handler: (event: T) => Promise<void>): Promise<void> {
    // Store registration so reconnectWithBackoff can restore it
    if (!this.consumerRegistrations.find((r) => r.queue === queue)) {
      this.consumerRegistrations.push({ queue, handler });
    }

    if (!this.channel) {
      console.warn(`[RabbitMQ] consume skipped - channel not initialized (queue=${queue}). Will retry on reconnect.`);
      return;
    }

    try {
      await this.assertQueueWithDLQ(queue);
      await this.channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          try {
            const raw = msg.content.toString();
            let content: T;
            try {
              content = JSON.parse(raw) as T;
            } catch (parseErr) {
              console.error(
                `[RabbitMQ] Unparseable message received on queue ${queue}. CorrelationId: ${msg.properties.correlationId || "none"}. Raw payload preview: ${raw.slice(0, 100)}...`,
                parseErr
              );
              // Reject unparseable message directly to DLQ without requeuing
              this.channel!.nack(msg, false, false);
              return;
            }
            await handler(content);
            this.channel!.ack(msg);
          } catch (err) {
            console.error(`[RabbitMQ] Error processing queue ${queue}, rejecting to DLQ:`, err);
            // false = don't requeue, false = reject only this message
            // Because x-dead-letter-exchange is configured, this pushes to DLQ!
            this.channel!.nack(msg, false, false);
          }
        }
      });
    } catch (err) {
      console.error(`[RabbitMQ] consume setup failed for queue=${queue}:`, err);
    }
  }

  /**
   * Close connections
   */
  async disconnect(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }
}
