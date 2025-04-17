import { randomBytes } from 'crypto';

/**
 * Generate a unique order number
 * Format: AT{YEAR_2_LAST_DIGIT}{MONTH_numeric}{DAY_OF_MONTH}{RANDOM_SEQUENCE}
 * Example: AT25041012345
 */
export const generateOrderNumber = async (): Promise<string> => {
  const date = new Date();
  const yearLastTwoDigits = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1); // Numeric month without leading zero
  const day = String(date.getDate()).padStart(2, '0'); // Day of the month with leading zero if needed

  const datePrefix = `AT${yearLastTwoDigits}${month}${day}`;

  // Generate a random 6-character hexadecimal sequence
  const randomSequence = randomBytes(3).toString('hex').toUpperCase();

  return `${datePrefix}${randomSequence}`;
};

/**
 * Generate a secure password for order access
 * Format: 10 alphanumeric characters that are easy to read and remember
 * @returns A secure order access password
 */
export const generateOrderPassword = (): string => {
  // Use only easy-to-read characters (exclude similar looking characters like 0, O, 1, l, I)
  const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const length = 10;
  
  let password = '';
  const randomBytesBuffer = randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytesBuffer[i] % allowedChars.length;
    password += allowedChars.charAt(randomIndex);
  }
  
  return password;
};
