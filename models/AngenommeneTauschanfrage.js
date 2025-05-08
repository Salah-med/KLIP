const mongoose = require("mongoose");

const angemommeneTauschanfrageSchema = new mongoose.Schema({
  initiatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserInfo",
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserInfo",
    required: true
  },
  originalDatum: {
    type: String,
    required: true
  },
  neuerTag: {
    type: String,
    required: true
  },
  originalDienst: {
    type: String,
    required: true
  },
  neuerDienst: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("AngenommeneTauschanfrage", angemommeneTauschanfrageSchema);