import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.middleware.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import sellersRoutes from './routes/sellers.routes.js';
import productsRoutes from './routes/products.routes.js';
import customersRoutes from './routes/customers.routes.js';
import financeRoutes from './routes/finance.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import permissionsRoutes from './routes/permissions.routes.js';
import auditRoutes from './routes/audit.routes.js';
import ownedProductsRoutes from './routes/ownedProducts.routes.js';
import usersRoutes from './routes/users.routes.js';
import tasksRoutes from './routes/tasks.routes.js';
import approvalsRoutes from './routes/approvals.routes.js';
import companyAnalyticsRoutes from './routes/companyAnalytics.routes.js';
import employeeRoutes from './routes/employee.routes.js';
const app = express();
app.use(helmet());
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}
app.use(generalLimiter);
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Server is healthy', platform: 'ARDUMUL AM Enterprise Operations' });
});
// Original and enterprise modules
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/sellers', sellersRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/permissions', permissionsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/owned-products', ownedProductsRoutes);
// Company Management routes
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/approvals', approvalsRoutes);
app.use('/api/v1/company-analytics', companyAnalyticsRoutes);
app.use('/api/v1/employee', employeeRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
