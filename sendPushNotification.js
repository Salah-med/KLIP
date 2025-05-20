// sendPushNotification.js
const { default: fetch } = require("node-fetch");

const sendPushNotification = async (pushToken, title, message) => {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.warn("Ungültiger Push-Token:", pushToken);
    return;
  }

  const payload = {
    to: pushToken,
    sound: "default",
    title: title,
    body: message,
    data: { screen: "notifications" },
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📬 Push Notification gesendet:", result);
  } catch (error) {
    console.error("❌ Fehler beim Senden der Push Notification:", error.message);
  }
};

module.exports = sendPushNotification;
