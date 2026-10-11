import bcrypt from "bcrypt";

const salt = 10;

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, salt);
};

export const verifyPassword = (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
