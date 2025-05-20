const mongoose = require("mongoose");

const AdminsDienstNotificationSchema = new mongoose.Schema({
  // Entweder entferne userId komplett und setze userType:
  targetType: {
    type: String,
    enum: ["admin", "mitarbeiter"],
    required: true,
    default: "admin" // Alle Admins sollen diese Benachrichtigung sehen
  },

  // Optional: Wer hat die Nachricht gesendet (z.B. ein Mitarbeiter)
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },

  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Liste aller Admins, die diese Nachricht gelesen haben
    default: []
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // TTL nach 30 Tagen
  }
});

module.exports = mongoose.model("AdminsDienstNotification", AdminsDienstNotificationSchema);