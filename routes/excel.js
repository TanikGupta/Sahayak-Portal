const express = require('express');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

// Only admin can upload
function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.json({ success: false, message: 'Access denied.' });
    }
    next();
}

// Store excel files temporarily
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, 'excel-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// UPLOAD AND PROCESS EXCEL
router.post('/upload', isAdmin, upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded.' });
    }

    try {
        // Read Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
            return res.json({ success: false, message: 'Excel file is empty.' });
        }

        let inserted = 0;
        let updated = 0;
        let errors = [];

        // Process each row
        const processRow = (index) => {
            if (index >= rows.length) {
                return res.json({
                    success: true,
                    message: `Done! ${inserted} students added, ${updated} updated.`,
                    inserted, updated, errors
                });
            }

            const row = rows[index];

            // Map Excel columns to database fields
            // Flexible — works with different column names
            const name = row['Name'] || row['Student Name'] || row['STUDENT NAME'] || row['name'] || '';
            const admissionNumber = String(row['Admission Number'] || row['Admission No'] || row['ADM NO'] || row['admission_number'] || row['Enrollment No'] || '').trim();
            const course = row['Course'] || row['Programme'] || row['COURSE'] || row['course'] || '';
            const firstName = row['First Name'] || row['FIRST NAME'] || '';
            const middleName = row['Middle Name'] || row['MIDDLE NAME'] || '';
            const lastName = row['Last Name'] || row['LAST NAME'] || row['Surname'] || '';
            const dob = row['Date of Birth'] || row['DOB'] || row['dob'] || null;
            const gender = row['Gender'] || row['GENDER'] || '';
            const category = row['Category'] || row['CATEGORY'] || '';
            const phone = String(row['Phone'] || row['Mobile'] || row['Contact No'] || row['PHONE'] || '');
            const email = row['Email'] || row['EMAIL'] || row['Email ID'] || '';
            const fatherName = row["Father's Name"] || row['FATHER NAME'] || row['Father Name'] || '';
            const motherName = row["Mother's Name"] || row['MOTHER NAME'] || row['Mother Name'] || '';
            const bloodGroup = row['Blood Group'] || row['BLOOD GROUP'] || '';
            const specialization = row['Specialization'] || row['Branch'] || row['BRANCH'] || '';
            const academicYear = row['Academic Year'] || row['ACADEMIC YEAR'] || '2026';

            const pct12th = row['12th Percentage'] || row['12th %'] || row['Class 12 Percentage'] || row['12th percentage'] || '';
            const jeeScore = row['JEE Main Score'] || row['JEE Main Score (Percentile)'] || row['JEE Score'] || row['JEE Percentile'] || row['JEE Main Percentile'] || '';
            let prevQual = '';
            if (pct12th || jeeScore) {
                prevQual = `12th: ${pct12th} | JEE: ${jeeScore}`;
            } else {
                prevQual = row['Previous Qualification'] || row['previous_qualification'] || '';
            }

            if (!admissionNumber) {
                errors.push(`Row ${index + 2}: Missing admission number`);
                return processRow(index + 1);
            }

            // Full name fallback
            const fullName = name || [firstName, middleName, lastName].filter(Boolean).join(' ');

            if (!fullName) {
                errors.push(`Row ${index + 2}: Missing student name`);
                return processRow(index + 1);
            }

            // Check if user already exists
            const checkQuery = 'SELECT * FROM users WHERE admission_number = ?';
            db.query(checkQuery, [admissionNumber], (err, results) => {
                if (err) {
                    errors.push(`Row ${index + 2}: DB error — ${err.message}`);
                    return processRow(index + 1);
                }

                if (results.length > 0) {
                    // Update existing user
                    const userId = results[0].id;
                    const updateUser = 'UPDATE users SET name=?, course=? WHERE id=?';
                    db.query(updateUser, [fullName, course, userId], (err) => {
                        if (err) { errors.push(`Row ${index + 2}: Update error`); return processRow(index + 1); }

                        // Update or insert student details
                        upsertStudentDetails(userId, {
                            firstName, middleName, lastName, dob, gender,
                            category, phone, email, fatherName, motherName,
                            bloodGroup, specialization, academicYear, prevQual
                        }, () => {
                            updated++;
                            processRow(index + 1);
                        });
                    });
                } else {
                    // Insert new user
                    const insertUser = 'INSERT INTO users (name, admission_number, course, role) VALUES (?, ?, ?, "student")';
                    db.query(insertUser, [fullName, admissionNumber, course], (err, result) => {
                        if (err) {
                            errors.push(`Row ${index + 2}: Insert error — ${err.message}`);
                            return processRow(index + 1);
                        }

                        const userId = result.insertId;
                        upsertStudentDetails(userId, {
                            firstName, middleName, lastName, dob, gender,
                            category, phone, email, fatherName, motherName,
                            bloodGroup, specialization, academicYear, prevQual
                        }, () => {
                            inserted++;
                            processRow(index + 1);
                        });
                    });
                }
            });
        };

        processRow(0);

    } catch (err) {
        console.error('Excel error:', err);
        res.json({ success: false, message: 'Error reading Excel file: ' + err.message });
    }
});

function upsertStudentDetails(userId, data, callback) {
    const checkQuery = 'SELECT * FROM student_details WHERE user_id = ?';
    db.query(checkQuery, [userId], (err, results) => {
        if (err) return callback();

        const fields = {
            first_name: data.firstName || null,
            middle_name: data.middleName || null,
            last_name: data.lastName || null,
            date_of_birth: data.dob || null,
            gender: data.gender || null,
            category: data.category || null,
            phone: data.phone || null,
            email: data.email || null,
            father_name: data.fatherName || null,
            mother_name: data.motherName || null,
            blood_group: data.bloodGroup || null,
            specialization: data.specialization || null,
            academic_year: data.academicYear || null,
            previous_qualification: data.prevQual || null
        };

        if (results.length > 0) {
            // Only update fields that have values — don't overwrite student's own filled data
            const updates = [];
            const values = [];
            Object.keys(fields).forEach(key => {
                if (fields[key]) {
                    updates.push(`${key} = ?`);
                    values.push(fields[key]);
                }
            });
            if (updates.length > 0) {
                values.push(userId);
                db.query(`UPDATE student_details SET ${updates.join(', ')} WHERE user_id = ?`, values, () => callback());
            } else {
                callback();
            }
        } else {
            const keys = Object.keys(fields);
            const vals = Object.values(fields);
            db.query(
                `INSERT INTO student_details (user_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`,
                [userId, ...vals],
                () => callback()
            );
        }
    });
}

// GET PREVIEW OF EXCEL BEFORE IMPORTING
router.post('/preview', isAdmin, upload.single('excelFile'), (req, res) => {
    if (!req.file) return res.json({ success: false, message: 'No file uploaded.' });

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        // Return first 5 rows as preview + column names
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const preview = rows.slice(0, 5);

        res.json({
            success: true,
            totalRows: rows.length,
            columns,
            preview,
            filename: req.file.originalname
        });
    } catch (err) {
        res.json({ success: false, message: 'Error reading file: ' + err.message });
    }
});

// DOWNLOAD SAMPLE EXCEL TEMPLATE
router.get('/template', isAdmin, (req, res) => {
    const data = [
        {
            'Admission Number': '2025001',
            'Name': 'John Kumar Sharma',
            'First Name': 'John',
            'Middle Name': 'Kumar',
            'Last Name': 'Sharma',
            'Course': 'BTECH',
            'Specialization': 'Computer Science',
            'Academic Year': '2025-26',
            'Date of Birth': '2005-06-15',
            'Gender': 'Male',
            'Category': 'General',
            'Phone': '9876543210',
            'Email': 'john@example.com',
            "Father's Name": 'Ramesh Sharma',
            "Mother's Name": 'Sunita Sharma',
            '12th Percentage': '85%',
            'JEE Main Score (Percentile)': '98.5'
        },
        {
            'Admission Number': '2025002',
            'Name': 'Priya Singh',
            'First Name': 'Priya',
            'Middle Name': '',
            'Last Name': 'Singh',
            'Course': 'BBA',
            'Specialization': '',
            'Academic Year': '2025-26',
            'Date of Birth': '2005-03-22',
            'Gender': 'Female',
            'Category': 'OBC',
            'Phone': '9876543211',
            'Email': 'priya@example.com',
            "Father's Name": 'Vikram Singh',
            "Mother's Name": 'Meera Singh',
            '12th Percentage': '78%',
            'JEE Main Score (Percentile)': '92.1'
        }
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Set column widths
    worksheet['!cols'] = [
        {wch:16},{wch:22},{wch:14},{wch:14},{wch:14},
        {wch:10},{wch:20},{wch:12},{wch:14},{wch:10},
        {wch:12},{wch:14},{wch:24},{wch:12},{wch:22},{wch:22},
        {wch:18},{wch:28}
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=JKLU_Student_Import_Template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});
// UPLOAD COHORT LEADER ASSIGNMENT EXCEL
router.post('/assign-cohort-leaders', isAdmin, upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded.' });
    }

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
            return res.json({ success: false, message: 'Excel file is empty.' });
        }

        let assigned = 0;
        let errors = [];

        const processRow = (index) => {
            if (index >= rows.length) {
                return res.json({
                    success: true,
                    message: `Done! ${assigned} Cohort Leader assignments updated.`,
                    assigned, errors
                });
            }

            const row = rows[index];

            const admissionNumber = String(row['Application Number'] || row['Admission Number'] || row['ADM NO'] || row['admission_number'] || '').trim();
            const cohortLeaderId = String(row['Cohort Leader ID'] || row['cohort_leader_id'] || '').trim();
            const cohortLeaderName = String(row['Cohort Leader Name'] || row['cohort_leader_name'] || '').trim();

            if (!admissionNumber) {
                errors.push(`Row ${index + 2}: Missing application number`);
                return processRow(index + 1);
            }

            if (!cohortLeaderId && !cohortLeaderName) {
                errors.push(`Row ${index + 2}: Missing Cohort Leader ID or Cohort Leader Name`);
                return processRow(index + 1);
            }

            // Find student
            const findStudent = 'SELECT id FROM users WHERE admission_number = ? AND role = "student"';
            db.query(findStudent, [admissionNumber], (err, students) => {
                if (err || students.length === 0) {
                    errors.push(`Row ${index + 2}: Student not found — ${admissionNumber}`);
                    return processRow(index + 1);
                }

                const studentDbId = students[0].id;

                // Find Cohort Leader by ID or name
                const findCohortLeader = cohortLeaderId
                    ? 'SELECT id FROM users WHERE admission_number = ? AND role = "cohort_leader"'
                    : 'SELECT id FROM users WHERE name = ? AND role = "cohort_leader"';
                const cohortLeaderParam = cohortLeaderId || cohortLeaderName;

                db.query(findCohortLeader, [cohortLeaderParam], (err, cohortLeaders) => {
                    if (err || cohortLeaders.length === 0) {
                        errors.push(`Row ${index + 2}: Cohort Leader not found — ${cohortLeaderParam}`);
                        return processRow(index + 1);
                    }

                    const cohortLeaderDbId = cohortLeaders[0].id;

                    // Assign Cohort Leader to student
                    db.query('UPDATE users SET cohort_leader_id = ? WHERE id = ?', [cohortLeaderDbId, studentDbId], (err) => {
                        if (err) {
                            errors.push(`Row ${index + 2}: Assignment failed`);
                        } else {
                            assigned++;
                        }
                        processRow(index + 1);
                    });
                });
            });
        };

        processRow(0);

    } catch (err) {
        res.json({ success: false, message: 'Error reading Excel: ' + err.message });
    }
});

// DOWNLOAD COHORT LEADER ASSIGNMENT TEMPLATE
router.get('/cohort-leader-template', isAdmin, (req, res) => {
    const data = [
        {
            'Application Number': 'JKLU/B.TECH/2026/0001',
            'Student Name': 'Sample Student One',
            'Cohort Leader ID': 'CL001',
            'Cohort Leader Name': 'Cohort Leader One'
        },
        {
            'Application Number': 'JKLU/BBA/2026/0002',
            'Student Name': 'Sample Student Two',
            'Cohort Leader ID': 'CL001',
            'Cohort Leader Name': 'Cohort Leader One'
        },
        {
            'Application Number': 'JKLU/B.DES/2026/0003',
            'Student Name': 'Sample Student Three',
            'Cohort Leader ID': 'CL002',
            'Cohort Leader Name': 'Cohort Leader Two'
        }
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [{wch:25},{wch:25},{wch:18},{wch:22}];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cohort Leader Assignment');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=JKLU_Cohort_Leader_Assignment_Template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

function parse12th(val) {
    if (!val) return '';
    if (val.includes('|')) {
        const parts = val.split('|');
        for (let part of parts) {
            const sub = part.split(':');
            if (sub.length >= 2 && sub[0].toLowerCase().includes('12th')) {
                return sub.slice(1).join(':').trim() || '';
            }
        }
        return parts[0].trim() || '';
    }
    return val.replace(/^(12th percentage|12th percentage:|12th:|12th)\s*/i, '').trim() || '';
}

function parseJee(val) {
    if (!val || !val.includes('|')) return '';
    const parts = val.split('|');
    for (let part of parts) {
        const sub = part.split(':');
        if (sub.length >= 2 && sub[0].toLowerCase().includes('jee')) {
            return sub.slice(1).join(':').trim() || '';
        }
    }
    const valJee = parts[1] ? parts[1].trim() : '';
    return valJee.replace(/^(jee main score|jee main score:|jee:|jee)\s*/i, '').trim() || '';
}

// DOWNLOAD ALL FILLED STUDENT DATA AS EXCEL
router.get('/export-students', isAdmin, (req, res) => {
    const studentsQuery = `
        SELECT u.admission_number, u.name as student_name, u.course, 
               sd.first_name, sd.middle_name, sd.last_name, sd.date_of_birth, sd.gender, 
               sd.category, sd.phone, sd.email, sd.apaar_id, sd.blood_group,
               sd.father_name, sd.father_phone,
               sd.mother_name, sd.mother_phone,
               sd.address as permanent_address, sd.local_address,
               sd.emergency_name, sd.emergency_relation, sd.emergency_phone, sd.emergency_mobile,
               sd.specialization, sd.previous_qualification,
               sd.avail_hostel, sd.hostel_age, sd.hostel_marital_status, sd.hostel_stayed_before,
               sd.hostel_medical_history, sd.hostel_medical_details,
               sd.hostel_guardian_name, sd.hostel_guardian_relation, sd.hostel_guardian_address,
               sd.hostel_guardian_phone,
               sd.avail_transport, sd.transport_alt_mobile, sd.transport_address,
               sd.transport_area, sd.transport_pincode, sd.transport_gmaps_link,
               sd.transport_pickup_point, sd.transport_suggested_pickup, sd.transport_distance,
               sd.transport_landmark, sd.transport_expected_area, sd.transport_other_students,
               sd.transport_approx_students
        FROM users u
        INNER JOIN student_details sd ON u.id = sd.user_id
        WHERE u.role = 'student' AND sd.status = 'submitted'
        ORDER BY u.id ASC
    `;

    db.query(studentsQuery, (err, students) => {
        if (err) {
            console.error('Export students query error:', err);
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }

        // Format dates and prepare rows
        const formattedRows = students.map((row, index) => {
            let dobStr = '';
            if (row.date_of_birth) {
                const d = new Date(row.date_of_birth);
                const tzOffset = d.getTimezoneOffset() * 60000;
                const localDate = new Date(d.getTime() - tzOffset);
                dobStr = localDate.toISOString().split('T')[0];
            }

            return {
                'S.No.': index + 1,
                'Admission Number': row.admission_number || '',
                'Full Name': row.student_name || '',
                'Course': row.course || '',
                'Specialization': row.specialization || '',
                'First Name': row.first_name || '',
                'Middle Name': row.middle_name || '',
                'Last Name': row.last_name || '',
                'Date of Birth': dobStr,
                'Gender': row.gender || '',
                'Category': row.category || '',
                'Mobile Number': row.phone || '',
                'Email ID': row.email || '',
                'Blood Group': row.blood_group || '',
                "Father's Name": row.father_name || '',
                "Mother's Name": row.mother_name || '',
                'Permanent Address': row.permanent_address || '',
                'Local Address': row.local_address || '',
                'Emergency Contact Person': row.emergency_name || '',
                'Emergency Contact Relation': row.emergency_relation || '',
                'Emergency Contact Mobile': row.emergency_mobile || row.emergency_phone || '',
                "Father's Mobile": row.father_phone || '',
                "Mother's Mobile": row.mother_phone || '',
                '12th Percentage': parse12th(row.previous_qualification),
                'JEE Score': parseJee(row.previous_qualification),
                'Aadhaar Card': row.apaar_id || ''
            };
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedRows);

        // Adjust column widths automatically
        const keys = formattedRows.length > 0 ? Object.keys(formattedRows[0]) : [];
        worksheet['!cols'] = keys.map(key => ({ wch: Math.max(key.length + 4, 15) }));

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registered Students');

        // Create Hostel sheet
        const hostelStudents = students.filter(row => row.avail_hostel && row.avail_hostel.toLowerCase() === 'yes');
        const hostelHeaders = [
            'S.No.', 'Admission Number', 'Student Name', 'Course', 'Specialization',
            'Hostel Age', 'Marital Status', 'Stayed in Hostel Before',
            'Medical History', 'Medical Details', 'Local Guardian Name',
            'Local Guardian Relation', 'Local Guardian Address', 'Local Guardian Phone'
        ];
        
        const hostelRows = hostelStudents.map((row, index) => ({
            'S.No.': index + 1,
            'Admission Number': row.admission_number || '',
            'Student Name': row.student_name || '',
            'Course': row.course || '',
            'Specialization': row.specialization || '',
            'Hostel Age': row.hostel_age || '',
            'Marital Status': row.hostel_marital_status || '',
            'Stayed in Hostel Before': row.hostel_stayed_before || '',
            'Medical History': row.hostel_medical_history || '',
            'Medical Details': row.hostel_medical_details || '',
            'Local Guardian Name': row.hostel_guardian_name || '',
            'Local Guardian Relation': row.hostel_guardian_relation || '',
            'Local Guardian Address': row.hostel_guardian_address || '',
            'Local Guardian Phone': row.hostel_guardian_phone || ''
        }));

        const hostelWorksheet = XLSX.utils.json_to_sheet(hostelRows, { header: hostelHeaders });
        hostelWorksheet['!cols'] = hostelHeaders.map(key => ({ wch: Math.max(key.length + 4, 15) }));
        XLSX.utils.book_append_sheet(workbook, hostelWorksheet, 'Hostel Details');

        // Create Transport sheet
        const transportStudents = students.filter(row => row.avail_transport && row.avail_transport.toLowerCase() === 'yes');
        const transportHeaders = [
            'S.No.', 'Admission Number', 'Student Name', 'Course', 'Specialization',
            'Alternate Mobile', 'Residential Address', 'Area/Locality', 'PIN Code',
            'Google Maps Link', 'Pickup Point', 'Suggested Pickup Point',
            'Distance from Home', 'Nearest Landmark', 'Expected Transport Area',
            'Other Students Near', 'Approx Students'
        ];

        const transportRows = transportStudents.map((row, index) => ({
            'S.No.': index + 1,
            'Admission Number': row.admission_number || '',
            'Student Name': row.student_name || '',
            'Course': row.course || '',
            'Specialization': row.specialization || '',
            'Alternate Mobile': row.transport_alt_mobile || '',
            'Residential Address': row.transport_address || '',
            'Area/Locality': row.transport_area || '',
            'PIN Code': row.transport_pincode || '',
            'Google Maps Link': row.transport_gmaps_link || '',
            'Pickup Point': row.transport_pickup_point || '',
            'Suggested Pickup Point': row.transport_suggested_pickup || '',
            'Distance from Home': row.transport_distance || '',
            'Nearest Landmark': row.transport_landmark || '',
            'Expected Transport Area': row.transport_expected_area || '',
            'Other Students Near': row.transport_other_students || '',
            'Approx Students': row.transport_approx_students || ''
        }));

        const transportWorksheet = XLSX.utils.json_to_sheet(transportRows, { header: transportHeaders });
        transportWorksheet['!cols'] = transportHeaders.map(key => ({ wch: Math.max(key.length + 4, 15) }));
        XLSX.utils.book_append_sheet(workbook, transportWorksheet, 'Transport Details');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Extract filename from query or use default
        let downloadFilename = req.query.filename ? req.query.filename.trim() : 'JKLU_Registered_Students_Export';
        // Ensure it ends with .xlsx
        if (!downloadFilename.endsWith('.xlsx')) {
            downloadFilename += '.xlsx';
        }

        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    });
});

module.exports = router;