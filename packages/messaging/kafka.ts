import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { EventClassMap, GroupId, BaseEvent } from './types';
import { context, propagation, trace } from '@opentelemetry/api';

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

  get isProducerReady(): boolean {
    return this.producer !== null;
  }

  async initProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
    return this.producer;
  }

  /**
   * Emit an event class instance. Injects the active OpenTelemetry span context
   * as a W3C 'traceparent' Kafka message header so consumers can continue the trace.
   */
  async emit<T>(event: BaseEvent<T>): Promise<void> {
    if (!this.producer) {
      console.warn(`[Kafka] emit skipped - producer not initialized (topic=${event.topic})`);
      return;
    }

    // Inject the current span context into a carrier object as W3C traceparent/tracestate headers
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const headers: Record<string, string> = {
      'correlation-id': event.correlationId,
      'content-type': 'application/json',
      ...carrier, // adds 'traceparent' and optionally 'tracestate'
    };

    try {
      await this.producer.send({
        topic: event.topic,
        messages: [
          {
            key: event.correlationId,
            value: JSON.stringify(event),
            headers,
          },
        ],
      });
    } catch (err) {
      console.error(`[Kafka] emit failed for topic=${event.topic}:`, err);
    }
  }

  /**
   * Type-safe consumption using the EventClassMap.
   * Extracts the W3C traceparent from message headers to continue the distributed trace.
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
        if (!message.value) return;
        const maxRetries = 3;
        const rawPayload = message.value.toString();
        let success = false;

        // Extract traceparent from headers to restore the distributed trace context
        const carrier: Record<string, string> = {};
        if (message.headers) {
          for (const [key, val] of Object.entries(message.headers)) {
            if (val) carrier[key] = Buffer.isBuffer(val) ? val.toString() : String(val);
          }
        }
        const parentCtx = propagation.extract(context.active(), carrier);
        const span = trace.getTracer('messaging').startSpan(`consume:${topic}`, {}, parentCtx);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const event = JSON.parse(rawPayload) as EventClassMap[T];
            await context.with(trace.setSpan(parentCtx, span), () => handler(event));
            success = true;
            break;
          } catch (err) {
            console.error(`[Messaging] Error processing topic ${topic} (attempt ${attempt}/${maxRetries}):`, err);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
          }
        }

        span.end();

        if (!success) {
          console.warn(`[Messaging] Message failed after ${maxRetries} attempts, sending to DLQ: ${topic}.dlq`);
          try {
            const producer = await this.initProducer();
            await producer.send({
              topic: `${topic}.dlq`,
              messages: [{ key: message.key, value: rawPayload }]
            });
          } catch (dlqErr) {
            console.error(`[Messaging] CRITICAL: Failed to publish to DLQ for ${topic}`, dlqErr);
            throw dlqErr;
          }
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
