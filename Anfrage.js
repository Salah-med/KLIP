const mongoose = require("mongoose");

const AnfrageSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserInfo", required: true },
    name: String,
    surname: String,
    datum: String,
    dienstTyp: String,
    status: { type: String, default: "offen" }, // "offen", "bestätigt", "abgelehnt"
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

module.exports = mongoose.model("Anfrage", AnfrageSchema); // Ensure the model name matches the collection name