// import { serve } from "bun";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LINE_ACCESS_TOKEN;

const handleWebhook = async (req: any) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  if (req.body.events[0].type === "message") {
    // You must stringify reply token and message data to send to the API server

    const message = req.body.events[0].message.text;

    const result = await model.generateContent(message);
    const geResponse = await result.response;
    const text = geResponse.text();

    const messages = text.split("\n").map((item) => ({
      type: "text",
      text: item,
    }));
    const dataString = JSON.stringify({
      // Define reply token
      replyToken: req.body.events[0].replyToken,
      messages,
      // Define reply messages
      // messages: [
      //   {
      //     type: "text",
      //     text: "Hello, user",
      //   },
      //   {
      //     type: "text",
      //     text: "May I help you?",
      //   },
      // ],
    });

    // Request header. See Messaging API reference for specification
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + TOKEN,
    };

    // Options to pass into the request, as defined in the http.request method in the Node.js documentation
    const webhookOptions = {
      hostname: "api.line.me",
      path: "/v2/bot/message/reply",
      method: "POST",
      headers: headers,
      body: dataString,
    };

    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      body: dataString,
      headers,
    });
  }
  return new Response(JSON.stringify(req), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};

Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const { method } = request;
    const { pathname } = new URL(request.url);

    if (method === "POST" && pathname === "/webhook") {
      const req = await request.json();
      return handleWebhook(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Listening on http://localhost:${PORT} ...`);
