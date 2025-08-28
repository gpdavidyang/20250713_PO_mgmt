import { Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import { comparePasswords, generateSessionId } from "./auth-utils";
import { User as BaseUser } from "@shared/schema";
import { logAuditEvent } from "./middleware/audit-logger";

// Extend User type to ensure id field is available
interface User extends BaseUser {
  id: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface AuthSession extends session.Session {
  userId?: string;
}

/**
 * Login endpoint for local authentication
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password, username } = req.body;
    const loginIdentifier = email || username;

    // Comprehensive logging for Vercel debugging
    console.log("=== LOGIN REQUEST START ===");
    console.log("🔐 Attempting login with identifier:", loginIdentifier);
    console.log("📍 Environment:", {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
      DATABASE_URL_SET: !!process.env.DATABASE_URL
    });
    console.log("🍪 Request headers:", {
      cookie: req.headers.cookie,
      origin: req.headers.origin,
      host: req.headers.host
    });
    console.log("📊 Session info BEFORE login:", {
      sessionExists: !!req.session,
      sessionID: req.sessionID,
      sessionCookie: req.session?.cookie,
      sessionData: req.session
    });

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    // 🔴 SECURITY FIX: Use real database authentication instead of mock users
    console.log("🔐 Starting authentication process...");
    
    // Declare user variable at function scope to avoid reference errors
    let user: User | undefined;
    
    try {
      // Find user in database by email (most common login method)
      user = await storage.getUserByEmail(loginIdentifier);
      
      // Admin fallback: if user not found in database, provide admin@company.com access
      if (!user && loginIdentifier === 'admin@company.com') {
        console.log("🔧 Admin fallback: Using hardcoded admin user");
        user = {
          id: 'dev_admin',
          email: 'admin@company.com',
          name: 'Dev Administrator', 
          password: '$2b$10$RbLrxzWq3TQEx6UTrnRwCeWwOai9N0QzdeJxg8iUp71jGS8kKgwjC', // admin123
          role: 'admin' as const,
          phoneNumber: null,
          profileImageUrl: null,
          position: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      if (!user) {
        console.log("❌ User not found in database:", loginIdentifier);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        console.log("❌ User account deactivated:", loginIdentifier);
        return res.status(401).json({ message: "Account is deactivated" });
      }

      // Verify password using proper password comparison
      const isValidPassword = await comparePasswords(password, user.password);
      if (!isValidPassword) {
        console.log("❌ Invalid password for user:", loginIdentifier);
        
        // Log failed login attempt
        await logAuditEvent('login_failed', 'auth', {
          userName: loginIdentifier,
          action: 'Failed login attempt',
          additionalDetails: { reason: 'Invalid password' },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          sessionId: req.sessionID
        });
        
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log("✅ Database authentication successful for user:", user.name || user.email);
      
      // Log successful login
      await logAuditEvent('login', 'auth', {
        userId: user.id,
        userName: user.name || user.email,
        userRole: user.role,
        action: 'User logged in',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        sessionId: req.sessionID
      });
    } catch (dbError) {
      console.error("🔴 Database authentication error:", dbError);
      return res.status(500).json({ message: "Authentication failed - database error" });
    }

    try {
      // Create session
      const authSession = req.session as AuthSession;
      authSession.userId = user.id;
      
      console.log("🔧 Session before save:", {
        sessionId: req.sessionID,
        userId: authSession.userId,
        sessionExists: !!req.session,
        sessionData: req.session
      });

      // Save session with timeout and fallback
      const sessionSavePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log("⚠️ Session save timeout, proceeding without session persistence");
          resolve();
        }, 2000); // 2 second timeout

        req.session.save((err) => {
          clearTimeout(timeout);
          if (err) {
            console.error("❌ Session save error:", err);
            resolve(); // Don't fail login due to session issues
          } else {
            console.log("✅ Session saved successfully for user:", user.id);
            console.log("🔧 Session after save:", {
              sessionId: req.sessionID,
              userId: authSession.userId,
              sessionExists: !!req.session,
              sessionData: req.session
            });
            resolve();
          }
        });
      });

      await sessionSavePromise;
      
      // Log final session state
      console.log("📊 Session info AFTER save:", {
        sessionExists: !!req.session,
        sessionID: req.sessionID,
        sessionUserId: (req.session as AuthSession)?.userId,
        sessionCookie: req.session?.cookie
      });
      console.log("=== LOGIN REQUEST END - SUCCESS ===");
      
      // Return user data (exclude password)
      const { password: _, ...userWithoutPassword } = user;
      res.json({ 
        message: "Login successful", 
        user: userWithoutPassword 
      });
    } catch (sessionError) {
      console.error("Session handling error (non-fatal):", sessionError);
      
      // Still return success even if session fails
      const { password: _, ...userWithoutPassword } = user;
      res.json({ 
        message: "Login successful (no session)", 
        user: userWithoutPassword 
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
}

/**
 * Logout endpoint
 */
export async function logout(req: Request, res: Response) {
  const authSession = req.session as AuthSession;
  const userId = authSession.userId;
  
  // Log logout event before destroying session
  if (userId) {
    try {
      const user = await storage.getUser(userId);
      await logAuditEvent('logout', 'auth', {
        userId: userId,
        userName: user?.name || user?.email,
        userRole: user?.role,
        action: 'User logged out',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        sessionId: req.sessionID
      });
    } catch (error) {
      console.error("Failed to log logout event:", error);
    }
  }
  
  authSession.userId = undefined;
  
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }
    res.json({ message: "Logout successful" });
  });
}

/**
 * Get current user endpoint
 */
export async function getCurrentUser(req: Request, res: Response) {
  try {
    console.log("=== GET CURRENT USER START ===");
    const authSession = req.session as AuthSession;
    console.log("🔍 getCurrentUser - Session ID:", req.sessionID);
    console.log("🔍 getCurrentUser - Session userId:", authSession?.userId);
    console.log("🔍 getCurrentUser - Session exists:", !!req.session);
    console.log("🔍 getCurrentUser - Session data:", req.session);
    console.log("🔍 getCurrentUser - Cookie header:", req.headers.cookie);
    console.log("🔍 getCurrentUser - Environment:", {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
      DATABASE_URL_SET: !!process.env.DATABASE_URL
    });
    
    // 🔴 SECURITY FIX: Always require proper authentication
    if (!authSession.userId) {
      console.log("🔴 getCurrentUser - No userId in session");
      return res.status(401).json({ 
        message: "Not authenticated",
        authenticated: false 
      });
    }

    try {
      // Use real database user lookup instead of mock users
      let user = await storage.getUser(authSession.userId);
      
      // Admin fallback: handle dev_admin user in all environments
      if (!user && authSession.userId === 'dev_admin') {
        console.log("🔧 getCurrentUser - Admin fallback: Using hardcoded admin user");
        user = {
          id: 'dev_admin',
          email: 'admin@company.com',
          name: 'Dev Administrator', 
          password: '$2b$10$RbLrxzWq3TQEx6UTrnRwCeWwOai9N0QzdeJxg8iUp71jGS8kKgwjC', // admin123
          role: 'admin' as const,
          phoneNumber: null,
          profileImageUrl: null,
          position: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      if (!user) {
        console.log("🔴 getCurrentUser - Database user not found:", authSession.userId);
        // Clear invalid session
        authSession.userId = undefined;
        return res.status(401).json({ 
          message: "Invalid session - user not found",
          authenticated: false
        });
      }

      if (!user.isActive) {
        console.log("🔴 getCurrentUser - User account deactivated:", user.email);
        authSession.userId = undefined;
        return res.status(401).json({ 
          message: "Account is deactivated",
          authenticated: false
        });
      }

      console.log("🟢 getCurrentUser - Database user found:", user.name || user.email);
      
      // Set user on request for compatibility
      req.user = user as User;

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        authenticated: true
      });
    } catch (dbError) {
      console.error("🔴 Database error in getCurrentUser:", dbError);
      // Clear session on database errors
      authSession.userId = undefined;
      return res.status(401).json({ 
        message: "Authentication failed - database error",
        authenticated: false
      });
    }
  } catch (error) {
    console.error("🔴 Get current user error:", error);
    res.status(500).json({ 
      message: "Failed to get user data",
      authenticated: false
    });
  }
}

/**
 * Authentication middleware
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // SECURITY FIX: Removed development authentication bypass
    // This was a critical security vulnerability that allowed automatic login
    
    const authSession = req.session as AuthSession;
    
    if (!authSession.userId) {
      console.log('🔴 인증 실패 - userId 없음');
      return res.status(401).json({ message: "Authentication required" });
    }

    // Get user from database - Mock 데이터 완전 제거
    let user = await storage.getUser(authSession.userId);
    
    // Admin fallback: handle dev_admin user in all environments
    if (!user && authSession.userId === 'dev_admin') {
      console.log("🔧 Admin fallback: Using hardcoded dev_admin user in requireAuth");
      user = {
        id: 'dev_admin',
        email: 'admin@company.com',
        name: 'Dev Administrator',
        password: '$2b$10$RbLrxzWq3TQEx6UTrnRwCeWwOai9N0QzdeJxg8iUp71jGS8kKgwjC', // admin123
        role: 'admin' as const,
        phoneNumber: null,
        profileImageUrl: null,
        position: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    if (!user) {
      // Clear invalid session
      authSession.userId = undefined;
      console.log('🔴 인증 실패 - 사용자 없음:', authSession.userId);
      return res.status(401).json({ message: "Invalid session" });
    }

    req.user = user;
    console.log('🟢 인증 성공:', req.user.id);
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({ message: "Authentication failed" });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole(["admin"]);

/**
 * Admin or order manager middleware
 */
export const requireOrderManager = requireRole(["admin", "order_manager"]);