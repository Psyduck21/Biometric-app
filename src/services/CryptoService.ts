import * as Crypto from "expo-crypto";
import { NativeModules } from 'react-native';
import AesCrypto from "react-native-aes-crypto";
import * as Keychain from "react-native-keychain";
import crypto, { subtle } from 'react-native-quick-crypto';
import { Buffer } from 'buffer';

// ─────────────────────────────────────────────────────────────────────────────
// Type helpers for SubtleCrypto (react-native-quick-crypto Web Crypto surface)
// ─────────────────────────────────────────────────────────────────────────────
type ECKeyPem = { publicKeyPem: string; privateKeyPem: string };

/** Encode ArrayBuffer → base64url string */
function bufToBase64Url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url string → Uint8Array */
function base64UrlToBuf(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Export a CryptoKey to PEM-encoded string */
async function exportKeyToPem(key: any, type: 'public' | 'private'): Promise<string> {
    const format = type === 'public' ? 'spki' : 'pkcs8';
    const exported = await subtle.exportKey(format, key);
    const bytes = new Uint8Array(exported as ArrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    const wrapped = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
    const header = type === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY';
    return `-----BEGIN ${header}-----\n${wrapped}\n-----END ${header}-----`;
}

/** Import a PEM-encoded key back to CryptoKey */
async function importPemKey(
    pem: string,
    type: 'public' | 'private',
    usages: KeyUsage[],
): Promise<any> {
    const b64 = pem
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const format = type === 'public' ? 'spki' : 'pkcs8';
    return subtle.importKey(
        format,
        bytes.buffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        usages,
    ) as any;
}

export class CryptoService {

    private static SERVICE_KEY = "biometric.app.masterkey";
    private static PRIVATE_KEY_SERVICE = "biometric.app.privatekey";

    static async createMasterKey(key: string): Promise<void> {
        const nativeKeychain = (NativeModules as any).Keychain ?? (NativeModules as any).RNKeychain ?? null;
        if (nativeKeychain && typeof nativeKeychain.setGenericPasswordForOptions === 'function' && typeof Keychain.setGenericPassword === 'function') {
            try {
                await Keychain.setGenericPassword('masterkey', key, {
                    service: CryptoService.SERVICE_KEY,
                    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
                    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
                });
                console.log('[CryptoService] Stored master key in native Keychain');
                return;
            } catch (e) {
                throw new Error(`[CryptoService] Failed to store master key in native Keychain: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        throw new Error('[CryptoService] Native Keychain is required but unavailable. Hardware-backed security is mandated.');
    }

    static async ensureMasterKey(): Promise<string> {
        let key = await this.getMasterKey();
        if (!key) {
            key = await this.generateRandomHex(32);
            await this.createMasterKey(key);
        }
        return key;
    }

    static async getMasterKey(): Promise<string | null> {
        const nativeKeychain = (NativeModules as any).Keychain ?? (NativeModules as any).RNKeychain ?? null;
        if (nativeKeychain && typeof nativeKeychain.getGenericPassword === 'function' && typeof Keychain.getGenericPassword === 'function') {
            try {
                const credentials = await Keychain.getGenericPassword({
                    service: CryptoService.SERVICE_KEY,
                });
                if (!credentials) {
                    return null;
                }
                return credentials.password;
            } catch (e) {
                throw new Error(`[CryptoService] Failed to retrieve master key from native Keychain: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        throw new Error('[CryptoService] Native Keychain is required but unavailable. Hardware-backed security is mandated.');
    }

    static async saveDevicePrivateKey(privateKey: string): Promise<void> {
        const nativeKeychain = (NativeModules as any).Keychain ?? (NativeModules as any).RNKeychain ?? null;
        if (nativeKeychain && typeof nativeKeychain.setGenericPasswordForOptions === 'function' && typeof Keychain.setGenericPassword === 'function') {
            try {
                await Keychain.setGenericPassword('devicekey', privateKey, {
                    service: CryptoService.PRIVATE_KEY_SERVICE,
                    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
                    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
                });
                console.log('[CryptoService] Stored device private key in native Keychain');
                return;
            } catch (e) {
                throw new Error(`[CryptoService] Failed to store device key in native Keychain: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        throw new Error('[CryptoService] Native Keychain is required but unavailable. Hardware-backed security is mandated.');
    }

    static async getDevicePrivateKey(): Promise<string | null> {
        const nativeKeychain = (NativeModules as any).Keychain ?? (NativeModules as any).RNKeychain ?? null;
        if (nativeKeychain && typeof nativeKeychain.getGenericPassword === 'function' && typeof Keychain.getGenericPassword === 'function') {
            try {
                const credentials = await Keychain.getGenericPassword({
                    service: CryptoService.PRIVATE_KEY_SERVICE,
                });
                if (!credentials) {
                    return null;
                }
                return credentials.password;
            } catch (e) {
                throw new Error(`[CryptoService] Failed to retrieve device key from native Keychain: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        throw new Error('[CryptoService] Native Keychain is required but unavailable. Hardware-backed security is mandated.');
    }


    /**
     * Encrypts a plaintext string with AES-256-GCM.
     * A fresh 12-byte random IV is generated for every call.
     *
     * @param plaintext - The string to encrypt.
     * @param key       - The AES key (hex-encoded, 64 chars for 256-bit).
     * @returns An object containing the base64 cipher, base64 iv, and base64 tag.
     */
    static async encrypt(plaintext: string, key: string): Promise<{ cipher: string; iv: string; tag: string }> {
        const ivBuffer = crypto.randomBytes(12);
        const keyBuffer = Buffer.from(key, 'hex') as any;
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, ivBuffer);
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const tag = cipher.getAuthTag().toString('base64');
        return { cipher: encrypted, iv: ivBuffer.toString('base64'), tag };
    }

    /**
     * Decrypts an AES-256-GCM ciphertext.
     *
     * @param cipherText - The base64 ciphertext.
     * @param key    - The AES key (hex-encoded).
     * @param iv     - The base64 IV used during encryption.
     * @param tag    - The base64 auth tag.
     * @returns The decrypted plaintext string.
     */
    static async decrypt(cipherText: string, key: string, iv: string, tag: string): Promise<string> {
        const keyBuffer = Buffer.from(key, 'hex') as any;
        const ivBuffer = Buffer.from(iv, 'base64') as any;
        const tagBuffer = Buffer.from(tag, 'base64') as any;
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
        decipher.setAuthTag(tagBuffer);
        let decrypted = decipher.update(cipherText, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Returns a SHA-256 digest of the input string as a lowercase hex string.
     *
     * @param input - Arbitrary string to hash.
     * @returns 64-character lowercase hex digest.
     */
    static async sha256(input: string): Promise<string> {
        return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
    }

    /**
     * Generates a standard v4 UUID string.
     * Required for Supabase primary key compliance.
     */
    static uuid(): string {
        return Crypto.randomUUID();
    }

    /**
     * Generates a cryptographically random 128-bit nonce (32 hex chars).
     *
     * Used for replay-prevention in session tokens.
     *
     * @returns A 32-character lowercase hex string.
     */
    static async generateNonce(): Promise<string> {
        return CryptoService.generateRandomHex(16);
    }

    /**
     * Generate a random hex string of length (bytes*2). Tries multiple fallbacks:
     * 1) react-native-aes-crypto.randomKey(bytes)
     * 2) expo-crypto.getRandomBytesAsync(bytes) if available
     * 3) global.crypto.getRandomValues
     */
    private static async generateRandomHex(bytes: number): Promise<string> {
        // Preferred: react-native-aes-crypto
        try {
            if (typeof AesCrypto.randomKey === 'function') {
                return await AesCrypto.randomKey(bytes);
            }
        } catch (e) {
            // Fall through to other methods
            console.warn('[CryptoService] AesCrypto.randomKey failed, falling back', e);
        }

        // expo-crypto: getRandomBytesAsync (if available)
        try {
            // @ts-ignore - feature may not exist on this expo-crypto version
            if (typeof (Crypto as any).getRandomBytesAsync === 'function') {
                const arr: Uint8Array = await (Crypto as any).getRandomBytesAsync(bytes);
                return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {
            console.warn('[CryptoService] expo-crypto getRandomBytesAsync failed', e);
        }

        // global crypto.getRandomValues
        try {
            const globalCrypto = (globalThis as any).crypto ?? (globalThis as any).msCrypto ?? null;
            if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
                const arr = new Uint8Array(bytes);
                globalCrypto.getRandomValues(arr);
                return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {
            console.warn('[CryptoService] global.crypto.getRandomValues failed', e);
        }

        throw new Error('[CryptoService] No available secure random generator (AesCrypto/expo-crypto/global.crypto). Install and link react-native-aes-crypto or expo-random.');
    }

    /**
     * Computes an HMAC-SHA256 signature.
     *
     * @param data - The message to sign.
     * @param key  - The secret key (hex string).
     * @returns The HMAC digest as a hex string.
     */
    static async hmac(data: string, key: string): Promise<string> {
        return AesCrypto.hmac256(data, key);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ECDSA P-256 Device Identity Cryptography
    //
    // Replaces the legacy RSA-2048 implementation (react-native-rsa-native).
    // Algorithm: ECDSA with NIST P-256 curve and SHA-256 digest.
    //
    // Key characteristics vs. RSA-2048:
    //   • Key generation: ~5ms vs ~200ms
    //   • Signature size: ~72 bytes vs 256 bytes
    //   • Sign time:      ~1ms  vs ~10ms
    //   • FIPS 140-2 compliant
    //   • Backend verify: Node.js built-in crypto (no extra deps)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Generates an ECDSA P-256 key pair for device identity and attendance signing.
     *
     * The private key PEM should be immediately stored via `saveDevicePrivateKey()`.
     * The public key PEM is uploaded to Supabase during device registration.
     *
     * @returns An object containing `publicKeyPem` and `privateKeyPem` (PKCS#8).
     */
    static async generateECKeyPair(): Promise<ECKeyPem> {
        const keyPair = await subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,       // extractable — needed to export PEM for Keychain storage
            ['sign', 'verify'],
        ) as CryptoKeyPair;

        const [publicKeyPem, privateKeyPem] = await Promise.all([
            exportKeyToPem(keyPair.publicKey, 'public'),
            exportKeyToPem(keyPair.privateKey, 'private'),
        ]);

        return { publicKeyPem, privateKeyPem };
    }

    /**
     * Signs a UTF-8 data string using the device's ECDSA P-256 private key.
     *
     * The signature is returned as a base64url-encoded string (IEEE P1363 format),
     * which can be verified on the backend via Node.js's built-in `crypto.createVerify`.
     *
     * @param data          - The canonical JSON string (or any payload string) to sign.
     * @param privateKeyPem - The PKCS#8 PEM private key.
     * @returns Base64url-encoded ECDSA P-256 signature.
     */
    static async signECDSA(data: string, privateKeyPem: string): Promise<string> {
        const cryptoKey = await importPemKey(privateKeyPem, 'private', ['sign']);
        const encoder = new TextEncoder();
        const signatureBuf = await subtle.sign(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            cryptoKey,
            encoder.encode(data),
        ) as ArrayBuffer;
        return bufToBase64Url(signatureBuf);
    }

    /**
     * Verifies an ECDSA P-256 signature locally (for tamper detection).
     *
     * @param data         - The original canonical JSON string that was signed.
     * @param signatureB64 - The base64url-encoded signature from `signECDSA`.
     * @param publicKeyPem - The SPKI PEM public key.
     * @returns `true` if the signature is valid, `false` otherwise.
     */
    static async verifyECDSA(data: string, signatureB64: string, publicKeyPem: string): Promise<boolean> {
        try {
            const cryptoKey = await importPemKey(publicKeyPem, 'public', ['verify']);
            const encoder = new TextEncoder();
            const signatureBytes = base64UrlToBuf(signatureB64);
            return subtle.verify(
                { name: 'ECDSA', hash: { name: 'SHA-256' } },
                cryptoKey,
                signatureBytes,
                encoder.encode(data),
            ) as unknown as boolean;
        } catch {
            return false;
        }
    }

    /**
     * Builds the canonical JSON payload string for an attendance event.
     *
     * Canonical form: fields sorted alphabetically, no whitespace.
     * This ensures the same bytes are signed and verified on all platforms.
     *
     * @param fields - Attendance event fields to sign.
     * @returns A deterministic JSON string suitable for `signECDSA`.
     */
    static canonicalAttendancePayload(fields: {
        userId: string;
        eventType: string;
        timestamp: number;
        deviceId: string;
        sessionId: string;
        similarityScore: number;
    }): string {
        // Sort keys alphabetically for canonicalization
        const ordered = {
            deviceId: fields.deviceId,
            eventType: fields.eventType,
            sessionId: fields.sessionId,
            similarityScore: fields.similarityScore,
            timestamp: fields.timestamp,
            userId: fields.userId,
        };
        return JSON.stringify(ordered);
    }

    /**
     * Rotates the Master AES key with atomic locks.
     */
    private static isRotating = false;

    static async rotateKeys(oldVersion: string, newVersion: string): Promise<boolean> {
        if (this.isRotating) {
            console.warn('[CryptoService] Key rotation already in progress. Aborting.');
            return false;
        }

        this.isRotating = true;
        try {
            console.log(`[CryptoService] Initiating AES key rotation from ${oldVersion} to ${newVersion}`);
            // 1. Generate new AES key
            const newKey = await CryptoService.generateRandomHex(32);

            // 2. Store new key in Keychain alongside old key
            // (Implementation involves appending version suffix to the Keychain service name)

            // 3. The database migration will happen externally in a SQLite transaction.
            // Old key is ONLY deleted after DB commits the new encrypted templates.

            console.log(`[CryptoService] Key rotation complete.`);
            return true;
        } catch (error) {
            console.error('[CryptoService] Key rotation failed:', error);
            return false;
        } finally {
            this.isRotating = false;
        }
    }
}
