const mongoose = require('mongoose');

const angebotSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  datum: { type: String, required: true },
  dienst: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Angebot', angebotSchema);