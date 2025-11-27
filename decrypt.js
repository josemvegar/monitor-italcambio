// decrypt.js - Desencripta un texto con CryptoJS AES y muestra el resultado
// Requisitos: instalar la dependencia `crypto-js` en el directorio donde ejecutes este archivo

const CryptoJS = require('crypto-js');

const secretKey = 'n&Yo&Jo0C^pB6f:U#N74Hh62dkp"H}(:2rTxz@CVtn^8I@7=yF}o2/wi6!ZK?n2';
const encryptedData = 'U2FsdGVkX1/Efcc6NcZY5SIPVj3HIqSnL9sLfu0OvD/nLIANQ5TrtAss5e6IYdnlXa/gfcno546jpHub6SDc84f0uF7dL+2nFbG9ibULSUM3A2itIfluZxe1d3y/JwydXFII1+3Qojj7phPC8FARkQ==';

try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    console.log('Texto desencriptado:');
    console.log(decryptedText || '<VACÍO>');

    if (decryptedText) {
        try {
            const PostData = JSON.parse(decryptedText);
            console.log('\nPostData (JSON):');
            console.log(PostData);
        } catch (err) {
            console.log('\nEl texto desencriptado no es JSON válido.');
        }
    } else {
        console.log('Desencriptación falló o clave incorrecta');
    }
} catch (error) {
    console.error('Error durante la desencriptación:', error && error.message ? error.message : error);
}

// Fin
