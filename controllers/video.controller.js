const { createChatSession, getChatSession } = require("../helpers/chatSessionHelper");
const { upload } = require("../middleware/image_upload");
const { authenticateUserToken } = require("../middleware/user.auth.token");
const { createChat, sendChatMessage } = require("../services/ai/gemini_agent");

/**
 * Video Controller
 * Handles video analysis and chat functionality
 */
const videoController = {
  /**
   * Analyze video (URL or uploaded file)
   * POST /api/video/analyze
   * body: { videoUrl, type = "url" } or multipart/form-data with file
   */
  analyzeVideo: async (req, res) => {
    try {
      console.log("Analyze Request");

      const { videoUrl, type = "url" } = req.body;

      let videoMetadata = null;
      let filePath = null;

      if (type === "url") {
        if (!videoUrl) {
          return res.status(400).json({ error: "videoUrl is required" });
        }
        // videoMetadata = await getVideoMetadata(videoUrl);
        // if (!videoMetadata) {
        //   return res.status(400).json({ error: "Invalid Url, Please enter a valid youtube video url" });
        // }
      } else if (type === "file") {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        filePath = req.file.path;


        // Optionally add basic metadata for uploaded file
        videoMetadata = {
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      } else {
        return res.status(400).json({ error: "Invalid type. Must be 'url' or 'file'" });
      }

      const chat = await createChat(videoUrl || filePath, videoMetadata, type === "file", req?.file?.mimetype);
      const chatId = createChatSession(chat);

      res.status(200).json({
        chatId,
        message: "Video analyzed and chat created",
        videoMetadata,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to analyze video" });
    }
  },

  /**
   * Chat about analyzed video
   * GET /api/video/chat?chatId=xxx&message=xxx
   */
  chatWithVideo: async (req, res) => {
    try {
      const { chatId, message } = req.query;

      // Set headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!chatId || !message) {
        res.write(`data: ${JSON.stringify({ error: "chatId and message are required" })}\n\n`);
        res.end();
        return;
      }

      const chat = getChatSession(chatId);

      if (!chat) {
        res.write(`data: ${JSON.stringify({ error: "Chat session not found" })}\n\n`);
        res.end();
        return;
      }

      const response = await sendChatMessage(chat, message);

      for await (const chunk of response) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
        }
      }
      // End of stream
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) {
      console.error(err);
      res.write(`data: ${JSON.stringify({ error: err.message || "Failed to send message" })}\n\n`);
      res.end();
    }
  }
};

module.exports = videoController;



const { createPartFromUri, GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");

// Try to load YouTube downloader, but make it optional
let ytdl = null;
try {
  ytdl = require("@distube/ytdl-core");
} catch (error) {
  console.warn("YouTube downloader not available. YouTube URLs will use direct URL approach (may be slower).");
  console.warn("To enable faster YouTube processing, install: npm install @distube/ytdl-core");
}

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

function isYouTubeUrl(url) {
  if (!url || !ytdl) return false;
  try {
    return ytdl.validateURL(url);
  } catch {
    return false;
  }
}

async function downloadYouTubeToTempFile(videoUrl) {
  if (!ytdl) {
    throw new Error("YouTube downloader not available");
  }

  // Write to temp so we can upload to Gemini like a normal file (fast subsequent chats)
  const tmpFilePath = path.join(os.tmpdir(), `yt-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);

  try {
    // Get video info first to validate URL
    const info = await ytdl.getInfo(videoUrl);
    
    // Prefer a format that includes both audio+video in mp4 container when possible.
    // If YouTube only provides separate streams, ytdl-core will still download the chosen stream;
    // Gemini can still analyze video content even without audio for many cases, but audio may be missing.
    const stream = ytdl.downloadFromInfo(info, {
      quality: "highest",
      filter: (format) => format.hasVideo && format.container === "mp4"
    });

    await pipeline(stream, fs.createWriteStream(tmpFilePath));
    return tmpFilePath;
  } catch (error) {
    // Clean up temp file if it was created
    if (fs.existsSync(tmpFilePath)) {
      fs.unlinkSync(tmpFilePath);
    }
    throw error;
  }
}

// Create Chat
const createChat = async (videoUrl = null, videoMetadata = null, isFile = false, mimeType = "video/mp4") => {
  console.log("Now in gemini create chat");

  let fileData;

  // If it's a YouTube URL, download once and upload to Gemini so chat stays fast.
  // This makes URL flow behave like file-upload flow.
  let tempDownloadedPath = null;
  let effectiveIsFile = isFile;
  let effectivePathOrUrl = videoUrl;
  let effectiveMimeType = mimeType;

  if (!isFile && isYouTubeUrl(videoUrl)) {
    console.log("Detected YouTube URL. Downloading to temp file for faster chat...");
    try {
      tempDownloadedPath = await downloadYouTubeToTempFile(videoUrl);
      effectiveIsFile = true;
      effectivePathOrUrl = tempDownloadedPath;
      effectiveMimeType = "video/mp4";
      console.log("YouTube video downloaded successfully. Will upload to Gemini for faster chat.");
    } catch (error) {
      console.error("Failed to download YouTube video:", error.message);
      console.log("Falling back to direct URL approach (may be slower for chat)...");
      // Fallback: use URL directly (slower but works)
      // Don't set effectiveIsFile, keep using URL approach
    }
  }

  if (effectiveIsFile) {
    try {
      // Upload the file to Gemini
      const uploadedFile = await ai.files.upload({
        file: effectivePathOrUrl,
        config: { mimeType: effectiveMimeType },
      });
      console.log("File Uploaded to gemini");
      fileData = createPartFromUri(uploadedFile.uri, uploadedFile.mimeType);
    } catch (e) {
      console.log("Error in uploading file, falling back to URL approach", e);
      // Fallback: use the file path as URL (for local files)
      fileData = createPartFromUri(`file://${effectivePathOrUrl}`, effectiveMimeType);
    } finally {
      // Clean up the uploaded file
      if (tempDownloadedPath) {
        fs.unlink(tempDownloadedPath, (err) => {
          if (err) console.error("Failed to delete temp YouTube file:", err);
        });
      } else if (isFile) {
        fs.unlink(videoUrl, (err) => {
          if (err) console.error("Failed to delete temp file:", err);
        });
      }
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

/**
 * Extract retry delay from Gemini API rate limit error
 */
function extractRetryDelay(error) {
  try {
    if (error.status === 429 || error.code === 429) {
      // Try to parse the error message which contains JSON
      const errorMessage = error.message || JSON.stringify(error);
      
      // Pattern 1: Look for "Please retry in X.XXXXXXs" in the message
      const retryInMatch = errorMessage.match(/Please retry in ([\d.]+)s/i);
      if (retryInMatch) {
        const delaySeconds = parseFloat(retryInMatch[1]);
        return Math.ceil(delaySeconds * 1000); // Convert to milliseconds
      }
      
      // Pattern 2: Look for retryDelay in JSON structure
      const retryDelayMatch = errorMessage.match(/"retryDelay":\s*"([\d.]+)s"/);
      if (retryDelayMatch) {
        const delaySeconds = parseFloat(retryDelayMatch[1]);
        return Math.ceil(delaySeconds * 1000);
      }
      
      // Pattern 3: Try to parse the full JSON error structure
      try {
        const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const retryInfo = parsed?.error?.details?.find(d => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
          if (retryInfo?.retryDelay) {
            // retryDelay might be in seconds as string "18s" or as number
            const delay = typeof retryInfo.retryDelay === 'string' 
              ? parseFloat(retryInfo.retryDelay.replace('s', ''))
              : retryInfo.retryDelay;
            return Math.ceil(delay * 1000);
          }
        }
      } catch (jsonParseError) {
        // Continue to fallback
      }
    }
  } catch (parseError) {
    console.error("Error parsing retry delay:", parseError);
  }
  
  // Default retry delay: 20 seconds
  return 20000;
}

/**
 * Sleep utility function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send Message for specific chat with rate limit retry logic
const sendChatMessage = async (chat, message, maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chat.sendMessageStream({
        message,
      });
      return response;
    } catch (e) {
      lastError = e;
      
      // Check if it's a rate limit error (429)
      if (e.status === 429 || e.code === 429) {
        const retryDelay = extractRetryDelay(e);
        
        if (attempt < maxRetries) {
          console.log(`Rate limit exceeded. Retrying after ${retryDelay / 1000}s (attempt ${attempt + 1}/${maxRetries + 1})...`);
          await sleep(retryDelay);
          continue; // Retry
        } else {
          // Max retries reached
          console.error("Rate limit error after max retries:", e);
          throw new Error(`Rate limit exceeded. Please wait a moment and try again. The API quota has been reached.`);
        }
      } else {
        // Not a rate limit error, throw immediately
        console.error("Error in generating response from gemini api", e);
        throw new Error("Something went wrong while generating response. Please try again");
      }
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error("Failed to send message after retries");
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