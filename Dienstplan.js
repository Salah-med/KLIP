const mongoose = require("mongoose");

const dienstplanSchema = new mongoose.Schema({
  datum: { type: String, required: true }, // Format: YYYY-MM-DD
  dienst: { type: String, enum: ["FD", "SD", "ND","FK21","FK11","SK5","SK7"], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserInfo", required: true },
}, { timestamps: true });

module.exports = mongoose.model("Dienstplan", dienstplanSchema);