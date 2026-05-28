const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    section: { type: String, trim: true, default: '' },
    subscription: { type: Object, default: null },   // web push subscription
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', studentSchema, 'students');