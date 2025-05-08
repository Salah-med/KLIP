const mongoose = require("mongoose");

const anfrageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserInfo", required: true },
  originalDatum: { type: String, required: true }, // Originaler Diensttag
  originalDienst: { type: String, required: true }, // Originaler Diensttyp
  neuerTag: { type: String, required: true }, // Neuer gewünschter Tag
  neuerDienst: { type: String, required: true, enum: ["FD", "SD", "ND", "FK21", "FK11", "SK5", "SK7"] }, // Gültige Diensttypen
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
});

module.exports = mongoose.model("Tauschanfrage", anfrageSchema);