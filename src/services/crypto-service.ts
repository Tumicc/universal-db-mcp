import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const CIPHER_VERSION = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = 'universal-db-mcp:master-key:v1';

export class MissingMasterKeyError extends Error {
  constructor() {
    super('缺少主密钥：请设置环境变量 UNIVERSAL_DB_MASTER_KEY 后再保存或读取已保存连接');
    this.name = 'MissingMasterKeyError';
  }
}

export class CryptoService {
  private readonly masterKey?: string;

  constructor(masterKey?: string) {
    this.masterKey = masterKey;
  }

  private getDerivedKey(): Buffer {
    if (!this.masterKey) {
      throw new MissingMasterKeyError();
    }
    return scryptSync(this.masterKey, KEY_SALT, 32);
  }

  encrypt(plainText: string): string {
    const key = this.getDerivedKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      CIPHER_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(cipherText: string): string {
    const parts = cipherText.split('.');
    if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
      throw new Error('无效的密文格式，无法解密保存连接');
    }

    const key = this.getDerivedKey();
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');

    const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}

