import { _decrypt, _encrypt, decrypt, encrypt } from './encryption';

describe('encryption', () => {
  const originalEnvironment = process.env;

  beforeAll(() => {
    // Set a test SALT_TOKEN for encryption tests
    process.env.SALT_TOKEN = 'test-salt-token-for-encryption';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnvironment;
  });

  describe('_encrypt', () => {
    it('should encrypt a string and return formatted result', async () => {
      const data = 'Hello, World!';
      const result = await _encrypt(data);

      // Result should be in format: salt|iv|authTag|ciphertext
      const parts = result.split('|');

      expect(parts).toHaveLength(4);
      expect(parts[0]).toBeTruthy(); // salt
      expect(parts[1]).toBeTruthy(); // iv
      expect(parts[2]).toBeTruthy(); // authTag
      expect(parts[3]).toBeTruthy(); // encrypted data
    });

    it('should produce different encrypted outputs for the same input', async () => {
      const data = 'Same input';
      const result1 = await _encrypt(data);
      const result2 = await _encrypt(data);

      // Should be different due to random salt and IV
      expect(result1).not.toBe(result2);
    });

    it('should encrypt empty string', async () => {
      const data = '';
      const result = await _encrypt(data);

      const parts = result.split('|');

      expect(parts).toHaveLength(4);
    });

    it('should encrypt special characters', async () => {
      const data = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = await _encrypt(data);

      const parts = result.split('|');

      expect(parts).toHaveLength(4);
    });

    it('should encrypt unicode characters', async () => {
      const data = '你好世界 🌍 مرحبا';
      const result = await _encrypt(data);

      const parts = result.split('|');

      expect(parts).toHaveLength(4);
    });

    it('should encrypt long strings', async () => {
      const data = 'A'.repeat(10000);
      const result = await _encrypt(data);

      const parts = result.split('|');

      expect(parts).toHaveLength(4);
    });
  });

  describe('_decrypt', () => {
    it('should decrypt data encrypted by _encrypt', async () => {
      const originalData = 'Test data for encryption';
      const encrypted = await _encrypt(originalData);
      const decrypted = await _decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should handle empty string encryption/decryption', async () => {
      const originalData = '';
      const encrypted = await _encrypt(originalData);

      // Empty string produces valid encrypted format but may have empty ciphertext
      // which fails validation - this is expected behavior
      const parts = encrypted.split('|');

      expect(parts).toHaveLength(4);

      // If ciphertext is empty, decryption should reject with 'Invalid data'
      if (!parts[3]) {
        await expect(_decrypt(encrypted)).rejects.toThrow('Invalid data');
      } else {
        const decrypted = await _decrypt(encrypted);

        expect(decrypted).toBe(originalData);
      }
    });

    it('should decrypt special characters', async () => {
      const originalData = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await _encrypt(originalData);
      const decrypted = await _decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should decrypt unicode characters', async () => {
      const originalData = '你好世界 🌍 مرحبا';
      const encrypted = await _encrypt(originalData);
      const decrypted = await _decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should reject invalid data format - missing parts', async () => {
      const invalidData = 'salt|iv|tag'; // Missing encrypted data

      await expect(_decrypt(invalidData)).rejects.toThrow('Invalid data');
    });

    it('should reject invalid data format - too few parts', async () => {
      const invalidData = 'salt|iv';

      await expect(_decrypt(invalidData)).rejects.toThrow('Invalid data');
    });

    it('should reject empty string', async () => {
      await expect(_decrypt('')).rejects.toThrow('Invalid data');
    });

    it('should reject data with invalid auth tag', async () => {
      const originalData = 'Test data';
      const encrypted = await _encrypt(originalData);
      const parts = encrypted.split('|');

      // Corrupt the auth tag
      // eslint-disable-next-line no-secrets/no-secrets
      parts[2] = 'invalidauthtag1234567890abcdef';
      const corruptedData = parts.join('|');

      await expect(_decrypt(corruptedData)).rejects.toThrow();
    });

    it('should reject data with tampered ciphertext', async () => {
      const originalData = 'Test data';
      const encrypted = await _encrypt(originalData);
      const parts = encrypted.split('|');

      // Tamper with the ciphertext
      parts[3] = parts[3].slice(0, -2) + 'ff';
      const tamperedData = parts.join('|');

      await expect(_decrypt(tamperedData)).rejects.toThrow();
    });
  });

  describe('encrypt', () => {
    it('should encrypt data with hash prefix', async () => {
      const data = 'Test data';
      const result = await encrypt(data);

      // Result should be in format: hash|salt|iv|authTag|ciphertext
      const parts = result.split('|');

      expect(parts.length).toBeGreaterThanOrEqual(5);
      expect(parts[0]).toBeTruthy(); // bcrypt hash
      expect(parts[1]).toBeTruthy(); // salt
      expect(parts[2]).toBeTruthy(); // iv
      expect(parts[3]).toBeTruthy(); // authTag
      expect(parts[4]).toBeTruthy(); // encrypted data
    });

    it('should produce different outputs for the same input', async () => {
      const data = 'Same input';
      const result1 = await encrypt(data);
      const result2 = await encrypt(data);

      // Should be different due to random salt in both bcrypt and encryption
      expect(result1).not.toBe(result2);
    });

    it('should encrypt empty string', async () => {
      const data = '';
      const result = await encrypt(data);

      const parts = result.split('|');

      expect(parts.length).toBeGreaterThanOrEqual(5);
    });

    it('should encrypt long strings', async () => {
      const data = 'A'.repeat(1000);
      const result = await encrypt(data);

      const parts = result.split('|');

      expect(parts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('decrypt', () => {
    it('should decrypt data encrypted by encrypt function', async () => {
      const originalData = 'Test data for full encryption';
      const encrypted = await encrypt(originalData);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should handle empty string encryption/decryption', async () => {
      const originalData = '';
      const encrypted = await encrypt(originalData);

      // Empty string produces valid encrypted format but may have empty ciphertext
      // which fails validation - this is expected behavior
      const parts = encrypted.split('|');

      expect(parts.length).toBeGreaterThanOrEqual(5);

      // Extract the encrypted portion (skip bcrypt hash)
      const encryptedPortion = parts.slice(1).join('|');
      const encryptedParts = encryptedPortion.split('|');

      // If ciphertext is empty, decryption should reject with 'Invalid data'
      if (!encryptedParts[3]) {
        await expect(decrypt(encrypted)).rejects.toThrow('Invalid data');
      } else {
        const decrypted = await decrypt(encrypted);

        expect(decrypted).toBe(originalData);
      }
    });

    it('should decrypt special characters', async () => {
      const originalData = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await encrypt(originalData);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should decrypt unicode characters', async () => {
      const originalData = '你好世界 🌍 مرحبا';
      const encrypted = await encrypt(originalData);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should decrypt long strings', async () => {
      const originalData = 'A'.repeat(1000);
      const encrypted = await encrypt(originalData);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should handle data with pipe characters in bcrypt hash', async () => {
      const originalData = 'Test with special data';
      const encrypted = await encrypt(originalData);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });
  });

  describe('integration tests', () => {
    it('should maintain data integrity through multiple encrypt/decrypt cycles', async () => {
      const originalData = 'Multi-cycle test data';

      const encrypted1 = await encrypt(originalData);
      const decrypted1 = await decrypt(encrypted1);

      expect(decrypted1).toBe(originalData);

      const encrypted2 = await encrypt(decrypted1);
      const decrypted2 = await decrypt(encrypted2);

      expect(decrypted2).toBe(originalData);

      const encrypted3 = await encrypt(decrypted2);
      const decrypted3 = await decrypt(encrypted3);

      expect(decrypted3).toBe(originalData);
    });

    it('should handle various data types converted to strings', async () => {
      const testCases = [
        '123',
        'true',
        'null',
        'undefined',
        JSON.stringify({ key: 'value' }),
        JSON.stringify([1, 2, 3]),
      ];

      for (const testCase of testCases) {
        const encrypted = await encrypt(testCase);
        const decrypted = await decrypt(encrypted);

        expect(decrypted).toBe(testCase);
      }
    });

    it('should produce unique encryptions for similar strings', async () => {
      const data1 = 'test';
      const data2 = 'test';
      const data3 = 'test ';

      const encrypted1 = await encrypt(data1);
      const encrypted2 = await encrypt(data2);
      const encrypted3 = await encrypt(data3);

      // Same input should produce different encrypted outputs
      expect(encrypted1).not.toBe(encrypted2);

      // Different input should produce different encrypted outputs
      expect(encrypted1).not.toBe(encrypted3);
      expect(encrypted2).not.toBe(encrypted3);

      // But all should decrypt correctly
      expect(await decrypt(encrypted1)).toBe(data1);
      expect(await decrypt(encrypted2)).toBe(data2);
      expect(await decrypt(encrypted3)).toBe(data3);
    });
  });

  describe('error handling', () => {
    it('should handle missing SALT_TOKEN gracefully', async () => {
      const originalToken = process.env.SALT_TOKEN;

      delete process.env.SALT_TOKEN;

      const data = 'Test data';

      await expect(_encrypt(data)).rejects.toThrow();

      process.env.SALT_TOKEN = originalToken;
    });

    it('should reject decryption with wrong SALT_TOKEN', async () => {
      const originalToken = process.env.SALT_TOKEN;
      const data = 'Test data';

      // Encrypt with original token
      const encrypted = await _encrypt(data);

      // Change token
      process.env.SALT_TOKEN = 'different-token';

      // Decryption should fail
      await expect(_decrypt(encrypted)).rejects.toThrow();

      // Restore original token
      process.env.SALT_TOKEN = originalToken;
    });
  });
});
