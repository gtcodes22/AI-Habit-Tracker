import crypto from "node:crypto";

// Encrypts/decrypts per-user secrets (bring-your-own API keys) at rest.
// AES-256-GCM: a random IV per encryption, and an auth tag that makes the
// ciphertext tamper-evident (decryption fails loudly if it's altered).
//
// ENCRYPTION_KEY must be 32 bytes, given as a 64-character hex string —
// generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Losing this key makes every stored API key unrecoverable; rotating it
// requires re-entering all saved keys.

const ALGORITHM = "aes-256-gcm";

const getKey = () => {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) {
        throw new Error(
            "ENCRYPTION_KEY is not set — required to store API keys. " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    const key = Buffer.from(hex, "hex");
    if (key.length !== 32) {
        throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    return key;
};

// Returns "iv:authTag:ciphertext", each hex-encoded.
export const encrypt = (plaintext) => {
    const key = getKey();
    const iv = crypto.randomBytes(12); // 96-bit IV, the GCM-recommended size
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
};

export const decrypt = (encrypted) => {
    const key = getKey();
    const [ivHex, authTagHex, ciphertextHex] = String(encrypted).split(":");
    if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error("Malformed encrypted value");
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, "hex")),
        decipher.final(),
    ]);
    return plaintext.toString("utf8");
};

// True if ENCRYPTION_KEY is configured — lets callers fail with a clear
// message ("ask the app owner to set ENCRYPTION_KEY") instead of a raw
// crypto error when someone tries to save a key before it's set up.
export const encryptionConfigured = () => {
    try {
        getKey();
        return true;
    } catch {
        return false;
    }
};
