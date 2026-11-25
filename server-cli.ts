import { startServer } from './server';

startServer({
  port: Number(process.env.PORT || 3000),
  host: '0.0.0.0',
  useVite: process.env.NODE_ENV !== 'production',
}).catch((error) => {
  console.error('Kinetix Studio server startup error:', error);
  process.exit(1);
});
