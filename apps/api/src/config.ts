export const envSchema = {
  type: 'object',
  required: ['DATABASE_URL', 'CORS_ORIGIN'],
  properties: {
    DATABASE_URL: { type: 'string', minLength: 1 },
    PORT: { type: 'integer', default: 4000 },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
      default: 'info',
    },
    CORS_ORIGIN: { type: 'string', minLength: 1 },
  },
} as const;

export interface AppConfig {
  DATABASE_URL: string;
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  CORS_ORIGIN: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}
