import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { storage } from '../storage';

// Define a better async handler for express with correct return type
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function(req: Request, res: Response, next: NextFunction): Promise<void> {
    return Promise
      .resolve(fn(req, res, next))
      .catch((error) => {
        console.error('Unhandled API error:', error);
        
        // If headers have already been sent, just forward the error
        if (res.headersSent) {
          return next(error);
        }
        
        // For auth endpoints, provide more specific error handling
        if (req.path.includes('/api/login') || req.path.includes('/api/register')) {
          res.status(500).json({
            error: 'Authentication service error',
            message: error.message || 'An unexpected error occurred'
          });
          return;
        }
        
        // Forward to default error handler
        next(error);
      });
  };
}

// Define types
export interface JwtPayload {
  userId: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string | number;
    email: string;
    username: string;
    name: string;
    role: string;
    password: string;
    parentId: string | number | null;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    createdAt: Date;
    updatedAt?: Date;
  };
}

const scryptAsync = promisify(scrypt);
const JWT_SECRET = process.env.JWT_SECRET || 'sunschool-secure-jwt-secret-for-development-5a5b2f8e6c7d';
const JWT_EXPIRES_IN = '7d'; // 7 days

// Password hashing and verification
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  if (!stored || !stored.includes('.')) {
    console.error('Invalid stored password format');
    return false;
  }
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) {
    console.error('Invalid hash or salt');
    return false;
  }
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// JWT functions
export function generateToken(user: { id: string | number, role: string }): string {
  const payload: JwtPayload = {
    userId: String(user.id),
    role: user.role
  };
  
  try {
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return token;
  } catch (error) {
    console.error('Failed to generate token:', error);
    throw error;
  }
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// Middleware
export async function authenticateJwt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  // Try Authorization header first (most common)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  // Check for custom header (for sunschool.xyz domain)
  if (!token && req.headers['x-sunschool-auth-token']) {
    token = req.headers['x-sunschool-auth-token'] as string;
  }

  // Check for token in query string (for API calls)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  // Check cookies
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // Check for sunschool-specific cookie
  if (!token && req.cookies && req.cookies.sunschool_token) {
    token = req.cookies.sunschool_token;
  }
  
  // Determine origin for CORS handling
  const origin = req.headers.origin || '';
  const allowedAuthOrigins = [
    'https://sunschool.xyz',
    'https://www.sunschool.xyz',
    'http://localhost:5000',
    'http://localhost:3000'
  ];

  if (!token) {
    res.status(401).json({ error: 'No authorization token provided' });
    return;
  }

  // For explicitly allowed origins, add CORS headers to ensure the response works
  if (allowedAuthOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Sunschool-Auth,X-Sunschool-Auth-Token');
  }
  
  // Validate and process the token
  try {
    const payload = verifyToken(token);

    // Load user from database
    const user = await storage.getUser(payload.userId);
    
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    // Add user to request for downstream middleware/handlers
    req.user = user;
    next();
  } catch (error) {
    // Check if it's a token verification error
    if (error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError ||
        error instanceof jwt.NotBeforeError) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    
    // For other errors
    console.error('Unexpected error during token verification:', error);
    res.status(500).json({ error: 'Authentication error', details: error.message });
  }
}

export function hasRoleMiddleware(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    
    next();
  };
}
