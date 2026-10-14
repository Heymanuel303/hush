import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.js';
import type { AppConfig } from '../config/config.js';

/**
 * AES-256-GCM for secrets at rest (the Pi-hole app password). Format
 * `v1:<iv>:<tag>:<ciphertext>`, each part base64. Decryption throws on any tampering.
 */
@Injectable()
export class SecretsService {
  constructor(@Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'encryptionKey'>) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64'));
    return `v1:${parts.join(':')}`;
  }

  decrypt(payload: string): string {
    const [version, iv, tag, body, ...rest] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || body === undefined || rest.length > 0) {
      throw new Error('Unsupported secret format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.config.encryptionKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  }
}
