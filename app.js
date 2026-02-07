import './src/utils/logger.js';
import express from 'express';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './src/routes/index.js';
import authRoutes from './src/routes/authRoutes.js';
import passwordResetAliasRoutes from './src/routes/passwordResetAliasRoutes.js';
import claimRoutes from './src/routes/claimRoutes.js';
import waHealthRoutes from './src/routes/waHealthRoutes.js';
import statusRoutes from './src/routes/statusRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { authRequired } from './src/middleware/authMiddleware.js';
import { dedupRequest } from './src/middleware/dedupRequestMiddleware.js';
import { sensitivePathGuard } from './src/middleware/sensitivePathGuard.js';
import { maintenanceMode } from './src/middleware/maintenanceMode.js';
import { initializeServices } from './src/core/Bootstrap.js';

console.log('='.repeat(60));
console.log('Cicero V2 - Modular Architecture');
console.log('='.repeat(60));

// Initialize all services with modular architecture
try {
  await initializeServices();
  console.log('[App] ✓ Service initialization complete');
} catch (error) {
  console.error('[App] ✗ Service initialization failed:', error);
  console.error('[App] Some services may not be available');
  // Continue startup - let circuit breakers handle failing services
}

const app = express();
app.disable('etag');

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(maintenanceMode); // Check maintenance mode
app.use(dedupRequest);
app.use(sensitivePathGuard);

app.all('/', (req, res) => res.status(200).json({ status: 'ok' }));
app.all('/_next/dev/', (req, res) => res.status(200).json({ status: 'ok' }));

// ===== STATUS & HEALTH ROUTES (PUBLIC) =====
app.use('/api', statusRoutes);

// ===== ROUTE LOGIN (TANPA TOKEN) =====
app.use('/api/auth', authRoutes);
app.use('/api/claim', claimRoutes);
app.use('/api/password-reset', passwordResetAliasRoutes);
app.use('/api/health/wa', waHealthRoutes);

// ===== ROUTE LAIN (WAJIB TOKEN) =====
app.use('/api', authRequired, routes);

// Handler NotFound dan Error
app.use(notFound);
app.use(errorHandler);

const PORT = env.PORT;
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`✓ Backend server running on port ${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
  console.log(`✓ System status: http://localhost:${PORT}/api/status`);
  console.log('='.repeat(60));
});

// Graceful shutdown is handled by ShutdownManager in Bootstrap.js
// Additional server-specific cleanup
import { shutdownManager } from './src/core/ShutdownManager.js';
shutdownManager.register('httpServer', async () => {
  console.log('[App] Closing HTTP server...');
  return new Promise((resolve) => {
    server.close(() => {
      console.log('[App] HTTP server closed');
      resolve();
    });
  });
}, 80); // High priority - close server before services
