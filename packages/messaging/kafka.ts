import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { EventClassMap, GroupId, BaseEvent } from './types';

export class MessagingService {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Consumer[] = [];

  constructor(clientId: string = process.env['KAFKA_CLIENT_ID'] || 'devops-platform') {
    this.kafka = new Kafka({
      clientId,
      brokers: (process.env['KAFKA_BROKERS'] || 'localhost:19092').split(','),
      logLevel: logLevel.INFO,
    });
  }

  async initProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
    return this.producer;
  }

  /**
   * Emit an event class instance
   */
  async emit<T>(event: BaseEvent<T>): Promise<void> {
    if (!this.producer) {
      throw new Error('Producer not initialized. Call initProducer() first.');
    }

    await this.producer.send({
      topic: event.topic,
      messages: [
        {
          key: event.correlationId,
          value: JSON.stringify(event),
        },
      ],
    });
  }

  /**
   * Type-safe consumption using the EventClassMap
   */
  async consume<T extends keyof EventClassMap>(
    groupId: GroupId,
    topic: T,
    handler: (event: EventClassMap[T]) => Promise<void>
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          if (message.value) {
            // We cast to the specific event class type
            const event = JSON.parse(message.value.toString()) as EventClassMap[T];
            await handler(event);
          }
        } catch (err) {
          console.error(`[Messaging] Error processing topic ${topic}:`, err);
        }
      },
    });

    this.consumers.push(consumer);
    return consumer;
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    for (const consumer of this.consumers) {
      await consumer.disconnect();
    }
  }
}
