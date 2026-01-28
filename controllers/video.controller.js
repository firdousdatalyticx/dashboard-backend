const { createChatSession, getChatSession } = require("../helpers/chatSessionHelper");
const { upload } = require("../middleware/image_upload");
const { authenticateUserToken } = require("../middleware/user.auth.token");
const { createChat, sendChatMessage } = require("../services/ai/gemini_agent.js");
const prisma = require("../config/database");

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
      const user = req.user;

      // Check if video analyzer is enabled for this customer
      if (!user.enabledVideoAnalyzer) {
        return res.status(403).json({
          success: false,
          error: "Video analyzer is not enabled for your account. Please contact support to enable this feature."
        });
      }

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
        success: true,
        chatId,
        message: "Video analyzed and chat created",
        videoMetadata
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
      const user = req.user;
      const TOKEN_COST_QUESTION = 10;

      // Set headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!chatId || !message) {
        res.write(`data: ${JSON.stringify({ error: "chatId and message are required" })}\n\n`);
        res.end();
        return;
      }

      // Check token balance if mode is LIMITED (case-insensitive)
      if (user.tokenMode && user.tokenMode.toUpperCase() === "LIMITED") {
        const currentBalance = user.tokenBalance || 0;
        
        if (currentBalance < TOKEN_COST_QUESTION) {
          res.write(`data: ${JSON.stringify({ 
            error: "Insufficient token balance. You need 10 tokens to ask a question. Please contact support to add more tokens.",
            tokenBalance: currentBalance,
            requiredTokens: TOKEN_COST_QUESTION
          })}\n\n`);
          res.end();
          return;
        }
      }

      const chat = getChatSession(chatId);

      if (!chat) {
        res.write(`data: ${JSON.stringify({ error: "Chat session not found" })}\n\n`);
        res.end();
        return;
      }

      const response = await sendChatMessage(chat, message);

      // Track if we've sent at least one chunk (to know if message was successful)
      let messageSent = false;

      for await (const chunk of response) {
        if (chunk.text) {
          messageSent = true;
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
        }
      }

      // Deduct tokens after successful message (only if LIMITED mode and message was sent)
      if (user.tokenMode && user.tokenMode.toUpperCase() === "LIMITED" && messageSent) {
        try {
          const currentBalance = user.tokenBalance || 0;
          const newBalance = Math.max(0, currentBalance - TOKEN_COST_QUESTION);
          
          await prisma.customers.update({
            where: {
              customer_id: user.customerId
            },
            data: {
              customer_token_balance: newBalance
            }
          });
        } catch (tokenError) {
          console.error("Error deducting tokens:", tokenError);
          // Continue even if token deduction fails, but log it
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


