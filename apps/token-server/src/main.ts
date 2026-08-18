import { ConfigError, loadConfig } from './config.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\nnigord token-server refused to start.\n${error.message}\n`);
      console.error('Copy .env.example to .env and fill it in.\n');
      process.exit(1);
    }
    throw error;
  }

  const app = await buildApp(config);
  await app.listen({ port: config.port, host: config.host });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}

void start();
