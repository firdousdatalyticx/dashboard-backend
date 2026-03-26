const llmCommentsSentimentTrendController = require("./llm-comments-sentiment-trend.controller");

const llmCommentsController = {
  // First endpoint under the generic llm-comments controller
  getSentimentTrend: llmCommentsSentimentTrendController.getLlmCommentsSentimentTrend,
  // Emotion trend endpoint
  getEmotionTrend: llmCommentsSentimentTrendController.getLlmCommentsEmotionTrend,
  // Sentiment counts (for comments)
  getSentimentCounts:
    llmCommentsSentimentTrendController.getLlmCommentsSentimentCounts,
  // Emotion counts (for comments)
  getEmotionCounts:
    llmCommentsSentimentTrendController.getLlmCommentsEmotionCounts,
  // Drill-down endpoint (chart onClick)
  getCommentsOnClick: llmCommentsSentimentTrendController.getLlmCommentsOnClick,
  // Donut dataset endpoint (chart by source)
  getCommentsSourceDonut:
    llmCommentsSentimentTrendController.getLlmCommentsSourceDonut,
};

module.exports = llmCommentsController;

