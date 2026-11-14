import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, runAtomic, saveDatabase, type UserDoc } from '../config/db';
import {
  signAuthToken,
  type AuthenticatedRequest,
} from '../middleware/auth';

function sanitizeUser(user: UserDoc) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export async function registerUser(req: Request, res: Response): Promise<void> {
  try {
    const {
      name,
      email,
      password,
      department = 'Computer Science',
      semester = 'Fall 2026',
      phone = '',
    } = req.body || {};

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid university email address.',
      });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
      return;
    }

    await runAtomic(async () => {
      const db = getDb();
      const existing = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
      if (existing) {
        res.status(409).json({
          success: false,
          message: 'An account with this email address is already registered.',
        });
        return;
      }

      const studentNumbers = db.users
        .filter((u) => u.userId.startsWith('STU-'))
        .map((u) => parseInt(u.userId.replace('STU-', ''), 10))
        .filter((n) => !Number.isNaN(n));
      const nextNum = (studentNumbers.length ? Math.max(...studentNumbers) : 2000) + 1;
      const userId = `STU-${nextNum}`;

      const hashedPassword = await bcrypt.hash(String(password), 10);
      const newUser: UserDoc = {
        userId,
        name: String(name).trim(),
        role: 'student',
        email: normalizedEmail,
        password: hashedPassword,
        department: String(department).trim() || 'Computer Science',
        semester: String(semester).trim() || 'Fall 2026',
        phone: String(phone).trim(),
        createdAt: new Date().toISOString(),
      };

      db.users.push(newUser);
      saveDatabase();

      const token = signAuthToken({
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
      });

      res.status(201).json({
        success: true,
        message: 'Student registration completed successfully.',
        token,
        user: sanitizeUser(newUser),
      });
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Internal server error during registration.',
    });
  }
}

export async function loginUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required to sign in.',
      });
      return;
    }

    const db = getDb();
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.users.find(
      (u) =>
        u.email.toLowerCase() === normalizedEmail ||
        u.userId.toLowerCase() === normalizedEmail
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
      return;
    }

    if (role && role !== 'all' && user.role !== role) {
      res.status(403).json({
        success: false,
        message: `This account belongs to the ${user.role.toUpperCase()} role, not ${String(role).toUpperCase()}.`,
      });
      return;
    }

    const token = signAuthToken({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    });

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Server error during login.',
    });
  }
}

export function getCurrentUser(req: AuthenticatedRequest, res: Response): void {
  const db = getDb();
  const user = db.users.find((u) => u.userId === req.user?.userId);
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User account not found.',
    });
    return;
  }

  res.status(200).json({
    success: true,
    user: sanitizeUser(user),
    settings: db.settings,
  });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = getDb();
  const user = db.users.find((u) => u.userId === req.user?.userId);
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User account not found.',
    });
    return;
  }

  const { name, department, semester, phone, title, newPassword } = req.body || {};
  if (name && String(name).trim()) user.name = String(name).trim();
  if (department && String(department).trim()) user.department = String(department).trim();
  if (semester && String(semester).trim()) user.semester = String(semester).trim();
  if (phone !== undefined) user.phone = String(phone).trim();
  if (title !== undefined) user.title = String(title).trim();

  if (newPassword && String(newPassword).trim().length >= 6) {
    user.password = await bcrypt.hash(String(newPassword).trim(), 10);
  }

  saveDatabase();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    user: sanitizeUser(user),
  });
}

export function getDemoAccounts(_req: Request, res: Response): void {
  const db = getDb();
  const accounts = db.users.map((u) => ({
    userId: u.userId,
    name: u.name,
    role: u.role,
    email: u.email,
    department: u.department,
    semester: u.semester || 'Fall 2026',
    title: u.title || '',
    demoPassword:
      u.role === 'admin'
        ? 'admin123'
        : u.role === 'faculty'
          ? 'faculty123'
          : 'student123',
  }));

  res.status(200).json({
    success: true,
    accounts,
  });
}
