const { createPartFromUri, GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

// === CONFIG ===
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = "https://generativelanguage.googleapis.com";

// Check if API key is available
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

// === 1️⃣ Start resumable upload ===
async function startResumableUpload(filePath, displayName, mimeType) {
  console.log("Starting uploading");

  const fileSize = fs.statSync(filePath).size;

  const res = await axios.post(
    `${BASE_URL}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      file: { display_name: displayName },
    },
    {
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileSize,
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
    }
  );

  const uploadUrl = res.headers["x-goog-upload-url"];

  if (!uploadUrl) throw new Error("No upload URL returned from Gemini.");
  return { uploadUrl, fileSize };
}

// === 2️⃣ Upload file bytes with progress ===
async function uploadFileWithProgress(filePath, uploadUrl, fileSize) {
  const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 }); // 8MB chunks
  let offset = 0;
  console.log("UPloading file with progress");

  for await (const chunk of stream) {
    // Determine if this is the last chunk
    const isLastChunk = offset + chunk.length === fileSize;

    await axios.put(uploadUrl, chunk, {
      headers: {
        "Content-Length": chunk.length,
        "X-Goog-Upload-Offset": offset,
        "X-Goog-Upload-Command": isLastChunk ? "upload, finalize" : "upload",
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    offset += chunk.length;
    const progress = ((offset / fileSize) * 100).toFixed(2);
    process.stdout.write(`Uploading: ${progress}%\r`);
  }

  console.log("\nUpload complete!");
}

// Create Chat
const createChat = async (videoUrl = null, videoMetadata = null, isFile = false, mimeType = "video/mp4") => {
  console.log("Now in gemini create chat");

  let fileData;

  if (isFile) {
    try {
      // Upload the file to Gemini
      const uploadedFile = await ai.files.upload({
        file: videoUrl,
        config: { mimeType: mimeType },
      });
      console.log("File Uploaded to gemini");
      fileData = createPartFromUri(uploadedFile.uri, uploadedFile.mimeType);
    } catch (e) {
      console.log("Error in uploading file, falling back to URL approach", e);
      // Fallback: use the file path as URL (for local files)
      fileData = createPartFromUri(`file://${videoUrl}`, mimeType);
    } finally {
      // Clean up the uploaded file
      fs.unlink(videoUrl, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });
    }
  } else {
    // For URL-based videos, pass the URL directly
    fileData = createPartFromUri(videoUrl, "video/mp4");
  }

  console.log("Creating chat with video data");

  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: `You are an expert video analyst. You have access to the video and its metadata.
  Only provide detailed analysis when the user asks a question about the video.
  Do not analyze the video unless prompted. Answer clearly and concisely based on the user's questions.`,
    },
    history: [
      {
        role: "user",
        parts: [
          fileData,
          {
            text: `Video metadata: ${JSON.stringify(videoMetadata)}`,
          },
        ],
      },
    ],
  });
  return chat;
};

// Send Message for specific chat
const sendChatMessage = async (chat, message) => {
  try {
    const response = await chat.sendMessageStream({
      message,
    });
    return response;
  } catch (e) {
    console.log("Error in generating response from gemini api", e);
    throw new Error("Something went wrong while generating response. Please try again");
  }
};

const analyzeVideo = async (videoUrl, message) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        fileData: {
          fileUri: videoUrl,
        },
      },
      { text: message || "Please summarize the video in 3 sentences." },
    ],
  });

  return response;
};

module.exports = {
  startResumableUpload,
  uploadFileWithProgress,
  createChat,
  sendChatMessage,
  analyzeVideo
};