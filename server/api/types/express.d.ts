import { RequestContext } from './apiTypes';

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
      user?: {
        userId: string;
        companyId: string;
        email: string;
        role: string;
      };
    }
  }
}