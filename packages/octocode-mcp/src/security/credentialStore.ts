import crypto from 'crypto';

/**
 * Secure Credential Store
 *
 * Provides encrypted storage for sensitive credentials like tokens and API keys.
 * Uses AES-256-GCM encryption to protect credentials in memory and provides
 * automatic cleanup on process exit.
 *
 * This is a critical security component that prevents:
 * - Plain text credentials in memory dumps
 * - Credential theft through debugging/inspection
 * - Accidental credential exposure in logs
 */

interface StoredCredential {
  encrypted: string;
  iv: string;
  authTag: string;
  timestamp: number;
}

export class SecureCredentialStore {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits

  private static encryptionKey: Buffer | null = null;
  private static credentials = new Map<string, StoredCredential>();
  private static isInitialized = false;

  /**
   * Initialize the credential store with a derived encryption key
   */
  private static initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Derive encryption key from process entropy and environment
    this.encryptionKey = this.deriveKey();
    this.isInitialized = true;

    // Set up process exit cleanup
    this.setupCleanup();
  }

  /**
   * Derive a secure encryption key from available entropy sources
   */
  private static deriveKey(): Buffer {
    // Combine multiple entropy sources
    const entropyData = Buffer.concat([
      // Process-specific entropy
      Buffer.from(process.pid.toString()),
      Buffer.from(process.hrtime.bigint().toString()),
      Buffer.from(Date.now().toString()),

      // Environment-based entropy (if available)
      Buffer.from(process.env.USER || 'unknown'),
      Buffer.from(process.env.HOME || 'unknown'),
      Buffer.from(process.platform),

      // Random bytes as primary entropy source
      crypto.randomBytes(32),
    ]);

    // Use PBKDF2 to derive a secure key
    return crypto.pbkdf2Sync(
      entropyData,
      'octocode-mcp-credential-store', // Salt
      100000, // Iterations
      this.KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt and store a credential, returning a unique identifier
   *
   * @param credential - The credential to encrypt and store
   * @returns Unique identifier for the stored credential
   */
  public static setCredential(credential: string): string {
    this.initialize();

    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    // Generate unique identifier
    const credentialId = crypto.randomUUID();

    // Generate random IV for this encryption
    const iv = crypto.randomBytes(this.IV_LENGTH);

    // Create cipher with IV
    const cipher = crypto.createCipheriv(
      this.ALGORITHM,
      this.encryptionKey,
      iv
    );
    cipher.setAAD(Buffer.from(credentialId)); // Use ID as additional authenticated data

    // Encrypt the credential
    let encrypted = cipher.update(credential, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Store encrypted credential
    this.credentials.set(credentialId, {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      timestamp: Date.now(),
    });

    return credentialId;
  }

  /**
   * Retrieve and decrypt a credential by its identifier
   *
   * @param credentialId - Unique identifier for the credential
   * @returns Decrypted credential or null if not found/invalid
   */
  public static getCredential(credentialId: string): string | null {
    this.initialize();

    if (!this.encryptionKey) {
      return null;
    }

    const storedCredential = this.credentials.get(credentialId);
    if (!storedCredential) {
      return null;
    }

    try {
      // Recreate IV from stored hex
      const iv = Buffer.from(storedCredential.iv, 'hex');

      // Create decipher with IV
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        this.encryptionKey,
        iv
      );
      decipher.setAAD(Buffer.from(credentialId)); // Use ID as additional authenticated data
      decipher.setAuthTag(Buffer.from(storedCredential.authTag, 'hex'));

      // Decrypt the credential
      let decrypted = decipher.update(
        storedCredential.encrypted,
        'hex',
        'utf8'
      );
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      // Decryption failed - credential may be corrupted
      this.credentials.delete(credentialId);
      return null;
    }
  }

  /**
   * Remove a credential from storage
   *
   * @param credentialId - Unique identifier for the credential to remove
   * @returns true if credential was found and removed, false otherwise
   */
  public static removeCredential(credentialId: string): boolean {
    return this.credentials.delete(credentialId);
  }

  /**
   * Get the number of stored credentials
   *
   * @returns Number of credentials currently stored
   */
  public static getCredentialCount(): number {
    return this.credentials.size;
  }

  /**
   * Clear all stored credentials
   */
  public static clearAll(): void {
    this.credentials.clear();

    // Also clear the encryption key for extra security
    if (this.encryptionKey) {
      this.encryptionKey.fill(0); // Zero out the key
      this.encryptionKey = null;
    }

    this.isInitialized = false;
  }

  /**
   * Clean up old credentials (older than 24 hours)
   */
  public static cleanupOldCredentials(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [id, credential] of this.credentials.entries()) {
      if (now - credential.timestamp > maxAge) {
        this.credentials.delete(id);
      }
    }
  }

  /**
   * Set up process exit cleanup to ensure credentials are cleared
   */
  private static setupCleanup(): void {
    const cleanup = () => {
      this.clearAll();
    };

    // Handle various exit scenarios
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGUSR1', cleanup);
    process.on('SIGUSR2', cleanup);
    process.on('uncaughtException', cleanup);
    process.on('unhandledRejection', cleanup);
  }

  // Legacy token-specific methods for backward compatibility
  /**
   * Store a token securely (legacy method name for compatibility)
   *
   * @param token - The token to encrypt and store
   * @returns Unique identifier for the stored token
   */
  public static setToken(token: string): string {
    return this.setCredential(token);
  }

  /**
   * Retrieve a token by its identifier (legacy method name for compatibility)
   *
   * @param tokenId - Unique identifier for the token
   * @returns Decrypted token or null if not found/invalid
   */
  public static getToken(tokenId: string): string | null {
    return this.getCredential(tokenId);
  }
}
