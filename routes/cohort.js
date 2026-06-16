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
router.get('/students', isCohortLeader, (req, res) => {
    const cohortLeaderId = req.session.user.id;

    const query = `
        SELECT u.id, u.name, u.admission_number, u.course,
               sd.gender, sd.phone, sd.status as form_status, sd.printouts_taken,
               v.status as verification_status,
               a.cohort_approval, a.admin_approval, a.final_approval,
               w.status as withdrawal_status,
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) as doc_count,
               (SELECT COUNT(*) FROM undertakings ut WHERE ut.user_id = u.id) as undertaking_done
        FROM users u
        LEFT JOIN student_details sd ON u.id = sd.user_id
        LEFT JOIN verification v ON u.id = v.user_id
        LEFT JOIN approvals a ON u.id = a.user_id
        LEFT JOIN (
            SELECT w1.user_id, w1.status
            FROM withdrawals w1
            INNER JOIN (
                SELECT user_id, MAX(id) as max_id
                FROM withdrawals
                GROUP BY user_id
            ) w2 ON w1.id = w2.max_id
        ) w ON u.id = w.user_id
        WHERE u.cohort_leader_id = ? AND u.role = 'student'
    `;

    db.query(query, [cohortLeaderId], (err, results) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, students: results });
    });
});

// Get single student details
router.get('/student/:id', isCohortLeader, (req, res) => {
    const studentId = req.params.id;
    const cohortLeaderId = req.session.user.id;

    const query = `
        SELECT u.id, u.name, u.admission_number, u.course,
               sd.date_of_birth, sd.gender, sd.category, sd.phone,
               sd.address, sd.previous_qualification, sd.father_name,
               sd.mother_name, sd.status as form_status, sd.avail_hostel,
               a.cohort_approval, a.final_approval, a.cohort_comments,
               w.status as withdrawal_status, w.reason as withdrawal_reason, w.remarks as withdrawal_remarks
        FROM users u
        LEFT JOIN student_details sd ON u.id = sd.user_id
        LEFT JOIN approvals a ON u.id = a.user_id
        LEFT JOIN (
            SELECT w1.user_id, w1.status, w1.reason, w1.remarks
            FROM withdrawals w1
            INNER JOIN (
                SELECT user_id, MAX(id) as max_id
                FROM withdrawals
                GROUP BY user_id
            ) w2 ON w1.id = w2.max_id
        ) w ON u.id = w.user_id
        WHERE u.id = ? AND u.cohort_leader_id = ?
    `;

    db.query(query, [studentId, cohortLeaderId], (err, results) => {
        if (err) return res.json({ success: false, message: err.message });
        if (results.length === 0) return res.json({ success: false, message: 'Student not found.' });
        res.json({ success: true, student: results[0] });
    });
});

// Approve or reject student
router.post('/approve/:id', isCohortLeader, (req, res) => {
    res.json({ success: false, message: 'Approval feature has been removed. Profile locks auto-complete registration.' });
});

// Unlock student profile
router.post('/unlock/:id', isCohortLeader, (req, res) => {
    const studentId = req.params.id;
    const cohortLeaderId = req.session.user.id;

    // Check if the student belongs to this cohort leader
    const checkQuery = 'SELECT * FROM users WHERE id = ? AND cohort_leader_id = ?';
    db.query(checkQuery, [studentId, cohortLeaderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Access denied.' });

        // Reset student details status to 'draft'
        db.query('UPDATE student_details SET status = "draft" WHERE user_id = ?', [studentId], (err) => {
            if (err) return res.json({ success: false, message: err.message });

            // Clear approvals details
            db.query(`UPDATE approvals SET 
                cohort_approval = NULL, 
                cohort_comments = NULL, 
                admin_approval = NULL, 
                final_approval = NULL, 
                registration_number = NULL 
                WHERE user_id = ?`, [studentId], (err) => {
                if (err) return res.json({ success: false, message: err.message });
                res.json({ success: true, message: 'Student profile unlocked successfully!' });
            });
        });
    });
});

// Approve or reject student withdrawal
router.post('/withdrawal/:studentId', isCohortLeader, (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
        return res.json({ success: false, message: 'Invalid decision status.' });
    }

    const checkQuery = 'SELECT * FROM users WHERE id = ? AND cohort_leader_id = ?';
    db.query(checkQuery, [studentId, cohortLeaderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Access denied.' });

        const updateQuery = 'UPDATE withdrawals SET status = ? WHERE user_id = ?';
        db.query(updateQuery, [status, studentId], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: `Withdrawal request ${status} successfully!` });
        });
    });
});

// Upload document for students
router.post('/upload-doc', isCohortLeader, (req, res) => {
    const cohortLeaderId = req.session.user.id;
    const { title } = req.body;

    const query = 'INSERT INTO cohort_leader_documents (cohort_leader_id, title, file_name, file_path) VALUES (?, ?, ?, ?)';
    db.query(query, [cohortLeaderId, title, 'sample.pdf', 'uploads/sample.pdf'], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, message: 'Document uploaded!' });
    });
});

// GET MESSAGES FOR A STUDENT
router.get('/messages/:studentId', isCohortLeader, (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;

    // Verify if this student is assigned to this cohort leader
    const checkQuery = 'SELECT * FROM users WHERE id = ? AND cohort_leader_id = ?';
    db.query(checkQuery, [studentId, cohortLeaderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Access denied.' });

        const query = `
            SELECT m.id, m.student_id, m.sender_id, m.message_text, m.created_at, u.name as sender_name, u.role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.student_id = ? AND m.cohort_leader_id = ?
            ORDER BY m.created_at ASC
        `;
        db.query(query, [studentId, cohortLeaderId], (err, results) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, messages: results });
        });
    });
});

// SEND MESSAGE TO A STUDENT
router.post('/message/:studentId', isCohortLeader, (req, res) => {
    const studentId = req.params.studentId;
    const cohortLeaderId = req.session.user.id;
    const { message_text } = req.body;

    if (!message_text || !message_text.trim()) {
        return res.json({ success: false, message: 'Message text cannot be empty.' });
    }

    // Verify if this student is assigned to this cohort leader
    const checkQuery = 'SELECT * FROM users WHERE id = ? AND cohort_leader_id = ?';
    db.query(checkQuery, [studentId, cohortLeaderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Access denied.' });

        const query = 'INSERT INTO messages (student_id, cohort_leader_id, sender_id, message_text) VALUES (?, ?, ?, ?)';
        db.query(query, [studentId, cohortLeaderId, cohortLeaderId, message_text], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: 'Message sent successfully!' });
        });
    });
});

module.exports = router;