const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const Anfrage = require("./Anfrage");
const Wunschplan = require("./Wunschplan");
const Dienstplan = require("./Dienstplan");
const TauschAnfrage = require("./Tauschanfrage");
const Angebot = require('./Angebot');
const DienstUebernahme = require('./models/DienstUebernahme');
const AngenommeneTauschanfrage = require('./models/AngenommeneTauschanfrage');
const IssueReport = require("./models/IssueReport");
const DienstNotification = require("./Notifications/DienstNotification");
const AdminsDienstNotification = require("./Notifications/AdminsDienstNotification");
const UserInfo = require("./UserDetails");
const sendPushNotification = require("./sendPushNotification");




const axios = require('axios');







dotenv.config();
const app = express();
app.use(express.json());

// MongoDB-Verbindung
const mongoUrl = process.env.MONGO_URL;
const JWT_SECRET = process.env.JWT_SECRET;

mongoose
  .connect(mongoUrl)
  .then(() => {
    console.log("Database Connected");
  })
  .catch((e) => {
    console.error("Database Connection Error:", e);
  });

require("./UserDetails");
const User = mongoose.model("UserInfo");

// Basisroute
app.get("/", (req, res) => {
  res.send({ status: "Started" });
});




// Benutzer erstellen (Admin-Route)
app.post("/admin-add-user", async (req, res) => {
  const { name,surname,username, email, password, userType } = req.body;
  
  const oldUser = await User.findOne({ email: email });
  if (oldUser) {
    return res.status(409).send({ message: "User already exists!!" });
  }

  const encryptedPassword = await bcrypt.hash(password, 10);

  try {
    await User.create({
      name: name,
      surname: surname,
      username: username,
      email: email,
      password: encryptedPassword,
      userType: userType
    });
    res.status(201).send({ status: "ok", message: "User Created" });
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

// mehrer User erstellen 
app.post("/admin-add-users-batch", async (req, res) => {
  const users = req.body;

  // Prüfen ob Array übergeben wurde
  if (!Array.isArray(users)) {
    return res.status(400).send({ status: "error", message: "Expected an array of users." });
  }

  const results = [];

  for (const user of users) {
    const { name, surname, username, email, password, userType } = user;

    if (!email || !password) {
      results.push({ email, status: "skipped", reason: "Missing email or password" });
      continue;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      results.push({ email, status: "skipped", reason: "User already exists" });
      continue;
    }

    const encryptedPassword = await bcrypt.hash(password, 10);

    try {
      await User.create({
        name,
        surname,
        username,
        email,
        password: encryptedPassword,
        userType: userType || "mitarbeiter" // Default setzen
      });
      results.push({ email, status: "success" });
    } catch (err) {
      results.push({ email, status: "error", reason: err.message });
    }
  }

  res.status(207).send({ status: "partial_success", results });
});

app.post("/change-password", async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    console.log("🔧 Passwortänderung gestartet");

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      console.log("❌ Kein Authorization Header");
      return res.status(401).json({ message: 'Authorization Header fehlt' });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("❌ Kein Token im Header");
      return res.status(401).json({ message: 'Token fehlt' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log("🔓 Decoded Token:", decoded); // 🔍 Zeige die tatsächlichen Daten an
    } catch (err) {
      console.error("❌ Token ungültig oder abgelaufen:", err.message);
      return res.status(401).json({ message: 'Ungültiges oder abgelaufenes Token' });
    }

    // ✅ Nutze `userId`, da das Feld im Token so heißt
    const userId = decoded.userId;
    console.log("🔍 Suche Benutzer mit userId:", userId);

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ Benutzer nicht gefunden:", userId);
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      console.log("❌ Altes Passwort falsch");
      return res.status(400).json({ message: 'Altes Passwort ist falsch.' });
    }

    const encryptedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: encryptedPassword });

    console.log("✅ Passwort erfolgreich geändert");
    res.json({ status: "ok", message: "Passwort erfolgreich geändert!" });

  } catch (error) {
    console.error("🚨 Serverfehler beim Ändern des Passworts:", error.message);
    res.status(500).json({ message: "Serverfehler beim Ändern des Passworts." });
  }
});


// Benutzeranmeldung
app.post("/login-user", async (req, res) => {
  const { username, email, password } = req.body;
  const oldUser = await User.findOne({ email: email, username: username });
  
  if (!oldUser) {
    return res.status(404).send({ message: "User doesn't exist!!" });
  }
  
  if (await bcrypt.compare(password, oldUser.password)) {
    const token = jwt.sign({ email: oldUser.email, userId: oldUser._id }, JWT_SECRET);
    return res.status(200).send({
      status: "ok",
      data: token,
      userId: oldUser._id,
      userType: oldUser.userType, // Rolle des Benutzers zurückgeben
    });
  } else {
    return res.status(401).send({ message: "Invalid credentials!" });
  }
});


// Report an Issue (POST)
app.post("/report-issue", async (req, res) => {
  const { description, userId, username } = req.body;

  if (!description || description.trim() === "") {
    return res.status(400).json({ error: "Beschreibung fehlt." });
  }

  try {
    const newIssue = await IssueReport.create({
      description: description.trim(),
      
      username: username || null,
    });

    res.status(201).json({ status: "ok", message: "Problem gespeichert.", reportId: newIssue._id });
  } catch (error) {
    console.error("Fehler beim Speichern des Reports:", error);
    res.status(500).json({ error: "Konnte Problem nicht speichern." });
  }
});


// Route zum Abrufen von Benutzerdaten basierend auf dem Token


app.post("/userdata", async (req, res) => {
  const { token } = req.body;
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const useremail = user.email;
    const data = await User.findOne({ email: useremail });
    if (!data) {
      return res.status(404).send({ status: "error", message: "User not found" });
    }
    return res.send({ status: "Ok", data: data });
  } catch (error) {
    console.error("Fehler in /userdata:", error);
    return res.status(401).send({ status: "error", message: "Invalid token" });
  }
});





// Route zum Abrufen von Wunschplandaten für einen Benutzer
app.get("/api/get-wunschplan", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ status: "error", message: "Token nicht vorhanden oder ungültig" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const userId = user.userId;
    const data = await Wunschplan.find({ userId });

    // Keine Umwandlung mehr, MongoDB gibt Date-Objekt zurück
    return res.send({ status: "ok", data });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});

// Route zum Speichern oder Aktualisieren von Wunschplandaten
app.post("/api/save-wunschplan", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({ status: "error", message: "Token nicht vorhanden oder ungültig" });
    }
    const token = authHeader.split(" ")[1];
    const user = jwt.verify(token, JWT_SECRET);
    const dbUser = await User.findOne({ email: user.email });
    if (!dbUser) {
      return res.status(404).send({ status: "error", message: "User not found" });
    }
    const { _id: userId, name, surname } = dbUser;
    const { id, WunschDatum, WunschDienst } = req.body;

    // Wenn eine ID übergeben wird, aktualisiere den bestehenden Eintrag
    if (id) {
      const updatedEntry = await Wunschplan.findOneAndUpdate(
        { _id: id, userId },
        { $set: { WunschDatum, WunschDienst } },
        { new: true }
      );
      if (!updatedEntry) {
        return res.status(404).send({ status: "error", message: "Wunschplan nicht gefunden" });
      }
      return res.status(200).send({ status: "ok", message: "Wunschplan aktualisiert", id: updatedEntry._id });
    }

    // Wenn keine ID übergeben wird, erstelle einen neuen Eintrag
    const existingEntry = await Wunschplan.findOne({ userId, WunschDatum });
    if (existingEntry) {
      await Wunschplan.deleteOne({ _id: existingEntry._id }); // Lösche den alten Eintrag
    }
    const newEntry = await Wunschplan.create({
      userId,
      name,
      surname,
      WunschDatum,
      WunschDienst,
    });
    res.status(201).send({ status: "ok", message: "Wunschplan gespeichert", id: newEntry._id });
  } catch (error) {
    console.error(error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).send({ status: "error", message: "Ungültiger Token" });
    }
    res.status(500).send({ status: "error", message: error.message });
  }
});


// Delete
app.delete("/api/delete-wunschplan", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ status: "error", message: "Token nicht vorhanden oder ungültig" });
  }
  const token = authHeader.split(" ")[1];
  const { id } = req.body;
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const userId = user.userId;
    // Überprüfen, ob der Wunschplan existiert
    const wunschplan = await Wunschplan.findOne({ _id: id, userId });
    if (!wunschplan) {
      return res.status(404).send({ status: "error", message: "Wunschplan nicht gefunden" });
    }
    // Wunschplan löschen
    await Wunschplan.deleteOne({ _id: id });
    res.send({ status: "ok", message: "Wunschplan gelöscht" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});





// Backend: Route zum Abrufen aller Wunschpläne
// Backend: Route zum Abrufen aller Wunschpläne
app.get("/api/admin/wunschplaene", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({ status: "error", message: "Token nicht vorhanden oder ungültig" });
    }

    const token = authHeader.split(" ")[1];
    const user = jwt.verify(token, JWT_SECRET);
    const dbUser = await User.findOne({ email: user.email });

    if (!dbUser || dbUser.userType !== "admin") {
      return res.status(403).send({ status: "error", message: "Zugriff verweigert. Nur Admins dürfen diese Aktion ausführen." });
    }

    // 📅 Aktueller Monat
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 999);

    // Alle Mitarbeiter holen
    const allUsers = await User.find({ userType: "mitarbeiter" }, "name surname email");

    // Alle Wunschpläne des aktuellen Monats holen
    const wunschplaene = await Wunschplan.find({
      WunschDatum: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate("userId", "email");

    // Jeder Mitarbeiter bekommt jetzt seine Wünsche zugeordnet
    const result = allUsers.map(user => {
      const userWishes = wunschplaene.filter(w => w.userId?.email === user.email);

      return {
        user,
        wishes: userWishes.map(w => ({
          date: w.WunschDatum,
          shifts: w.WunschDienst,
        })),
      };
    });

    res.status(200).send({
      status: "ok",
      message: "Wunschpläne erfolgreich abgerufen",
      data: result,
    });
  } catch (error) {
    console.error(error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).send({ status: "error", message: "Ungültiger Token" });
    }
    res.status(500).send({ status: "error", message: error.message });
  }
});






// Route zum Senden von Anfragen bei aktuller Besetzung 
app.post("/anfrage", async (req, res) => {
  try {
    const { userId, name, surname, datum, dienstTyp } = req.body;

    // Überprüfen, ob alle erforderlichen Felder vorhanden sind
    if (!userId || !name || !surname || !datum || !dienstTyp) {
      return res.status(400).send({ status: "error", message: "Alle Felder sind erforderlich" });
    }

    // Überprüfen, ob bereits eine Anfrage für diesen Tag und Diensttyp existiert
    const existingAnfrage = await Anfrage.findOne({ userId, datum, dienstTyp });
    if (existingAnfrage) {
      return res.status(409).send({ status: "error", message: "Es existiert bereits eine Anfrage für diesen Tag und Diensttyp." });
    }

    // Neue Anfrage erstellen
    const newAnfrage = await Anfrage.create({
      userId,
      name,
      surname,
      datum,
      dienstTyp,
      status: "pending",
    });


    // 👇 Hier kommt die neue Logik zur Benachrichtigung aller Admins
    const title = `${name} ${surname} hat eine Anfrage gestellt`;
    const message = `${name} ${surname} hat eine Anfrage für "${dienstTyp}" am ${new Date(datum).toLocaleDateString()} erstellt.`;

    // Alle Admins aus der Datenbank laden
    const admins = await UserInfo.find({ userType: "admin" });

    // Für jeden Admin:
    // 1. Benachrichtigung in DB speichern
    // 2. Push-Benachrichtigung senden (falls Token vorhanden)
    for (const admin of admins) {
      // 🔹 Speichere Benachrichtigung in der DB
      await AdminsDienstNotification.create({
        title,
        message,
        targetType: "admin",
        senderId: userId
      });

      // 🔹 Sende Push-Benachrichtigung, falls Token vorhanden
      if (admin.pushToken) {
        await sendPushNotification(admin.pushToken, title, message);
      }
    }

    res.status(201).send({ status: "ok", message: "Anfrage erfolgreich gesendet", data: newAnfrage });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});





// Route zum Abrufen von Anfragen für einen bestimmten Benutzer
app.get("/anfrage/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Überprüfen, ob die userId vorhanden ist
    if (!userId) {
      return res.status(400).send({ status: "error", message: "User ID ist erforderlich" });
    }

    // Anfragen des Benutzers abrufen
    const anfragen = await Anfrage.find({ userId });

    if (!anfragen || anfragen.length === 0) {
      return res.status(404).send({ status: "error", message: "Keine Anfragen gefunden" });
    }

    res.status(200).send({ status: "ok", data: anfragen });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});


// Route zum Abrufen Besetzung 
app.get("/dienst/all", async (req, res) => {
  console.log("Route /dienst/all wurde aufgerufen");
  try {
    const dienstplan = await Dienstplan.find();
    
    res.status(200).send({ status: "ok", data: dienstplan });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});


// Route zum Abrufen aller Anfragen für den Admin
app.get("/anfrage/all", async (req, res) => {
  try {
    const anfragen = await Anfrage.find({ status: "pending" }) // Nur offene Anfragen anzeigen
      .populate("userId", "name surname") // User-Informationen hinzufügen
      .sort({ createdAt: -1 }); // Neueste Anfragen zuerst
    res.status(200).send({ status: "ok", data: anfragen });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});



// Route zum Bearbeiten einer Anfrage (Bestätigen oder Ablehnen)

app.put("/anfrage/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["bestätigt", "abgelehnt"].includes(status)) {
      return res.status(400).send({ status: "error", message: "Ungültiger Status" });
    }

    const anfrage = await Anfrage.findById(id);
    if (!anfrage) {
      return res.status(404).send({ status: "error", message: "Anfrage nicht gefunden" });
    }

    const { userId, datum, dienstTyp } = anfrage;

    if (status === "bestätigt") {
      const existingDienstplan = await Dienstplan.findOne({ userId, datum, dienst: dienstTyp });
      if (existingDienstplan) {
        return res.status(400).send({ status: "error", message: "Dieser Dienstplan-Eintrag existiert bereits." });
      }

      await Dienstplan.create({ userId, datum, dienst: dienstTyp });
    }

    // ✅ DienstNotification hinzufügen
    const notification = await DienstNotification.create({
      userId,
      title: status === "bestätigt" ? "Dienstanfrage bestätigt" : "Dienstanfrage abgelehnt",
      message:
        status === "bestätigt"
          ? `Dein Dienst am ${datum} (${dienstTyp}) wurde bestätigt.`
          : `Deine Anfrage für den ${datum} (${dienstTyp}) wurde abgelehnt.`,
    });

    // 🔹 Nutzer mit Push-Token laden
    const user = await UserInfo.findById(userId);
    if (user?.pushToken) {
      await sendPushNotification(user.pushToken, notification.title, notification.message);
    }

    // Anfrage löschen
    await Anfrage.deleteOne({ _id: id });

    res.status(200).send({ status: "ok", message: "Anfrage bearbeitet und gelöscht" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: "Serverfehler" });
  }
});


// Neue Route in deinem Backend
app.get("/api/DienstNotifications/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // 🔍 Debug: Empfangene userId aus der URL
    console.log("Empfangene userId:", userId);

    if (!userId || userId.trim() === "") {
      return res.status(400).json({
        status: "error",
        message: "userId ist erforderlich",
      });
    }

    // 📦 Datenbankabfrage
    const notifications = await DienstNotification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);

    // 🔍 Debug: Anzahl der gefundenen Benachrichtigungen
    console.log(`Gefundene Benachrichtigungen für ${userId}:`, notifications.length);

    // ✅ Erfolgreiche Antwort
    res.status(200).json(notifications);
  } catch (error) {
    // ❗ Fehlerbehandlung
    console.error("Fehler beim Laden der Benachrichtigungen:", error.message);
    res.status(500).json({ status: "error", message: "Fehler beim Laden" });
  }
});



// DELETE /api/DienstNotifications/all?userId=...
// Die spezifischere Route zuerst definieren
app.delete("/api/DienstNotifications/deleteAll", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: "error",
        message: "userId ist erforderlich",
      });
    }

    const result = await DienstNotification.deleteMany({ userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: "warning",
        message: "Keine Benachrichtigungen gefunden zum Löschen",
      });
    }

    res.status(200).json({
      status: "success",
      message: `${result.deletedCount} Benachrichtigung(en) gelöscht`,
    });
  } catch (error) {
    console.error("Fehler beim Löschen aller Benachrichtigungen:", error.message);
    res.status(500).json({ status: "error", message: "Serverfehler" });
  }
});

app.delete("/api/AdminsDienstNotifications/deleteAll", async (req, res) => {
  try {
    const result = await AdminsDienstNotification.deleteMany({ targetType: "admin" });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: "warning",
        message: "Keine Admin-Benachrichtigungen gefunden zum Löschen",
      });
    }

    res.status(200).json({
      status: "success",
      message: `${result.deletedCount} Admin-Benachrichtigung(en) gelöscht`,
    });
  } catch (error) {
    console.error("Fehler beim Löschen aller Admin-Benachrichtigungen:", error.message);
    res.status(500).json({ status: "error", message: "Serverfehler" });
  }
});


// Admins

app.get("/api/AdminsDienstNotifications", async (req, res) => {
  try {
    const notifications = await AdminsDienstNotification.find({ targetType: "admin" })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Fehler beim Laden der Benachrichtigungen:", error.message);
    res.status(500).json({ status: "error", message: "Fehler beim Laden" });
  }
});




app.get("/api/AdminsDienstNotifications/count", async (req, res) => {
  try {
    const count = await AdminsDienstNotification.countDocuments({ targetType: "admin" });

    res.status(200).json({ count });
  } catch (error) {
    console.error("Fehler beim Zählen:", error.message);
    res.status(500).json({ status: "error", message: "Fehler beim Zählen" });
  }
});

app.delete("/api/AdminsDienstNotifications/:notificationId", async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ status: "error", message: "notificationId erforderlich" });
    }

    const result = await AdminsDienstNotification.findByIdAndDelete(notificationId);

    if (!result) {
      return res.status(404).json({ status: "error", message: "Nicht gefunden" });
    }

    res.status(200).json({ status: "success", message: "Gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen:", error.message);
    res.status(500).json({ status: "error", message: "Löschen fehlgeschlagen" });
  }
});

app.post("/api/AdminsDienstNotifications", async (req, res) => {
  try {
    const { title, message, senderId } = req.body;

    const newNotification = new AdminsDienstNotification({
      title,
      message,
      senderId,
      targetType: "admin"
    });

    await newNotification.save();

    res.status(201).json(newNotification);
  } catch (error) {
    console.error("Fehler beim Speichern:", error.message);
    res.status(500).json({ status: "error", message: "Speichern fehlgeschlagen" });
  }
});





//Mitarbieter 

 app.get("/api/DienstNotifications/count/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    console.log("Empfangene userId für Count:", userId);

    if (!userId || userId.trim() === "") {
      return res.status(400).json({
        status: "error",
        message: "userId ist erforderlich",
      });
    }

    // 🔢 Zähle ALLE Benachrichtigungen des Users
    const count = await DienstNotification.countDocuments({ userId });

    console.log(`Gesamtzahl der Benachrichtigungen: ${count}`);

    res.status(200).json({ count });
  } catch (error) {
    console.error("Fehler beim Zählen der Benachrichtigungen:", error.message);
    res.status(500).json({ status: "error", message: "Fehler beim Zählen" });
  }
});

app.delete("/api/DienstNotifications/:notificationId", async (req, res) => {
  try {
    const { notificationId } = req.params;

    console.log("Lösche Benachrichtigung mit ID:", notificationId);

    if (!notificationId) {
      return res.status(400).json({
        status: "error",
        message: "notificationId ist erforderlich",
      });
    }

    const result = await DienstNotification.findByIdAndDelete(notificationId);

    if (!result) {
      return res.status(404).json({
        status: "error",
        message: "Benachrichtigung nicht gefunden",
      });
    }

    res.status(200).json({ status: "success", message: "Benachrichtigung gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen der Benachrichtigung:", error.message);
    res.status(500).json({ status: "error", message: "Fehler beim Löschen" });
  }
});




app.get("/anfrage/count", async (req, res) => {
  try {
    const count = await Anfrage.countDocuments({ status: "pending" });
    res.status(200).json({ count }); // besser: json statt send
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Serverfehler" });
  }
});

app.put("/api/users/:userId/push-token", async (req, res) => {
  try {
    console.log("Endpoint /api/users/:userId/push-token wurde aufgerufen");

    const { userId } = req.params;
    const { pushToken } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: "error", message: "Ungültige userId" });
    }

    if (!pushToken || typeof pushToken !== "string") {
      return res.status(400).json({ status: "error", message: "Ungültiges Push-Token" });
    }

    const user = await UserInfo.findById(userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "Benutzer nicht gefunden." });
    }

    if (user.pushToken !== pushToken) {
      user.pushToken = pushToken;
      await UserInfo.updateOne(
  { _id: userId },
  { $set: { pushToken: pushToken } }
);
      console.log("✅ Push-Token erfolgreich gespeichert.");
    } else {
      console.log("ℹ️ Push-Token hat sich nicht geändert.");
    }

    

    res.status(200).json({ status: "ok", pushToken });

  } catch (error) {
    console.error("🚨 Fehler beim Speichern des Push-Tokens:", error.message);
    res.status(500).json({ status: "error", message: "Serverfehler" });
  }
});




// Dienstplan abrufen Mein Dienstplan Seite
app.get('/dienst/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Dienstplan abrufen
    const dienstplan = await Dienstplan.find({ userId });

    // Tauschanfragen des Benutzers abrufen
    const tauschAnfragenList = await TauschAnfrage.find({ userId });

    // Tauschanfragen transformieren
    const tauschAnfragen = {};
    tauschAnfragenList.forEach((anfrage) => {
      if (!tauschAnfragen[anfrage.originalDatum]) {
        tauschAnfragen[anfrage.originalDatum] = [];
      }
      tauschAnfragen[anfrage.originalDatum].push(anfrage.neuerTag);
    });

    // Angebote abrufen
    const angebotTage = await Angebot.find({ userId }).distinct('datum');

    res.status(200).json({
      dienstplan,
      tauschAnfragen,
      angebotTage,
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Dienstplans:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});



app.post('/tausch-anfrage', async (req, res) => {
  const { userId, originalDatum, originalDienst, neuerTag, neuerDienst } = req.body;

  try {
    // 1. Prüfen, ob Benutzer an dem gewünschten neuen Tag selbst einen Dienst hat
    

    // 2. Doppelte Anfragen verhindern
    const existingTarget = await TauschAnfrage.findOne({
      userId,
      originalDatum,
      originalDienst,
      neuerTag,
      neuerDienst,
    });

    if (existingTarget) {
      return res.status(409).json({
        status: 'error',
        message: 'Für diese Kombination wurde bereits eine Tauschanfrage gestellt.',
      });
    }

    // 3. Tauschanfrage speichern
    const neueAnfrage = await TauschAnfrage.create({
      userId,
      originalDatum,
      originalDienst,
      neuerTag,
      neuerDienst,
    });

    // 🔍 Finde alle Benutzer, die am gewünschten Datum und Dienst arbeiten
    const potentialMatches = await Dienstplan.find({
      datum: neuerTag,
      dienst: neuerDienst,
    });

    // Extrahiere userIds der passenden Benutzer
    const potentialUserIds = potentialMatches.map(entry => entry.userId);

    // Hole Benutzer mit Push-Token
    const allUsersWithPushToken = await UserInfo.find({
      _id: { $in: potentialUserIds },
      pushToken: { $exists: true, $ne: null },
      pushToken: /^ExponentPushToken/,
    });

    // 🔔 Für jeden gefundenen Benutzer eine Notification erstellen und senden
    for (const empfänger of allUsersWithPushToken) {
      const notification = await DienstNotification.create({
        userId: empfänger._id,
        title: `Neue Tauschanfrage`,
        message: ` Tauschanfrage am ${originalDatum} (${originalDienst}) gegen deinen Dienst am ${neuerTag} (${neuerDienst}) .`,
      });

      if (empfänger.pushToken) {
        await sendPushNotification(empfänger.pushToken, notification.title, notification.message);
      }
    }

    res.status(201).json({
      status: 'ok',
      message: 'Tauschanfrage gespeichert',
      data: neueAnfrage,
    });

  } catch (error) {
    console.error('Fehler bei der Tauschanfrage:', error);
    res.status(500).json({
      status: 'error',
      message: 'Serverfehler beim Speichern der Tauschanfrage.',
    });
  }
});




app.delete('/dienstplan/:userId/:datum/:dienst', async (req, res) => {
  const { userId, datum, dienst } = req.params;

  try {
    // 1. Dienst löschen
    const deletedDienst = await Dienstplan.findOneAndDelete({
      userId,
      datum,
      type: dienst, // falls das Feld in Dienstplan so heißt
    });

    if (!deletedDienst) {
      return res.status(404).json({
        status: 'error',
        message: 'Dienst nicht gefunden',
      });
    }

    // 2. Zugehörige Tauschanfragen löschen
    const deletedAnfragen = await TauschAnfrage.deleteMany({
      userId,
      originalDatum: datum,
      originalDienst: dienst,
    });

    res.status(200).json({
      status: 'ok',
      message: `Dienst gelöscht. ${deletedAnfragen.deletedCount} zugehörige Tauschanfrage(n) entfernt.`,
    });
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    res.status(500).json({
      status: 'error',
      message: 'Serverfehler beim Löschen',
    });
  }
});





// Route zum Dienst anbieten
app.post('/angebot', async (req, res) => {
  try {
    const { userId, name, surname, datum, dienst } = req.body;

    // Überprüfen, ob die erforderlichen Felder vorhanden sind
    if (!userId || !datum || !dienst) {
      return res.status(400).json({ error: 'userId, datum und dienst sind erforderlich.' });
    }

    // Benutzerdaten aus der Datenbank abrufen
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    // Standardwerte setzen
    const finalName = name || user.name;
    const finalSurname = surname || user.surname;

    // Neues Angebot speichern
    const neuesAngebot = new Angebot({
      userId,
      name: finalName,
      surname: finalSurname,
      datum,
      dienst,
    });
    await neuesAngebot.save();

    // 🔔 Benachrichtigung NUR an Mitarbeiter senden
    const allMitarbeiter = await UserInfo.find({
      userType: "mitarbeiter",
      pushToken: { $exists: true, $ne: null }
    });

    for (const empfänger of allMitarbeiter) {
      const notification = await DienstNotification.create({
        userId: empfänger._id,
        title: `Neues Angebot verfügbar`,
        message: `Dienst am ${datum} (${dienst}) ist jetzt im Angebot.`,
      });

      if (empfänger.pushToken && empfänger.pushToken.startsWith("ExponentPushToken")) {
        await sendPushNotification(empfänger.pushToken, notification.title, notification.message);
      }
    }

    res.status(201).json({ message: 'Angebot erfolgreich erstellt.' });

  } catch (error) {
    console.error('Fehler beim Erstellen des Angebots:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});







//Admins Dienstplan

app.get('/get-users', async (req, res) => {
  try {
    const users = await User.find();
    res.json({ data: users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Dienstplan eines Users abrufen
app.get('/get-dienstplan/:userId', async (req, res) => {
  try {
    const dienstplaene = await Dienstplan.find({ userId: req.params.userId });
    res.json({ data: dienstplaene });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});


// Backend-Route (z.B. in app.js oder einem Router)
app.get('/dienst/for-date/:datum', async (req, res) => {
  try {
    const { datum } = req.params;

    // Hole alle Dienste für das gegebene Datum
    const dienste = await mongoose.model("Dienstplan").find({ datum }).populate('userId', 'name surname');

    if (!dienste || dienste.length === 0) {
      return res.json({ data: {} });
    }

    // Gruppiere nach Diensttyp und sammle Namen
    const grouped = dienste.reduce((acc, entry) => {
      if (!acc[entry.dienst]) {
        acc[entry.dienst] = [];
      }
      acc[entry.dienst].push(`${entry.userId.name} ${entry.userId.surname}`);
      return acc;
    }, {});

    res.json({ data: grouped });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// Dienst aktualisieren
app.put('/update-dienstplan/:dienstplanId', async (req, res) => {
  try {
    const { dienst } = req.body;

    // 🔍 Finde den alten Dienstplan-Eintrag vor der Änderung
    const dienstplanEintrag = await Dienstplan.findById(req.params.dienstplanId);

    if (!dienstplanEintrag) {
      return res.status(404).json({ error: 'Dienstplan-Eintrag nicht gefunden.' });
    }

    const userId = dienstplanEintrag.userId;
    const datum = dienstplanEintrag.datum;
    const alterDienst = dienstplanEintrag.dienst;

    // ✏️ Aktualisiere den Dienst
    await Dienstplan.findByIdAndUpdate(req.params.dienstplanId, { dienst });

    // 📣 Optional: Nur senden, wenn sich etwas geändert hat
    if (alterDienst !== dienst) {
      // 🔔 Erstelle Notification
      const notification = await DienstNotification.create({
        userId,
        title: 'Dienst geändert',
        message: `Dein Dienst am ${datum} wurde geändert von "${alterDienst}" auf "${dienst}".`,
      });

      // 🔔 Hole Push-Token
      const userInfo = await UserInfo.findOne({ _id: userId });

      if (userInfo?.pushToken && userInfo.pushToken.startsWith("ExponentPushToken")) {
        await sendPushNotification(userInfo.pushToken, notification.title, notification.message);
      }
    }

    res.json({ message: 'Dienst erfolgreich aktualisiert' });

  } catch (error) {
    console.error('Fehler beim Aktualisieren des Dienstplans:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Dienstplans' });
  }
});

// Dienst löschen
app.delete('/delete-dienstplan/:dienstplanId', async (req, res) => {
  try {
    const dienstplanId = req.params.dienstplanId;

    // 🔍 Dienst holen, bevor er gelöscht wird
    const dienst = await Dienstplan.findById(dienstplanId);
    if (!dienst) {
      return res.status(404).json({ error: 'Dienst nicht gefunden' });
    }

    const { userId, datum, dienst: dienstName } = dienst;

    // ✅ Dienst löschen
    await Dienstplan.findByIdAndDelete(dienstplanId);

    // 📣 Benutzerdaten laden für Name und Push-Token
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    const fullName = `${user.name} ${user.surname}`;

    // 🔔 Optional: Notification speichern
    const notification = await DienstNotification.create({
      userId,
      title: 'Dienst gelöscht',
      message: `Dein Dienst "${dienstName}" am ${datum} wurde aus dem Dienstplan entfernt.`,
    });

    // 🔔 Push-Token laden
    const userInfo = await UserInfo.findOne({ _id: userId });

    if (userInfo?.pushToken && userInfo.pushToken.startsWith("ExponentPushToken")) {
      await sendPushNotification(userInfo.pushToken, notification.title, notification.message);
    }

    res.json({ message: 'Dienst erfolgreich gelöscht und Benutzer benachrichtigt' });

  } catch (error) {
    console.error('Fehler beim Löschen des Dienstplans:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen des Dienstplans' });
  }
});

// Dienst erstellen (NEU)
// Dienst erstellen (NEU)
app.post('/create-dienstplan', async (req, res) => {
  try {
    const { userId, datum, dienst } = req.body;

    // ✅ Neuen Dienst erstellen
    const neuerDienst = new Dienstplan({ userId, datum, dienst });
    await neuerDienst.save();

    // 📣 Hole Benutzer für Name und Push-Token
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    const fullName = `${user.name} ${user.surname}`;

    // 🔔 Erstelle Notification
    const notification = await DienstNotification.create({
      userId,
      title: 'Neuer Dienst ',
      message: `Neuer Dienst "${dienst}" am ${datum} in deinem Dienstplaan.`,
    });

    // 🔔 Push-Token laden
    const userInfo = await UserInfo.findOne({ _id: userId });

    if (userInfo?.pushToken && userInfo.pushToken.startsWith("ExponentPushToken")) {
      await sendPushNotification(userInfo.pushToken, notification.title, notification.message);
    }

    res.json({ message: 'Dienst erfolgreich erstellt' });

  } catch (error) {
    console.error('Fehler beim Erstellen des Dienstplans:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen des Dienstplans' });
  }
});


app.post('/many-create-dienstplan', async (req, res) => {
  try {
    const diensteArray = req.body; // Erwartet: Array von Objekten mit userId, datum, dienst

    if (!Array.isArray(diensteArray)) {
      return res.status(400).json({ error: 'Es muss ein Array übergeben werden.' });
    }

    const erstellteDienste = [];

    for (const { userId, datum, dienst } of diensteArray) {
      // ✅ Neuen Dienst erstellen
      const neuerDienst = new Dienstplan({ userId, datum, dienst });
      await neuerDienst.save();
      erstellteDienste.push(neuerDienst);

     
    }

    res.json({ message: `${erstellteDienste.length} Dienste erfolgreich erstellt` });

  } catch (error) {
    console.error('Fehler beim Erstellen der Dienstpläne:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen der Dienstpläne' });
  }
});











// Route zum Tauschscreen

app.get("/tausch-anfragen/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Überprüfen, ob die Benutzer-ID gültig ist
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: "error", message: "Ungültige Benutzer-ID" });
    }

    console.log("Benutzer-ID:", userId); // Debugging-Log

    // Tauschanfragen des Benutzers aus der Datenbank abrufen
    const tauschAnfragen = await TauschAnfrage.find({ userId })
      .select("-__v") // Optionale: Entfernen des "__v"-Feldes
      .lean(); // Optimierung: Rückgabe als einfaches Objekt

    console.log("Abgerufene Tauschanfragen:", tauschAnfragen); // Debugging-Log

    // Erfolgreiche Antwort
    res.status(200).json({ status: "ok", data: tauschAnfragen });
  } catch (error) {
    console.error("Fehler beim Abrufen der Tauschanfragen:", error.message);
    res.status(500).json({ status: "error", message: `Interner Serverfehler: ${error.message}` });
  }
});

app.delete('/tausch-anfragen/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Überprüfen, ob die ID gültig ist
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Ungültige Anfrage-ID" });
    }

    console.log("Anfrage-ID zum Löschen:", id); // Debugging-Log

    // Tauschanfrage löschen
    const deletedRequest = await TauschAnfrage.findByIdAndDelete(id);

    if (!deletedRequest) {
      return res.status(404).json({ status: "error", message: "Tauschanfrage nicht gefunden." });
    }

    console.log("Gelöschte Tauschanfrage:", deletedRequest); // Debugging-Log

    // Erfolgreiche Antwort
    res.status(200).json({ status: "ok", message: "Tauschanfrage erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen der Tauschanfrage:", error.message);
    res.status(500).json({ status: "error", message: `Interner Serverfehler: ${error.message}` });
  }
});


app.get('/alle-tausch-anfragen', async (req, res) => {
  try {
    // Alle Tauschanfragen aus der Datenbank abrufen
    const tauschAnfragen = await TauschAnfrage.find({})
      .select("-__v") // Optionale: Entfernen des "__v"-Feldes
      .lean(); // Optimierung: Rückgabe als einfaches Objekt

    console.log("Alle Tauschanfragen:", tauschAnfragen); // Debugging-Log

    // Für jede Tauschanfrage den Benutzer finden und die Daten hinzufügen
    const enrichedData = await Promise.all(
      tauschAnfragen.map(async (anfrage) => {
        const benutzer = await User.findById(anfrage.userId)
          .select("name surname userId ") // Fügen Sie "surname" hinzu
          .lean(); // Rückgabe als einfaches Objekt
        return {
          ...anfrage,
          benutzer: benutzer || { name: "Unbekannt", surname: "", userId: anfrage.userId } // Fallback
        };
      })
    );

    // Erfolgreiche Antwort
    res.status(200).json({ status: "ok", data: enrichedData });
  } catch (error) {
    console.error("Fehler beim Abrufen aller Tauschanfragen:", error.message);
    res.status(500).json({ status: "error", message: `Interner Serverfehler: ${error.message}` });
  }
});



app.get('/meine-tausch-anfragen-count', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ status: "error", message: "Benutzer-ID erforderlich" });
    }

    // Dienstplan des Benutzers abrufen
    const dienstplanResponse = await axios.get(`http://10.130.156.144:5001/dienst/${userId}`);
    const { dienstplan } = dienstplanResponse.data;

    // Alle Tauschanfragen abrufen
    const alleTauschAnfragenResponse = await axios.get(`http://10.130.156.144:5001/alle-tausch-anfragen`);
    const alleTauschAnfragen = alleTauschAnfragenResponse.data.data;

    // Filterfunktion wie im Frontend duplizieren
    const filterMatchingTauschAnfragen = (dienstplan, allTauschAnfragen) => {
      const dienstplanDetails = dienstplan.map((eintrag) => ({
        datum: eintrag.datum,
        dienst: eintrag.dienst,
      }));
      return allTauschAnfragen.filter((anfrage) =>
        dienstplanDetails.some(
          (eintrag) => eintrag.datum === anfrage.neuerTag && eintrag.dienst === anfrage.neuerDienst
        )
      );
    };

    const filteredAndereTauschAnfragen = filterMatchingTauschAnfragen(dienstplan, alleTauschAnfragen);

    // Nur die Anzahl zurückgeben
    res.status(200).json({
      status: "ok",
      count: filteredAndereTauschAnfragen.length,
    });
  } catch (error) {
    console.error("Fehler beim Abrufen der Tauschanfragencount:", error.message);
    res.status(500).json({ status: "error", message: `Interner Serverfehler: ${error.message}` });
  }
});



// Tauschanfrage annehmen
app.post("/accept-tausch-anfrage", async (req, res) => {
  try {
    const {
      anfrageId,
      currentUserId,     // nimmt den Dienst an
      targetUserId,      // hat die Anfrage gestellt
      originalDatum,
      neuerTag,
      originalDienst,
      neuerDienst
    } = req.body;

    console.log("📥 Eingehende Daten:", req.body);

    if (
      !anfrageId ||
      !currentUserId ||
      !targetUserId ||
      !originalDatum ||
      !neuerTag ||
      !originalDienst ||
      !neuerDienst
    ) {
      return res.status(400).send({ status: "error", message: "Fehlende Felder in der Anfrage." });
    }


    // Zusatzprüfung: Hat der Nutzer an neuerTag bereits einen *anderen* Dienst?
        const conflict = await Dienstplan.findOne({
      userId: currentUserId,
      datum: neuerTag,
      dienst: { $ne: neuerDienst }
       });

      if (conflict) {
     return res.status(400).send({
      status: "error",
       message: "Der User hat an diesem Tag bereits einen anderen Dienst und kann die Anfrage nicht annehmen."
     });
      }

    




    // Markiere Anfrage als akzeptiert
    await TauschAnfrage.findByIdAndUpdate(anfrageId, { status: "accepted" });

    // Neue Diensteinträge erzeugen
    const dienst1 = await Dienstplan.create({
      userId: currentUserId,
      datum: originalDatum,
      dienst: originalDienst
    });

    const dienst2 = await Dienstplan.create({
      userId: targetUserId,
      datum: neuerTag,
      dienst: neuerDienst
    });

    // Ursprüngliche Dienste löschen
    await Dienstplan.findOneAndDelete({
      userId: currentUserId,
      datum: neuerTag,
      dienst: neuerDienst
    });

    await Dienstplan.findOneAndDelete({
      userId: targetUserId,
      datum: originalDatum,
      dienst: originalDienst
    });

    // ✅ Speichere als angenommene Tauschanfrage
    await AngenommeneTauschanfrage.create({
      initiatorId: targetUserId,       // ursprünglicher Antragsteller
      targetUserId: currentUserId,     // der es angenommen hat
      originalDatum,
      neuerTag,
      originalDienst,
      neuerDienst
    });


    // ✅ Speichere als angenommene Tauschanfrage
await AngenommeneTauschanfrage.create({
  initiatorId: targetUserId,       // ursprünglicher Antragsteller
  targetUserId: currentUserId,     // der es angenommen hat
  originalDatum,
  neuerTag,
  originalDienst,
  neuerDienst
});


// 📣 Benachrichtigung für den ursprünglichen Anfragenden (targetUserId)
const currentUser = await User.findById(currentUserId); // Person, die angenommen hat
const targetUser = await User.findById(targetUserId);   // Person, die die Anfrage gestellt hat

if (!currentUser || !targetUser) {
  return res.status(404).json({ status: "error", message: "Benutzer nicht gefunden" });
}

const fullName = `${currentUser.name} ${currentUser.surname}`;

// 🔔 Erstelle Notification für targetUserId
const notification = await DienstNotification.create({
  userId: targetUserId,
  title: 'Tauschanfrage angenommen',
  message: `Deine Tauschanfrage wurde von ${fullName} angenommen.`,
});

// 🔔 Hole Push-Token des Empfängers
const userInfo = await UserInfo.findOne({ _id: targetUserId });

if (userInfo?.pushToken && userInfo.pushToken.startsWith("ExponentPushToken")) {
  await sendPushNotification(userInfo.pushToken, notification.title, notification.message);
}




    // Entferne Anfrage komplett
    // Entferne Anfrage komplett
await TauschAnfrage.findByIdAndDelete(anfrageId);

// Andere offene Tauschanfragen für denselben Dienst des Antragstellers löschen
await TauschAnfrage.deleteMany({
  userId: targetUserId,
  originalDatum,
  originalDienst,
  _id: { $ne: anfrageId }, // die bereits angenommene Anfrage ausschließen
});

// 👇 Benachrichtige alle Admins über die erfolgreiche Tauschannahme
const initiator = await User.findById(targetUserId);
const accepter = await User.findById(currentUserId);

if (!initiator || !accepter) {
  return res.status(404).json({ status: "error", message: "Benutzer nicht gefunden" });
}

const title = "Tauschanfrage erfolgreich angenommen";
const message = `${initiator.name} ${initiator.surname} hat erfolgreich mit ${accepter.name} ${accepter.surname} getauscht.`;

// Alle Admins laden
const admins = await UserInfo.find({ userType: "admin" });

for (const admin of admins) {
  // 🔹 Speichere in AdminsDienstNotification Collection
  await AdminsDienstNotification.create({
    userId: admin._id,
    title,
    message,
    targetType: "admin",
    senderId: currentUserId, // optional: wer war am Tausch beteiligt
    meta: {
      type: "tausch",
      tauschPartner1: initiator._id,
      tauschPartner2: accepter._id,
      datumOriginal: originalDatum,
      datumNeu: neuerTag,
      dienstOriginal: originalDienst,
      dienstNeu: neuerDienst,
    }
  });

  // 🔹 Sende Push-Benachrichtigung, falls Token vorhanden
  if (admin.pushToken && admin.pushToken.startsWith("ExponentPushToken")) {
    await sendPushNotification(admin.pushToken, title, message);
  }
}

    return res.status(200).json({
  status: "ok",
  message: "Tauschanfrage erfolgreich angenommen und dokumentiert.",
  data: [dienst1, dienst2]
});
  } catch (error) {
    console.error("❌ Fehler beim Akzeptieren der Tauschanfrage:", error);
    return res.status(500).send({
      status: "error",
      message: "Ein interner Fehler ist aufgetreten."
    });
  }
});




// GET /admin/angemommene-tauschanfragen
app.get('/admin/angemommene-tauschanfragen', async (req, res) => {
  try {
    const tauschanfragen = await AngenommeneTauschanfrage.find()
      .populate('initiatorId', 'name surname')
      .populate('targetUserId', 'name surname');

    res.status(200).json(tauschanfragen);
  } catch (error) {
    console.error('Fehler beim Abrufen der angemommenen Tauschanfragen:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

app.get('/admin/angemommene-tauschanfragen/count', async (req, res) => {
  try {
    const count = await AngenommeneTauschanfrage.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.delete('/admin/angemommene-tauschanfragen/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AngenommeneTauschanfrage.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ message: 'Anfrage nicht gefunden' });
    }

    res.json({ message: 'Tauschanfrage erfolgreich gelöscht.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interner Serverfehler' });
  }
});











// Route zu Uebername

// Endpunkt: Alle Angebote abrufen
app.get('/angebote', async (req, res) => {
  try {
    const alleAngebote = await Angebot.find();
    res.status(200).json({ angebote: alleAngebote });
  } catch (error) {
    console.error('Fehler beim Abrufen der Angebote:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// Endpunkt: Anzahl der Angebote abrufen
app.get('/angebote/count', async (req, res) => {
  try {
    const count = await Angebot.countDocuments(); // oder .estimatedDocumentCount() je nach Anwendungsfall
    res.status(200).json({ count });
  } catch (error) {
    console.error('Fehler beim Abrufen der Anzahl Angebote:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// Route: Angebot löschen
app.delete('/angebot/:id', async (req, res) => {
  try {
    const angebotId = req.params.id;
    const deletedAngebot = await Angebot.findByIdAndDelete(angebotId);
    if (!deletedAngebot) {
      return res.status(404).json({ error: 'Angebot nicht gefunden.' });
    }
    res.status(200).json({ message: 'Angebot erfolgreich gelöscht.' });
  } catch (error) {
    console.error('Fehler beim Löschen des Angebots:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// Route: Meine Angebote abrufen
app.get('/angebot/meine/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const meineAngebote = await Angebot.find({ userId });
    res.status(200).json(meineAngebote);
  } catch (error) {
    console.error('Fehler beim Abrufen der eigenen Angebote:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// Route: Angebot annehmen
// Route: Angebot annehmen
app.post('/angebot/annehmen/:id', async (req, res) => {
  try {
    const angebotId = req.params.id;
    const { userId: annehmenderUserId } = req.body;

    console.log('Angebot ID:', angebotId);
    console.log('Annehmender User ID:', annehmenderUserId);

    // Finde das Angebot
    const angebot = await Angebot.findById(angebotId);
    if (!angebot) {
      console.error('Angebot nicht gefunden:', angebotId);
      return res.status(404).json({ error: 'Angebot nicht gefunden.' });
    }

    const anbietenderUserId = angebot.userId;
    const anbietenderUserIdObj = new mongoose.Types.ObjectId(anbietenderUserId);
    const annehmenderUserIdObj = new mongoose.Types.ObjectId(annehmenderUserId);
    const datumDesAngebots = angebot.datum;

    // ✅ Hole genau den Dienstplan-Eintrag des Anbietenden
    const dienstplanAnbietender = await Dienstplan.findOne({
      userId: anbietenderUserIdObj,
      datum: datumDesAngebots,
      dienst: angebot.dienst,
    });

    if (!dienstplanAnbietender) {
      console.error('Passender Dienstplan-Eintrag des Anbietenden nicht gefunden.');
      return res.status(404).json({ error: 'Dienstplan-Eintrag des Anbietenden nicht gefunden.' });
    }

    // ❌ Prüfung: Hat der Annehmende bereits einen Dienst am selben Tag?
    const vorhandenerDienstAmTag = await Dienstplan.findOne({
      userId: annehmenderUserIdObj,
      datum: datumDesAngebots,
    });

    if (vorhandenerDienstAmTag) {
      console.warn('User hat bereits einen Dienst am selben Tag:', datumDesAngebots);
      return res.status(409).json({
        error: 'User hat bereits einen Dienst an diesem Tag.',
      });
    }

    // ✅ Lösche Dienstplan-Eintrag des Anbietenden
    await Dienstplan.deleteOne({ _id: dienstplanAnbietender._id });
    console.log('Dienstplan-Eintrag des Anbietenden gelöscht.');

    // ✅ Erstelle neuen Eintrag für den Annehmenden
    await Dienstplan.create({
      userId: annehmenderUserIdObj,
      datum: datumDesAngebots,
      dienst: angebot.dienst,
    });
    console.log('Neuer Dienstplan-Eintrag für den Annehmenden erstellt.');

    // ✅ Speichere erfolgreiche Übernahme
await DienstUebernahme.create({
  anbietenderUserId: anbietenderUserIdObj,
  annehmenderUserId: annehmenderUserIdObj,
  datum: datumDesAngebots,
  dienst: angebot.dienst,
});

// 👇 Benachrichtige alle Admins über die erfolgreiche Dienstübernahme
const anbietenderUser = await User.findById(anbietenderUserIdObj);
const annehmenderUserForAdmin = await User.findById(annehmenderUserIdObj);

if (!anbietenderUser || !annehmenderUserForAdmin) {
  console.warn('Ein oder mehrere Benutzer nicht gefunden für Admin-Benachrichtigung.');
} else {
  const title = "Dienstübernahme erfolgreich";
  const message = `${annehmenderUserForAdmin.name} ${annehmenderUserForAdmin.surname} hat den Dienst „${angebot.dienst}“ am ${new Date(datumDesAngebots).toLocaleDateString()} von ${anbietenderUser.name} ${anbietenderUser.surname} übernommen.`;

  const admins = await UserInfo.find({ userType: "admin" });

  for (const admin of admins) {
    await AdminsDienstNotification.create({
      userId: admin._id,
      title,
      message,
      targetType: "admin",
      senderId: annehmenderUserIdObj,
      meta: {
        type: "uebernahme",
        anbietenderUserId: anbietenderUserIdObj,
        annehmenderUserId: annehmenderUserIdObj,
        datum: datumDesAngebots,
        dienst: angebot.dienst
      }
    });

    if (admin.pushToken && admin.pushToken.startsWith("ExponentPushToken")) {
      await sendPushNotification(admin.pushToken, title, message);
    }
  }

  console.log('Admins wurden über die erfolgreiche Dienstübernahme benachrichtigt.');
}
    console.log('Dienstübernahme protokolliert.');

    // ✅ Lösche das Angebot
    await Angebot.findByIdAndDelete(angebotId);
    console.log('Angebot erfolgreich gelöscht.');


    // 📣 Zusatz: Benachrichtigung an Anbietenden
    const annehmenderUser = await User.findById(annehmenderUserIdObj);
    if (!annehmenderUser) {
      console.warn('Annehmender Benutzer nicht gefunden:', annehmenderUserIdObj);
    } else {
      const fullName = `${annehmenderUser.name} ${annehmenderUser.surname}`;

      const notification = await DienstNotification.create({
        userId: anbietenderUserIdObj,
        title: 'Angebot angenommen',
        message: `Dein Angebot am ${datumDesAngebots} wurde von ${fullName} angenommen.`,
      });

      const userInfo = await UserInfo.findOne({ _id: anbietenderUserIdObj });
      if (userInfo?.pushToken && userInfo.pushToken.startsWith("ExponentPushToken")) {
        await sendPushNotification(userInfo.pushToken, notification.title, notification.message);
      }
    }


    // ✅ Erfolgsmeldung
    res.status(200).json({ message: 'Dienst erfolgreich übernommen und übertragen.' });

  } catch (error) {
    console.error('Fehler beim Annehmen des Angebots:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});


// Backend: /admin/uebernahmen/count

// 1. Liefert alle Übernahmen
app.get('/admin/uebernahmen', async (req, res) => {
  try {
    const uebernahmen = await DienstUebernahme.find()
      .populate('anbietenderUserId', 'name surname')
      .populate('annehmenderUserId', 'name surname');

    res.status(200).json(uebernahmen);
  } catch (error) {
    console.error('Fehler beim Abrufen der Übernahmen:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// 2. Liefert Anzahl der noch nicht dokumentierten Übernahmen

app.get('/admin/uebernahmen/count', async (req, res) => {
  try {
    const count = await DienstUebernahme.countDocuments({
      $or: [
        { dokumentiert: false },
        { dokumentiert: null },
        { dokumentiert: undefined }
      ]
    });
     // Oder filtern nach Nicht-dokumentiert, falls gewünscht
    res.status(200).json({ count });
  } catch (error) {
    console.error('Fehler beim Abrufen der Übernahmeanzahl:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});


app.patch('/admin/uebernahmen/:id', async (req, res) => {
  try {
    const { dokumentiert } = req.body;
    const update = await DienstUebernahme.findByIdAndUpdate(
      req.params.id,
      { dokumentiert },
      { new: true }
    );
    res.status(200).json(update);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});

app.delete('/admin/uebernahmen/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const geloescht = await DienstUebernahme.findByIdAndDelete(id);

    if (!geloescht) {
      return res.status(404).json({ error: 'Übernahme nicht gefunden.' });
    }

    res.status(200).json({ message: 'Übernahme als dokumentiert markiert und gelöscht.' });
  } catch (error) {
    console.error('Fehler beim Löschen der Übernahme:', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});





// Server starten


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



