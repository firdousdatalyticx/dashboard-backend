const bcrypt = require('bcrypt');
/**
 * Hash a password using bcrypt
 * @param {string} password - The plain text password
 * @returns {Promise<string>} - The hashed password
 */
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};


function encrypt(string, key) {
    let result = ''
    for (let i = 0; i < string.length; i++) {
        const char = string.charCodeAt(i)
        // Adjust the key index calculation to match PHP's logic
        const keyIndex = (i % key.length) - 1
        const keychar = key.charCodeAt(keyIndex < 0 ? key.length - 1 : keyIndex)
        const encryptedChar = String.fromCharCode(char + keychar)
        result += encryptedChar
    }
    return btoa(result) // base64 encode
}


module.exports = {
    hashPassword,
    encrypt
};  