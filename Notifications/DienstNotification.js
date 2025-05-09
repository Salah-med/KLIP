const mongoose = require("mongoose");

const dienstNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // optional: automatische Löschung nach 30 Tagen (TTL)
  },
});

module.exports = mongoose.model("DienstNotification", dienstNotificationSchema);
