const mongoose = require("mongoose");

// Schema für Wunschpläne
const WunschplanSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "UserInfo", 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  surname: { 
    type: String, 
    required: true 
  },
  WunschDatum: { 
    type: String, 
    required: true 
  }, // Neuer gewünschter Tag
  WunschDienst: {
    type: [String], // Array von Strings für mehrere Diensttypen
    required: true,
    validate: {
      validator: (value) => {
        // Validieren, dass alle Diensttypen gültig sind
        const validTypes = ["FD", "SD", "ND", "FK21", "FK11", "SK5", "SK7"];
        return value.every(type => validTypes.includes(type));
      },
      message: "Ungültiger Diensttyp im Array"
    }
  }
});

// Export des Models
module.exports = mongoose.model("Wunschplan", WunschplanSchema);