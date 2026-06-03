import * as amqp from 'amqplib';
import { BaseEvent } from './types';

export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;

  constructor(private readonly url: string = process.env['RABBITMQ_URL'] || 'amqp://localhost') {}

  /**
   * Initialize connection and channel
   */
  async init(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Clean up references when the connection or channel closes/errors so
      // future publish/consume calls become no-ops and don't throw.
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

      if (this.channel && typeof this.channel.on === 'function') {
        this.channel.on('close', () => {
          console.warn('[RabbitMQ] channel closed');
          this.channel = null;
        });
        this.channel.on('error', (err: any) => {
          console.error('[RabbitMQ] channel error:', err);
          this.channel = null;
        });
      }

      console.log('🐇 RabbitMQ Connected');
    }
  }

  /**
   * Publish a task/message to a specific queue
   */
  async publish<T>(queue: string, event: BaseEvent<T>): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] publish skipped - channel not initialized (queue=${queue})`);
      return;
    }

    try {
      await this.channel.assertQueue(queue, { durable: true });
      this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(event)), {
        persistent: true,
      });
    } catch (err) {
      console.error(`[RabbitMQ] publish failed for queue=${queue}:`, err);
    }
  }

  /**
   * Consume tasks from a queue
   */
  async consume<T>(
    queue: string,
    handler: (event: BaseEvent<T>) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] consume skipped - channel not initialized (queue=${queue})`);
      return;
    }

    try {
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString()) as BaseEvent<T>;
            await handler(content);
            this.channel.ack(msg);
          } catch (err) {
            console.error(`[RabbitMQ] Error processing queue ${queue}:`, err);
            this.channel.nack(msg, false, true);
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
