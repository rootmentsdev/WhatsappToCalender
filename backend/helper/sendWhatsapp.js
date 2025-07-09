async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const token = process.env.ACCESS_TOKEN;

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
}
