import express, { type Express, type Request } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ApiError } from './lib/errors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { accessRouter } from './routes/access.js';
import { academicPeriodsRouter } from './routes/academicPeriods.js';
import { aiRouter } from './routes/ai.js';
import { auditRouter, custodyRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import {
  billingRouter,
  clientsRouter,
  invoicesRouter,
  licensePlansRouter,
  licensesRouter,
  paymentsRouter,
  quotesRouter,
} from './routes/billing.js';
import { catalogsRouter } from './routes/catalogs.js';
import { categoriesRouter } from './routes/categories.js';
import { deletionLogsRouter, deletionRequestsRouter } from './routes/deletion.js';
import { documentsRouter } from './routes/documents.js';
import { expedientesRouter } from './routes/expedientes.js';
import { featuresRouter } from './routes/features.js';
import { helpRouter } from './routes/help.js';
import { loansRouter } from './routes/loans.js';
import { meRouter } from './routes/me.js';
import { notificationsRouter } from './routes/notifications.js';
import { peopleRouter } from './routes/people.js';
import { searchRouter } from './routes/search.js';
import { statsRouter } from './routes/stats.js';
import { systemRouter } from './routes/system.js';
import { trashRouter } from './routes/trash.js';
import { trdRouter } from './routes/trd.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError(403, 'FORBIDDEN', 'Origen no permitido por CORS.'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req: unknown) => (req as Request).requestId ?? '',
        autoLogging: { ignore: (req: { url?: string }) => req.url === '/api/system/health' },
      }),
    );
  }

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.isTest ? 1000 : 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' },
    },
  });

  const api = express.Router();

  api.use('/auth', authLimiter, authRouter);
  api.use('/catalogs', catalogsRouter);
  api.use('/users', usersRouter);
  api.use('/access', accessRouter);
  api.use('/features', featuresRouter);
  api.use('/documents', documentsRouter);
  api.use('/search', searchRouter);
  api.use('/expedientes', expedientesRouter);
  api.use('/people', peopleRouter);
  api.use('/academic-periods', academicPeriodsRouter);
  api.use('/trd', trdRouter);
  api.use('/categories', categoriesRouter);
  api.use('/loans', loansRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/deletion-requests', deletionRequestsRouter);
  api.use('/deletion-logs', deletionLogsRouter);
  api.use('/trash', trashRouter);
  api.use('/audit', auditRouter);
  api.use('/custody', custodyRouter);
  api.use('/stats', statsRouter);
  api.use('/system', systemRouter);
  api.use('/help', helpRouter);
  api.use('/me', meRouter);
  api.use('/ai', aiRouter);

  // Panel comercial (docs/FACTURACION.md). No es facturación electrónica DIAN.
  api.use('/clients', clientsRouter);
  api.use('/license-plans', licensePlansRouter);
  api.use('/licenses', licensesRouter);
  api.use('/quotes', quotesRouter);
  api.use('/invoices', invoicesRouter);
  api.use('/payments', paymentsRouter);
  api.use('/billing', billingRouter);

  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
