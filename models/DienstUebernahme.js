const mongoose = require('mongoose');

const dienstUebernahmeSchema = new mongoose.Schema({
  anbietenderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserInfo', required: true },
  annehmenderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserInfo', required: true },
  datum: { type: String, required: true },
  dienst: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DienstUebernahme', dienstUebernahmeSchema);