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
          console.error('Authentication endpoint error:', req.path, error.message);
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
  
  // Log for debugging token generation
  console.log('Generating token for user ID:', user.id, 'with role:', user.role);
  console.log('Using JWT_SECRET:', JWT_SECRET.substring(0, 3) + '...' + JWT_SECRET.substring(JWT_SECRET.length - 3));
  
  try {
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log('Token generated successfully, length:', token.length);
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
  // Enhanced token extraction with logging for debugging
  // We'll check all possible locations where a token might be present
  let token: string | undefined;
  let tokenSource: string = 'none';
  
  // First try to get token from Authorization header (most common)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
      tokenSource = 'auth_header';
    }
  }
  
  // Check for custom header (for sunschool.xyz domain)
  if (!token && req.headers['x-sunschool-auth-token']) {
    token = req.headers['x-sunschool-auth-token'] as string;
    tokenSource = 'sunschool_header';
  }
  
  // If no token in headers, check for token in query string (for API calls)
  if (!token && req.query.token) {
    token = req.query.token as string;
    tokenSource = 'query_string';
  }
  
  // If still no token, check if it's in cookies
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
    tokenSource = 'cookie';
  }
  
  // Special handling for sunschool.xyz domain, check for token in a special cookie
  if (!token && req.cookies && req.cookies.sunschool_token) {
    token = req.cookies.sunschool_token;
    tokenSource = 'sunschool_cookie';
  }
  
  // Log more detailed information about the request
  const origin = req.headers.origin || req.headers.referer || 'unknown';
  let isSunschool = false;
  try {
    const parsedOrigin = new URL(origin);
    isSunschool = parsedOrigin.hostname === 'sunschool.xyz' || parsedOrigin.hostname.endsWith('.sunschool.xyz');
  } catch (_e) { /* ignore invalid origin URL */ }
  
  // No token found in any location
  if (!token) {
    console.log(`No auth token found in request to: ${req.method} ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Request origin:', origin, isSunschool ? '(sunschool domain)' : '');
    res.status(401).json({ error: 'No authorization token provided' });
    return;
  }
  
  // Log token information for debugging (without exposing the token)
  console.log(`Auth token found in ${tokenSource} for request to: ${req.method} ${req.path}`);
  console.log(`Token length: ${token.length}, origin: ${origin}`);
  
  // For sunschool.xyz domain, add CORS headers to ensure the response works
  if (isSunschool) {
    console.log('Adding special CORS headers for sunschool.xyz domain');
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Sunschool-Auth,X-Sunschool-Auth-Token');
  }
  
  // Validate and process the token
  try {
    const payload = verifyToken(token);
    
    // Log for debugging
    console.log(`Token verified successfully for user ID: ${payload.userId}`);
    
    // Load user from database
    const user = await storage.getUser(payload.userId);
    
    if (!user) {
      console.log(`User ${payload.userId} from token not found in database`);
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
      console.log(`Invalid token: ${error.message}`);
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
