const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Busboy = require('busboy');

// Middleware to check login
function isLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.json({ success: false, message: 'Please login first.' });
    }
    next();
}

// Custom middleware to handle multiple file uploads with Busboy for Firebase Cloud Functions
const uploadMultipleDocuments = (req, res, next) => {
    if (req.method !== 'POST') return next();
    
    const busboy = Busboy({ headers: req.headers });
    req.files = {};
    let promises = [];
    
    busboy.on('file', (fieldname, file, info) => {
        const { filename } = info;
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const savedFilename = unique + path.extname(filename);
        const filePath = path.join(os.tmpdir(), savedFilename);
        
        const writeStream = fs.createWriteStream(filePath);
        file.pipe(writeStream);
        
        if (!req.files[fieldname]) {
            req.files[fieldname] = [];
        }
        req.files[fieldname].push({ 
            originalname: filename, 
            filename: savedFilename,
            path: filePath
        });
        
        const promise = new Promise((resolve) => {
            writeStream.on('close', resolve);
        });
        promises.push(promise);
    });

    busboy.on('finish', async () => {
        await Promise.all(promises);
        next();
    });
    
    if (req.rawBody) {
        busboy.end(req.rawBody);
    } else {
        req.pipe(busboy);
    }
};

// SAVE REGISTRATION DETAILS
router.post('/registration', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    const data = req.body;
    const fullName = [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ');

    if (req.session.user) {
        req.session.user.name = fullName;
    }

    try {
        const updatePayload = {
            name: fullName,
            details: data
        };

        if (data.status === 'submitted') {
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.data() || {};
            if (!userData.approvals) {
                updatePayload.approvals = {
                    cohort_approval: 'approved',
                    admin_approval: 'approved',
                    final_approval: 'approved',
                    registration_number: req.session.user.admissionNumber
                };
            } else {
                updatePayload.approvals = {
                    ...userData.approvals,
                    cohort_approval: 'approved',
                    admin_approval: 'approved',
                    final_approval: 'approved',
                    registration_number: req.session.user.admissionNumber
                };
            }
        }

        await db.collection('users').doc(userId).set(updatePayload, { merge: true });

        if (data.status === 'submitted') {
            res.json({ success: true, message: 'Registration submitted!' });
        } else {
            res.json({ success: true, message: 'Draft saved!' });
        }
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Database error.' });
    }
});

// GET REGISTRATION DETAILS
router.get('/registration', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return res.json({ success: false, message: 'User not found.' });
        
        const userData = userDoc.data();
        const responseData = {
            name: userData.name,
            admission_number: userData.admission_number,
            course: userData.course,
            role: userData.role,
            ...(userData.details || {})
        };
        res.json({ success: true, data: responseData });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// SAVE UNDERTAKINGS
router.post('/undertakings', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    const { antiRagging, codeOfConduct, feePolicy } = req.body;

    try {
        await db.collection('users').doc(userId).set({
            undertakings: {
                anti_ragging: antiRagging,
                code_of_conduct: codeOfConduct,
                fee_policy: feePolicy,
                ip_address: req.ip
            }
        }, { merge: true });
        res.json({ success: true, message: 'Undertakings saved successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// UPLOAD DOCUMENTS
router.post('/documents', isLoggedIn, uploadMultipleDocuments, async (req, res) => {
    const userId = req.session.user.id;
    const files = req.files;

    if (!files || Object.keys(files).length === 0) {
        return res.json({ success: false, message: 'No files uploaded.' });
    }

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        let docs = userData.documents || [];

        Object.keys(files).forEach(fieldName => {
            const file = files[fieldName][0];
            docs.push({
                document_type: fieldName,
                file_name: file.originalname,
                file_path: file.filename
            });
        });

        await db.collection('users').doc(userId).set({ documents: docs }, { merge: true });
        res.json({ success: true, message: 'Documents uploaded successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// SUBMIT WITHDRAWAL
router.post('/withdrawal', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    const { reason, remarks } = req.body;

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        let withdrawals = userDoc.data().withdrawals || [];
        withdrawals.push({ reason, remarks, created_at: new Date().toISOString() });

        await db.collection('users').doc(userId).set({ withdrawals }, { merge: true });
        res.json({ success: true, message: 'Withdrawal application submitted.' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// SAVE PRINTOUTS STATUS
router.put('/printouts', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    const { printouts_taken } = req.body;
    
    try {
        await db.collection('users').doc(userId).set({
            details: { printouts_taken: printouts_taken ? 1 : 0 }
        }, { merge: true });
        res.json({ success: true, message: 'Printouts status updated.' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// GET APPROVAL STATUS
router.get('/status', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return res.json({ success: false, message: 'User not found.' });

        const u = userDoc.data();
        const details = u.details || {};
        const approvals = u.approvals || {};
        const verification = u.verification || {};
        const docs = u.documents || [];
        const undertakings = u.undertakings || {};

        res.json({ success: true, data: {
            form_status: details.status || null,
            printouts_taken: details.printouts_taken || 0,
            cohort_approval: approvals.cohort_approval || null,
            cohort_comments: approvals.cohort_comments || null,
            admin_approval: approvals.admin_approval || null,
            final_approval: approvals.final_approval || null,
            registration_number: approvals.registration_number || null,
            verification_status: verification.status || null,
            doc_count: docs.length,
            undertaking_done: Object.keys(undertakings).length > 0 ? 1 : 0
        }});
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// REQUEST PROFILE UNLOCK
router.post('/request-unlock', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const u = userDoc.data();
        
        if (!u.details || u.details.status !== 'submitted') {
            return res.json({ success: false, message: 'Profile is not locked.' });
        }

        await db.collection('users').doc(userId).set({
            approvals: { cohort_approval: 'edit_requested' }
        }, { merge: true });

        res.json({ success: true, message: 'Profile unlock request sent to Cohort Leader.' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// GET MESSAGES
router.get('/messages', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const u = userDoc.data();
        const cohortLeaderId = u.cohort_leader_id;
        
        if (!cohortLeaderId) {
            return res.json({ success: true, messages: [] });
        }
        
        const snapshot = await db.collection('messages')
            .where('student_id', '==', userId)
            .where('cohort_leader_id', '==', cohortLeaderId)
            .orderBy('created_at', 'asc')
            .get();
            
        const messages = [];
        for (let doc of snapshot.docs) {
            const m = doc.data();
            const senderDoc = await db.collection('users').doc(m.sender_id).get();
            const sender = senderDoc.data() || {};
            messages.push({
                id: doc.id,
                ...m,
                sender_name: sender.name,
                sender_role: sender.role
            });
        }
        
        res.json({ success: true, messages });
    } catch (err) {
        console.error('Error fetching student messages:', err);
        res.json({ success: false, message: 'Database error: ' + err.message });
    }
});

// SEND MESSAGE
router.post('/message', isLoggedIn, async (req, res) => {
    const userId = req.session.user.id;
    const { message_text } = req.body;

    if (!message_text || !message_text.trim()) {
        return res.json({ success: false, message: 'Message text cannot be empty.' });
    }

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const cohortLeaderId = userDoc.data().cohort_leader_id;

        if (!cohortLeaderId) {
            return res.json({ success: false, message: 'You cannot send a message because no Cohort Leader is currently assigned to you.' });
        }

        await db.collection('messages').add({
            student_id: userId,
            cohort_leader_id: cohortLeaderId,
            sender_id: userId,
            message_text: message_text,
            created_at: new Date().toISOString()
        });

        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

module.exports = router;

