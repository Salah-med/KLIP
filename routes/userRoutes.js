const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("../UserDetails"); // Importiere dein Schema
const User = mongoose.model("UserInfo");

// Route zum Hinzufügen von Benutzern
router.post("/admin-add-user", async (req, res) => {
  const { name, email, password, userType } = req.body;
  
  const oldUser = await User.findOne({ email: email });
  if (oldUser) {
    return res.status(409).send({ message: "User already exists!!" });
  }

  const encryptedPassword = await bcrypt.hash(password, 10);

  try {
    await User.create({
      name: name,
      email: email,
      password: encryptedPassword,
      userType,
    });
    res.status(201).send({ status: "ok", message: "User Created" });
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

// Exportiere den Router
module.exports = router;