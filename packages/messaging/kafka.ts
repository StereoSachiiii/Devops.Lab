import { Kafka, Producer, Consumer, logLevel } from "kafkajs";
import { EventClassMap, GroupId, BaseEvent } from "./types";
import { context, propagation, trace } from "@opentelemetry/api";
import { requireEnv } from "@devops/observability";

export class MessagingService {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private connectPromise: Promise<Producer> | null = null;
  private consumers: Consumer[] = [];
  private isRetryScheduled: boolean = false;
  private failedAttempts: number = 0;
  private lastLogMs: number = 0;

  constructor(clientId: string = requireEnv("KAFKA_CLIENT_ID")) {
    this.kafka = new Kafka({
      clientId,
      brokers: requireEnv("KAFKA_BROKERS").split(","),
      logLevel: logLevel.INFO,
    });
  }

  get isProducerReady(): boolean {
    return this.producer !== null;
  }

  async initProducer(): Promise<Producer> {
    if (this.producer) {
      return this.producer;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const candidateProducer = this.kafka.producer();
      try {
        await candidateProducer.connect();
        this.producer = candidateProducer;
        if (this.failedAttempts > 0) {
          console.log(`[Kafka] Connected successfully (recovered after ${this.failedAttempts} background attempts)`);
        }
        this.failedAttempts = 0;
        return this.producer;
      } catch (err) {
        this.producer = null;
        this.failedAttempts++;
        const now = Date.now();
        if (this.failedAttempts === 1 || now - this.lastLogMs > 45000) {
          console.warn(
            `[Kafka] Broker not yet available at ${requireEnv("KAFKA_BROKERS")} (will self-heal when started):`,
            (err as any)?.message || err
          );
          this.lastLogMs = now;
        }
        this.scheduleProducerRetry();
        throw err;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private scheduleProducerRetry(): void {
    if (this.isRetryScheduled) return;
    this.isRetryScheduled = true;

    setTimeout(async () => {
      this.isRetryScheduled = false;
      if (!this.producer && !this.connectPromise) {
        try {
          await this.initProducer();
        } catch {
          // Handled in initProducer throttled logger
        }
      }
    }, 10000);
  }

  /**
   * Emit an event class instance. Injects the active OpenTelemetry span context
   * as a W3C 'traceparent' Kafka message header so consumers can continue the trace.
   */
  async emit<T>(event: BaseEvent<T>): Promise<void> {
    if (!this.producer) {
      console.warn(`[Kafka] emit skipped - producer not initialized (topic=${event.topic})`);
      throw new Error(`Kafka producer not initialized for topic=${event.topic}`);
    }

    // Inject the current span context into a carrier object as W3C traceparent/tracestate headers
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const headers: Record<string, string> = {
      "correlation-id": event.correlationId,
      "content-type": "application/json",
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
      throw err;
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
        const span = trace.getTracer("messaging").startSpan(`consume:${topic}`, {}, parentCtx);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const event = JSON.parse(rawPayload) as EventClassMap[T];
            await context.with(trace.setSpan(parentCtx, span), () => handler(event));
            success = true;
            break;
          } catch (err) {
            console.error(
              `[Messaging] Error processing topic ${topic} (attempt ${attempt}/${maxRetries}):`,
              err
            );
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            }
          }
        }

        span.end();

        if (!success) {
          console.warn(
            `[Messaging] Message failed after ${maxRetries} attempts, sending to DLQ: ${topic}.dlq`
          );
          try {
            const producer = await this.initProducer();
            await producer.send({
              topic: `${topic}.dlq`,
              messages: [{ key: message.key, value: rawPayload }],
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
