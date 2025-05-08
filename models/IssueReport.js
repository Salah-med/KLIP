const mongoose = require("mongoose");

const IssueReportSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  username: { // ← Neues Feld
    type: String,
    default: null,
  },
  
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("IssueReport", IssueReportSchema);