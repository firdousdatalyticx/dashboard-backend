const { createChatSession, getChatSession } = require("../helpers/chatSessionHelper");
const { upload } = require("../middleware/image_upload");
const { authenticateUserToken } = require("../middleware/user.auth.token");
const { createChat, sendChatMessage } = require("../services/ai/gemini_agent");
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

      // Save video analysis to database
      const customerId = req.user?.id;
      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }

      const videoAnalysis = await prisma.video_analyses.create({
        data: {
          customer_id: customerId,
          video_url: type === "url" ? videoUrl : null,
          video_file_path: type === "file" ? filePath : null,
          video_type: type,
          video_metadata: videoMetadata ? JSON.parse(JSON.stringify(videoMetadata)) : null,
          chat_id: chatId,
        },
      });

      res.status(200).json({
        chatId,
        videoAnalysisId: videoAnalysis.video_analysis_id,
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
      const { chatId, message, videoAnalysisId } = req.query;

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

      // Save user message to database
      let savedUserMessage = null;
      if (videoAnalysisId) {
        try {
          savedUserMessage = await prisma.video_chat_messages.create({
            data: {
              video_analysis_id: parseInt(videoAnalysisId),
              message: message,
              is_user_message: true,
            },
          });
        } catch (dbError) {
          console.error("Error saving user message:", dbError);
          // Continue even if DB save fails
        }
      }

      const response = await sendChatMessage(chat, message);
      let fullResponse = "";

      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
        }
      }

      // Save AI response to database
      if (videoAnalysisId && fullResponse) {
        try {
          await prisma.video_chat_messages.create({
            data: {
              video_analysis_id: parseInt(videoAnalysisId),
              message: fullResponse, // AI response text
              is_user_message: false,
            },
          });
        } catch (dbError) {
          console.error("Error saving AI response:", dbError);
          // Continue even if DB save fails
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
  },

  /**
   * Get video analysis history for a customer
   * GET /api/video/history
   */
  getVideoHistory: async (req, res) => {
    try {
      const customerId = req.user?.id;
      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }

      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [videoAnalyses, total] = await Promise.all([
        prisma.video_analyses.findMany({
          where: {
            customer_id: customerId,
          },
          orderBy: {
            created_at: "desc",
          },
          skip: skip,
          take: parseInt(limit),
          include: {
            chat_messages: {
              orderBy: {
                created_at: "asc",
              },
              take: 1, // Just get count or first message for preview
            },
          },
        }),
        prisma.video_analyses.count({
          where: {
            customer_id: customerId,
          },
        }),
      ]);

      res.status(200).json({
        data: videoAnalyses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to fetch video history" });
    }
  },

  /**
   * Get chat messages for a specific video analysis
   * GET /api/video/:videoAnalysisId/chat
   */
  getVideoChatHistory: async (req, res) => {
    try {
      const customerId = req.user?.id;
      const { videoAnalysisId } = req.params;

      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }

      // Verify the video analysis belongs to the customer
      const videoAnalysis = await prisma.video_analyses.findFirst({
        where: {
          video_analysis_id: parseInt(videoAnalysisId),
          customer_id: customerId,
        },
      });

      if (!videoAnalysis) {
        return res.status(404).json({ error: "Video analysis not found" });
      }

      const chatMessages = await prisma.video_chat_messages.findMany({
        where: {
          video_analysis_id: parseInt(videoAnalysisId),
        },
        orderBy: {
          created_at: "asc",
        },
      });

      res.status(200).json({
        videoAnalysis,
        chatMessages,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to fetch chat history" });
    }
  },

  /**
   * Get a specific video analysis by ID
   * GET /api/video/:videoAnalysisId
   */
  getVideoAnalysis: async (req, res) => {
    try {
      const customerId = req.user?.id;
      const { videoAnalysisId } = req.params;

      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }

      const videoAnalysis = await prisma.video_analyses.findFirst({
        where: {
          video_analysis_id: parseInt(videoAnalysisId),
          customer_id: customerId,
        },
        include: {
          chat_messages: {
            orderBy: {
              created_at: "asc",
            },
          },
        },
      });

      if (!videoAnalysis) {
        return res.status(404).json({ error: "Video analysis not found" });
      }

      res.status(200).json(videoAnalysis);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to fetch video analysis" });
    }
  }
};

module.exports = videoController;