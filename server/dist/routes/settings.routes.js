import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as settingsController from '../controllers/settings.controller.js';
const router = Router();
router.get('/', authenticate, settingsController.getSettings);
router.patch('/', authenticate, settingsController.updateSettings);
router.post('/reset', authenticate, settingsController.resetSettings);
export default router;
