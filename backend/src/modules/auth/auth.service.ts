import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { signAccessToken } from '../../utils/jwt';
import type { LoginInput } from './auth.schema';

/**
 * A bcrypt hash of a value nobody can log in with.
 *
 * When the email does not exist we still run a comparison against this hash so
 * that a wrong email and a wrong password take the same amount of time. Without
 * it, response timing reveals which company emails are real accounts.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function login({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // One message for both failure modes — never reveal whether the email exists.
  if (!user || !passwordMatches) {
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated. Contact your administrator.');
  }

  return {
    token: signAccessToken(user.id, user.role),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  if (!user) throw AppError.notFound('User not found');

  return user;
}
