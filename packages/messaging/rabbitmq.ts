import * as amqp from 'amqplib';
import { BaseEvent } from './types';

export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;

  constructor(private readonly url: string = process.env['RABBITMQ_URL'] || 'amqp://localhost') {}

  /**
   * Initialize connection and channel with DLQ support
   */
  async init(): Promise<void> {
    if (!this.connection) {
      try {
        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();

        this.connection.on('error', (err: any) => {
          console.error('[RabbitMQ] connection error:', err);
          this.channel = null;
          this.connection = null;
        });
        this.connection.on('close', () => {
          console.warn('[RabbitMQ] connection closed');
          this.channel = null;
          this.connection = null;
        });

        if (this.channel) {
          this.channel.on('close', () => {
            console.warn('[RabbitMQ] channel closed');
            this.channel = null;
          });
          this.channel.on('error', (err: any) => {
            console.error('[RabbitMQ] channel error:', err);
            this.channel = null;
          });

          // Ensure prefetch is 1 for fair dispatch (perfect load balancing for slow tasks)
          await this.channel.prefetch(1);
        }

        console.log('🐇 RabbitMQ Connected');
      } catch (err) {
        console.error('[RabbitMQ] Failed to connect:', err);
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
    await this.channel.assertExchange(dlx, 'direct', { durable: true });
    
    // Declare the Dead Letter Queue
    await this.channel.assertQueue(dlq, { durable: true });
    await this.channel.bindQueue(dlq, dlx, queue); // Routing key is the original queue name

    // Declare the main queue, routing rejections to the DLX
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlx,
        'x-dead-letter-routing-key': queue,
      },
    });
  }

  /**
   * Publish a task/command to a specific queue
   */
  async publish<T>(queue: string, event: T): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] publish skipped - channel not initialized (queue=${queue})`);
      return;
    }

    try {
      await this.assertQueueWithDLQ(queue);
      this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(event)), {
        persistent: true,
      });
    } catch (err) {
      console.error(`[RabbitMQ] publish failed for queue=${queue}:`, err);
    }
  }

  /**
   * Consume tasks from a queue (with native backpressure and DLQ routing)
   */
  async consume<T>(
    queue: string,
    handler: (event: T) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] consume skipped - channel not initialized (queue=${queue})`);
      return;
    }

    try {
      await this.assertQueueWithDLQ(queue);
      await this.channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString()) as T;
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
