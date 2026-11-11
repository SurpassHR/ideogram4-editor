import { pathToFileURL } from 'node:url';
import { loadGatewayConfig } from './config.ts';
import { createGatewayServer } from './server.ts';

export function startGatewayServer(env: NodeJS.ProcessEnv = process.env) {
  const config = loadGatewayConfig(env);
  const server = createGatewayServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`AI gateway listening on http://${config.host}:${config.port}`);
    if (config.providers.length === 0) {
      console.warn('No providers configured. Set provider API keys in .env or AI_GATEWAY_PROVIDERS.');
    } else {
      console.log(`Configured providers: ${config.providers.map(provider => provider.id).join(', ')}`);
    }
  });
  return { server, config };
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  const { server } = startGatewayServer();
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
