import { Kafka, Producer, Consumer, LogEntry, logLevel } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'devops-platform',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.INFO,
});

export const createProducer = async (): Promise<Producer> => {
  const producer = kafka.producer();
  await producer.connect();
  return producer;
};

export const createConsumer = async (groupId: string): Promise<Consumer> => {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
};

export const topics = {
  CHALLENGE_SOLVED: 'challenge.solved',
  QUIZ_COMPLETED: 'quiz.completed',
  USER_BADGE_EARNED: 'user.badge.earned',
};
