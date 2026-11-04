import Admin from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';

export const loginService = async (email: string, password: string) => {
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin) {
    throw new Error('Invalid credentials');
  }

  if (!admin.isActive) {
    throw new Error('Account is inactive');
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password);

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  admin.lastLogin = new Date();
  await admin.save();

  const tokenPayload = {
    id: admin._id.toString(),
    email: admin.email,
    role: admin.role,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    admin: {
      id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role,
    },
    accessToken,
    refreshToken,
  };
};
