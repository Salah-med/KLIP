const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { 
    type: String, 
    required: true, 
    enum: ["admin", "mitarbeiter"] // Neue Rolle
  },
  pushToken: { 
    type: String, 
    default: null // Für Push-Benachrichtigungen
  }
});

// Nur erstellen, wenn das Modell noch nicht existiert
const UserInfo = mongoose.models.UserInfo || mongoose.model("UserInfo", userSchema);

module.exports = UserInfo;