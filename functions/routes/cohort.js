const express = require('express');
const router = express.Router();
const db = require('../database');

function isCohortLeader(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'cohort_leader') {
        return res.json({ success: false, message: 'Access denied.' });
    }
    next();
}

// Get Cohort Leader info
router.get('/me', isCohortLeader, (req, res) => {
    res.json({ success: true, user: req.session.user });
});

// Get assigned students
router.get('/students', isCohortLeader, async (req, res) => {
    const cohortLeaderId = req.session.user.id;

    try {
        const snapshot = await db.collection('users')
            .where('role', '==', 'student')
            .where('cohort_leader_id', '==', cohortLeaderId)
            .get();

        const students = snapshot.docs.map(doc => {
            const u = doc.data();
            const sd = u.details || {};
            const v = u.verification || {};
            const a = u.approvals || {};
            const withdrawals = u.withdrawals || [];
            const latestWithdrawal = withdrawals.length > 0 ? withdrawals[withdrawals.length - 1] : {};

            return {
                id: doc.id,
                name: u.name,
                admission_number: u.admission_number,
                course: u.course,
                gender: sd.gender,
                phone: sd.phone,
                form_status: sd.status,
                printouts_taken: sd.printouts_taken || 0,
                verification_status: v.status,
                cohort_approval: a.cohort_approval,
                admin_approval: a.admin_approval,
                final_approval: a.final_approval,
                withdrawal_status: latestWithdrawal.status || null,
                doc_count: (u.documents || []).length,
                undertaking_done: (u.undertakings && Object.keys(u.undertakings).length > 0) ? 1 : 0
            };
        });

        res.json({ success: true, students });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Get single student details
router.get('/student/:id', isCohortLeader, async (req, res) => {
    const studentId = req.params.id;
    const cohortLeaderId = req.session.user.id;

    try {
        const doc = await db.collection('users').doc(studentId).get();
        if (!doc.exists) return res.json({ success: false, message: 'Student not found.' });

        const u = doc.data();
        if (u.cohort_leader_id !== cohortLeaderId) {
            return res.json({ success: false, message: 'Student not found.' });
        }

        const sd = u.details || {};
        const a = u.approvals || {};
        const withdrawals = u.withdrawals || [];
        const latestWithdrawal = withdrawals.length > 0 ? withdrawals[withdrawals.length - 1] : {};

        res.json({
            success: true,
            student: {
                id: doc.id,
                name: u.name,
                admission_number: u.admission_number,
                course: u.course,
                date_of_birth: sd.date_of_birth,
                gender: sd.gender,
                category: sd.category,
                phone: sd.phone,
                address: sd.address,
                previous_qualification: sd.previous_qualification,
                father_name: sd.father_name,
                mother_name: sd.mother_name,
                form_status: sd.status,
                avail_hostel: sd.avail_hostel,
                cohort_approval: a.cohort_approval,
                final_approval: a.final_approval,
                cohort_comments: a.cohort_comments,
                withdrawal_status: latestWithdrawal.status || null,
                withdrawal_reason: latestWithdrawal.reason || null,
                withdrawal_remarks: latestWithdrawal.remarks || null
            }
        });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Approve or reject student
router.post('/approve/:id', isCohortLeader, (req, res) => {
    res.json({ success: false, message: 'Approval feature has been removed. Profile locks auto-complete registration.' });
});

// Unlock student profile
router.post('/unlock/:id', isCohortLeader, async (req, res) => {
    const studentId = req.params.id;
    const cohortLeaderId = req.session.user.id;

    try {
        const doc = await db.collection('users').doc(studentId).get();
        if (!doc.exists || doc.data().cohort_leader_id !== cohortLeaderId) {
            return res.json({ success: false, message: 'Access denied.' });
        }

        await db.collection('users').doc(studentId).update({
            'details.status': 'draft',
            'approvals.cohort_approval': null,
            'approvals.cohort_comments': null,
            'approvals.admin_approval': null,
            'approvals.final_approval': null,
            'approvals.registration_number': null
        });

        res.json({ success: true, message: 'Student profile unlocked successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Approve or reject student withdrawal
router.post('/withdrawal/:studentId', isCohortLeader, async (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
        return res.json({ success: false, message: 'Invalid decision status.' });
    }

    try {
        const docRef = db.collection('users').doc(studentId);
        const doc = await docRef.get();
        
        if (!doc.exists || doc.data().cohort_leader_id !== cohortLeaderId) {
            return res.json({ success: false, message: 'Access denied.' });
        }

        const withdrawals = doc.data().withdrawals || [];
        if (withdrawals.length > 0) {
            withdrawals[withdrawals.length - 1].status = status;
            await docRef.update({ withdrawals });
        }

        res.json({ success: true, message: `Withdrawal request ${status} successfully!` });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// GET MESSAGES FOR A STUDENT
router.get('/messages/:studentId', isCohortLeader, async (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;

    try {
        const doc = await db.collection('users').doc(studentId).get();
        if (!doc.exists || doc.data().cohort_leader_id !== cohortLeaderId) {
            return res.json({ success: false, message: 'Access denied.' });
        }

        const snapshot = await db.collection('messages')
            .where('student_id', '==', studentId)
            .where('cohort_leader_id', '==', cohortLeaderId)
            .orderBy('created_at', 'asc')
            .get();

        const messages = [];
        for (let mDoc of snapshot.docs) {
            const m = mDoc.data();
            const senderDoc = await db.collection('users').doc(m.sender_id).get();
            const sender = senderDoc.data() || {};
            messages.push({
                id: mDoc.id,
                ...m,
                sender_name: sender.name,
                sender_role: sender.role
            });
        }

        res.json({ success: true, messages });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// SEND MESSAGE TO A STUDENT
router.post('/message/:studentId', isCohortLeader, async (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;
    const { message_text } = req.body;

    if (!message_text || !message_text.trim()) {
        return res.json({ success: false, message: 'Message text cannot be empty.' });
    }

    try {
        const doc = await db.collection('users').doc(studentId).get();
        if (!doc.exists || doc.data().cohort_leader_id !== cohortLeaderId) {
            return res.json({ success: false, message: 'Access denied.' });
        }

        await db.collection('messages').add({
            student_id: studentId,
            cohort_leader_id: cohortLeaderId,
            sender_id: cohortLeaderId,
            message_text: message_text,
            created_at: new Date().toISOString()
        });

        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

module.exports = router;