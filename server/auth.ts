import { Express, Request, Response, NextFunction } from "express";
import rateLimit from 'express-rate-limit';
import crypto from "crypto";
import { storage } from "./storage";
import { users } from "../shared/schema";
import { asyncHandler, hashPassword, comparePasswords, generateToken, authenticateJwt, hasRoleMiddleware, AuthRequest } from "./middleware/auth";
import { db } from "./db";
import { count, eq } from "drizzle-orm";
import passport from "passport";

// In-memory store for password reset tokens (avoids schema migration)
const resetTokens = new Map<string, { userId: number; expires: Date }>();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sets up authentication routes (JWT auth only for now)
 */
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(passport.initialize());

  // Endpoint to check server and database health
  app.get("/api/healthcheck", asyncHandler(async (req, res) => {
    try {
      // Count users for basic DB query test
      const result = await db.select({ count: count() }).from(users);
      const userCount = result[0]?.count || 0;
      
      return res.json({ 
        status: "ok", 
        db: "connected",
        userCount 
      });
    } catch (error) {
      console.error("Health check error:", error);
      return res.status(500).json({ 
        status: "error",
        message: "Database connection failed",
        error: (error as Error).message 
      });
    }
  }));

  // Enhanced JWT login endpoint with cross-domain support
  app.post("/api/login", authLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      // Determine the request origin for CORS handling
      const origin = req.headers.origin || '';
      const allowedAuthOrigins = [
        'https://sunschool.xyz',
        'https://www.sunschool.xyz',
        'http://localhost:5000',
        'http://localhost:3000'
      ];
      // For explicitly allowed origins, add CORS headers for authentication
      if (allowedAuthOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Sunschool-Auth,X-Sunschool-Auth-Token');
      }
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Find user by username
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Verify password
      const isPasswordValid = user.password ? await comparePasswords(password, user.password) : false;
      
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Generate JWT token
      const token = generateToken({ id: user.id, role: user.role });
      
      // Return user details and token
      const { password: _, ...userWithoutPassword } = user;
      
      return res.json({
        token,
        user: userWithoutPassword,
        domain: allowedAuthOrigins.includes(origin) && origin.includes('sunschool.xyz') ? 'sunschool.xyz' : new URL(origin || 'http://unknown').hostname
      });
    } catch (error) {
      console.error('Authentication endpoint error:', error);
      const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
      
      return res.status(500).json({ 
        error: 'An error occurred during authentication. Please try again.',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  }));

  // Registration endpoint (mirrors /register from routes.ts for /api/ prefix consistency)
  app.post("/api/register", authLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { username, email, name, role, password } = req.body;

      if (!username || !email || !name || !role || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!["ADMIN", "PARENT", "LEARNER"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const userCountResult = await db.select({ count: count() }).from(users);
      const isFirstUser = userCountResult[0].count === 0;
      const effectiveRole = isFirstUser ? "ADMIN" : role;

      const hashedPassword = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        email,
        name,
        role: effectiveRole as any,
        password: hashedPassword,
      });

      const token = generateToken({ id: newUser.id, role: newUser.role });
      const { password: _, ...userWithoutPassword } = newUser;

      return res.json({
        token,
        user: userWithoutPassword,
        wasPromotedToAdmin: isFirstUser && role !== "ADMIN",
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: "Username or email already exists" });
      }
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }));

  // Enhanced user info endpoint with cross-domain support
  app.get("/api/user", authenticateJwt, asyncHandler(async (req: AuthRequest, res: Response) => {
    const origin = req.headers.origin || '';
    const allowedAuthOrigins = [
      'https://sunschool.xyz',
      'https://www.sunschool.xyz',
      'http://localhost:5000',
      'http://localhost:3000'
    ];

    if (allowedAuthOrigins.includes(origin)) {
      // Add CORS headers for explicitly allowed origins
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Sunschool-Auth,X-Sunschool-Auth-Token');
    }
    
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      // We're not retrieving the user from database here since it's already in req.user
      // But we're removing the password field for security
      const { password: _, ...userWithoutPassword } = req.user;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error('Error retrieving user info:', error);
      return res.status(500).json({ error: 'Failed to retrieve user info' });
    }
  }));

  // Forgot password endpoint
  app.post("/api/forgot-password", authLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    // Always return the same response to avoid leaking whether the email exists
    const safeResponse = { message: "If an account exists with that email, a reset link has been sent." };

    if (!email) {
      return res.json(safeResponse);
    }

    try {
      // Look up user by email
      const result = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email));

      const user = result.length > 0 ? result[0] : null;

      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        resetTokens.set(token, { userId: user.id, expires });

        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        console.log(`[Password Reset] ${baseUrl}/auth?reset=${token}`);
      }
    } catch (error) {
      console.error('Forgot password error:', error);
    }

    return res.json(safeResponse);
  }));

  // Reset password endpoint
  app.post("/api/reset-password", authLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required." });
    }

    const entry = resetTokens.get(token);
    if (!entry) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    if (new Date() > entry.expires) {
      resetTokens.delete(token);
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    try {
      const hashedPassword = await hashPassword(newPassword);
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, entry.userId));

      resetTokens.delete(token);

      return res.json({ message: "Password updated successfully." });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ error: "Failed to reset password. Please try again." });
    }
  }));

  // Logout endpoint — JWT is stateless so this is a no-op on the server,
  // but provides a proper endpoint the client can POST to and avoids 404s.
  app.post("/api/logout", asyncHandler(async (_req: Request, res: Response) => {
    // With JWT auth the server has no session to destroy.
    // The client is responsible for clearing the stored token.
    res.json({ message: "Logged out successfully" });
  }));
}

// Temporary authentication middleware, simplified
export const isAuthenticated = async (req: any, res: Response, next: NextFunction) => {
  // Just use JWT auth
  return authenticateJwt(req, res, next);
};