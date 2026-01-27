import { hash } from 'bcrypt';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomFill,
  scrypt,
} from 'crypto';

export const _encrypt = async (data: string): Promise<string> => {
  const algorithm = 'aes-256-gcm'; // Changed to GCM for authenticated encryption
  const salt = randomBytes(8).toString('hex');

  return new Promise((resolve, reject) => {
    scrypt(process.env.SALT_TOKEN, salt, 32, (error, key) => {
      if (error) {
        reject(error);

        return;
      }

      randomFill(new Uint8Array(16), (error, iv) => {
        if (error) {
          reject(error);

          return;
        }

        const cipher = createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(data, 'utf8', 'hex');

        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');
        const ivHex = Buffer.from(iv).toString('hex');

        // Format: salt|iv|authTag|ciphertext
        const result = `${salt}|${ivHex}|${authTag}|${encrypted}`;

        resolve(result);
      });
    });
  });
};

export const _decrypt = async (encryptedData: string): Promise<string> => {
  const algorithm = 'aes-256-gcm';

  return new Promise((resolve, reject) => {
    const [salt, ivHex, tagHex, encrypted] = encryptedData.split('|');

    if (!salt || !ivHex || !tagHex || !encrypted) {
      reject(new Error('Invalid data'));

      return;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    scrypt(process.env.SALT_TOKEN, salt, 32, (error, key) => {
      if (error) {
        reject(error);

        return;
      }

      try {
        const decipher = createDecipheriv(algorithm, key, iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');

        decrypted += decipher.final('utf8');

        resolve(decrypted);
      } catch (error_) {
        reject(
          error_ instanceof Error
            ? error_
            : new Error('Decryption failed with unknown error'),
        );
      }
    });
  });
};

export const encrypt = async (data: string) => {
  const encrypted = await _encrypt(data);
  const saltOrRounds = 10;
  const hashed = await hash(data, saltOrRounds);

  return `${hashed}|${encrypted}`;
};

export const decrypt = async (data: string) => {
  const parts = data.split('|');
  const encrypted = parts.slice(1).join('|');

  try {
    return await _decrypt(encrypted);
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
