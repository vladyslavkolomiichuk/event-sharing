import {
  Kafka,
  Partitioners,
  logLevel,
  type Consumer,
  type KafkaConfig,
  type Producer,
} from 'kafkajs';

export type KafkaConnectionSettings = {
  clientId: string;
  brokers: string[];
  ssl?: boolean;
  saslUsername?: string;
  saslPassword?: string;
};

export class KafkaClientFactory {
  private readonly kafka: Kafka;

  constructor(settings: KafkaConnectionSettings) {
    const config: KafkaConfig = {
      clientId: settings.clientId,
      brokers: settings.brokers,
      ssl: settings.ssl ?? false,
      logLevel: logLevel.WARN,
    };

    if (settings.saslUsername && settings.saslPassword) {
      config.sasl = {
        mechanism: 'plain',
        username: settings.saslUsername,
        password: settings.saslPassword,
      };
    }

    this.kafka = new Kafka(config);
  }

  createProducer(): Producer {
    return this.kafka.producer({
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  createConsumer(groupId: string): Consumer {
    return this.kafka.consumer({ groupId });
  }
}
