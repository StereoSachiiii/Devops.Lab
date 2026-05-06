import amqp, { Connection, Channel } from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

export const createRabbitMQConnection = async (): Promise<Connection> => {
  return amqp.connect(RABBITMQ_URL);
};

export const createRabbitMQChannel = async (connection: Connection): Promise<Channel> => {
  return connection.createChannel();
};

export const queues = {
  SANDBOX_JOBS: 'sandbox.jobs',
  EMAIL_NOTIFICATIONS: 'email.notifications',
};
