const express = require('express');
const router = express.Router();
const db = require('../database');

// HELPER: Verify Google reCAPTCHA v3 token
async function verifyRecaptcha(token) {
    if (!token) return false;
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        return data.success && data.score >= 0.5;
    } catch (e) {
        console.error('reCAPTCHA verify error:', e);
        return false;
    }
}

// CHECK IF STUDENT HAS PASSWORD
router.post('/check-student', async (req, res) => {
    const { admissionNumber } = req.body;
    if (!admissionNumber) return res.json({ success: false });

    try {
        const snapshot = await db.collection('users')
            .where('admission_number', '==', admissionNumber)
            .where('role', '==', 'student')
            .limit(1).get();

        if (snapshot.empty) return res.json({ success: false });

        const user = snapshot.docs[0].data();
        const hasPassword = user.password && user.password.trim() !== '';
        res.json({ success: true, hasPassword });
    } catch (err) {
        res.json({ success: false });
    }
});

// STUDENT LOGIN
router.post('/login/student', async (req, res) => {
    const { name, admissionNumber, course, password, captcha } = req.body;

    const isValidCaptcha = await verifyRecaptcha(captcha);
    if (!isValidCaptcha) {
        return res.json({ success: false, message: 'Security check failed. You appear to be a bot.' });
    }

    if (!admissionNumber) {
        return res.json({ success: false, message: 'Please provide an Application Number.' });
    }

    try {
        const snapshot = await db.collection('users')
            .where('admission_number', '==', admissionNumber)
            .where('role', '==', 'student')
            .limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: 'Invalid Application Number. Please check your details.' });
        }

        const doc = snapshot.docs[0];
        const user = doc.data();

        // If user has a password set, require password
        if (user.password && user.password.trim() !== '') {
            if (user.password !== password) {
                return res.json({ success: false, message: 'Invalid password. If you forgot your password, please contact admin.' });
            }
        }

        req.session.user = {
            id: doc.id,
            name: user.name,
            role: user.role,
            course: user.course,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'student', name: user.name });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// COHORT LEADER LOGIN
router.post('/login/cohort_leader', async (req, res) => {
    const { cohortLeaderId, password, captcha } = req.body;

    const isValidCaptcha = await verifyRecaptcha(captcha);
    if (!isValidCaptcha) {
        return res.json({ success: false, message: 'Security check failed. You appear to be a bot.' });
    }

    if (!cohortLeaderId || !password) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    try {
        const snapshot = await db.collection('users')
            .where('admission_number', '==', cohortLeaderId)
            .where('password', '==', password)
            .where('role', '==', 'cohort_leader')
            .limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: 'Invalid Cohort Leader ID or Password.' });
        }

        const doc = snapshot.docs[0];
        const user = doc.data();

        req.session.user = {
            id: doc.id,
            name: user.name,
            role: user.role,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'cohort_leader', name: user.name });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// ADMIN LOGIN
router.post('/login/admin', async (req, res) => {
    const { adminId, password, captcha } = req.body;

    const isValidCaptcha = await verifyRecaptcha(captcha);
    if (!isValidCaptcha) {
        return res.json({ success: false, message: 'Security check failed. You appear to be a bot.' });
    }

    if (!adminId || !password) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    try {
        const snapshot = await db.collection('users')
            .where('admission_number', '==', adminId)
            .where('password', '==', password)
            .where('role', '==', 'admin')
            .limit(1).get();

        if (snapshot.empty) {
            return res.json({ success: false, message: 'Invalid Admin ID or Password.' });
        }

        const doc = snapshot.docs[0];
        const user = doc.data();

        req.session.user = {
            id: doc.id,
            name: user.name,
            role: user.role,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'admin', name: user.name });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// LOGOUT
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
        res.clearCookie('__session');
        res.json({ success: true });
    });
});

// CHECK SESSION
router.get('/me', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.json({ success: false });
    }
});

// SET PASSWORD FOR STUDENT
router.post('/set-password', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
        return res.json({ success: false, message: 'Password cannot be empty.' });
    }

    try {
        await db.collection('users').doc(req.session.user.id).update({
            password: newPassword.trim()
        });
        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

module.exports = router;