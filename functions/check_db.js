const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'sahayak-portal' });
const db = admin.firestore();

async function check() {
    console.log("Fetching users...");
    const snapshot = await db.collection('users').get();
    if (snapshot.empty) {
        console.log("Users collection is empty!");
    }
    snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data());
    });
}

check().catch(console.error);
