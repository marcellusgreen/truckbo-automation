// Authentication middleware for verifying JWT tokens
// Ensures request context includes authenticated user and organization info

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { RequestContext } from '../types/apiTypes';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const response = ApiResponseBuilder.unauthorized(
      'Access token required',
      { requestId: (req as any).context?.requestId, version: (req as any).context?.apiVersion }
    );
    res.status(401).json(response);
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      const response = ApiResponseBuilder.forbidden(
        'Invalid or expired token',
        undefined,
        { requestId: (req as any).context?.requestId, version: (req as any).context?.apiVersion }
      );
      res.status(403).json(response);
      return;
    }

    (req as any).user = user;

    const context = ((req as any).context || {}) as RequestContext;
    context.userId = user?.userId;
    context.companyId = user?.companyId;
    (req as any).context = context;

    next();
  });
}
