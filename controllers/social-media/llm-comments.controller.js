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
  // Industry/sub-industry sentiment distribution from llm_comments
  getIndustrySubIndustrySentimentDistribution:
    llmCommentsSentimentTrendController.getLlmCommentsIndustrySubIndustrySentimentDistribution,
  // Industry/sub-industry emotion distribution from llm_comments
  getIndustrySubIndustryEmotionDistribution:
    llmCommentsSentimentTrendController.getLlmCommentsIndustrySubIndustryEmotionDistribution,
};

module.exports = llmCommentsController;

