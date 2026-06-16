const admin = require('firebase-admin');

// Initialize Firebase Admin (automatically uses default credentials in Cloud Functions)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Optional: Set settings if needed
db.settings({ ignoreUndefinedProperties: true });

console.log('Firestore initialized successfully!');

module.exports = db;