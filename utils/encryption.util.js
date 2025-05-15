const crypto = require('crypto');

/**
 * Encryption and decryption utility functions
 * These functions match the implementation from the original application for compatibility
 */

// Get the encryption key from environment variables
const encryptionKey = process.env.ENC_KEY || 'a!b@c#de%f^g*h(i)j-k+l{m}n[o]p;q:r,stuvwxyz1234567890';

/**
 * Encrypts a string using the specified key
 * @param {string} string - The string to encrypt
 * @param {string} key - The encryption key (defaults to environment variable)
 * @returns {string} - The encrypted string in base64 format
 */
const encrypt = (string, key = encryptionKey) => {
    let result = '';
    for (let i = 0; i < string.length; i++) {
        const char = string.charCodeAt(i);
        // Adjust the key index calculation to match the original implementation
        const keyIndex = (i % key.length) - 1;
        const keyChar = key.charCodeAt(keyIndex < 0 ? key.length - 1 : keyIndex);
        const encryptedChar = String.fromCharCode(char + keyChar);
        result += encryptedChar;
    }
    return Buffer.from(result).toString('base64'); // base64 encode in Node.js
};

/**
 * Decrypts a string using the specified key
 * @param {string} string - The encrypted string in base64 format
 * @param {string} key - The encryption key (defaults to environment variable)
 * @returns {string} - The decrypted string
 */
const decrypt = (string, key = encryptionKey) => {

    let result = '';
    // Decode the base64 encoded string
    const decodedString = Buffer.from(string, 'base64').toString();

    for (let i = 0; i < decodedString.length; i++) {
        const char = decodedString.charCodeAt(i);
        // Adjust the key index calculation to match the original implementation
        const keyIndex = (i % key.length) - 1;
        const keyChar = key.charCodeAt(keyIndex < 0 ? key.length - 1 : keyIndex);
        const decryptedChar = String.fromCharCode(char - keyChar);
        result += decryptedChar;
    }

    return result;
};

module.exports = {
    encrypt,
    decrypt
}; 