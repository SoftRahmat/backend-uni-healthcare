import bcrypt from "bcryptjs";

import { env } from "../config/env.js";

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, env.BCRYPT_ROUNDS);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const isPasswordReused = async (password: string, hashes: string[]): Promise<boolean> => {
  for (const hash of hashes) {
    if (await verifyPassword(password, hash)) return true;
  }
  return false;
};
