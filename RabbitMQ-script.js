require("dotenv").config();
const amqp = require("amqplib");
const prisma = require("./config/database");

// RabbitMQ connection configuration
const rabbitConfig = {
  hostname: "74.162.40.87",
  port: 5672,
  username: "datalyticx",
  password: "datalyticxDXB@25!",
  vhost: "/",
};

// Queue configuration
const queueName = "data_requests";

// Helper function to safely split and clean data
function safeSplit(str, delimiter = ",") {
  if (!str || str.trim() === "") return [];
  return str
    .split(delimiter)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Fetch all keywords, hashtags, and URLs for a given topic ID
 * @param {number} topicId - The topic ID to fetch data for
 * @returns {Object} Object containing arrays of keywords, hashtags, and URLs
 */
async function fetchTopicData(topicId) {
  try {
    console.log(`Fetching data for topic ID: ${topicId}`);

    // Fetch categories for the topic - explicitly select only needed columns
    const categoryData = await prisma.topic_categories.findMany({
      where: {
        customer_topic_id: Number(topicId),
      },
      select: {
        topic_urls: true,
        topic_keywords: true,
        topic_hash_tags: true,
      },
    });

    if (!categoryData || categoryData.length === 0) {
      console.log(`No categories found for topic ID: ${topicId}`);
      return {
        keywords: [],
        hashtags: [],
        urls: [],
        queries: [],
      };
    }

    // Collect all unique keywords, hashtags, and URLs
    const allKeywords = new Set();
    const allHashtags = new Set();
    const allUrls = new Set();

    categoryData.forEach((category) => {
      // Process URLs
      const urls = safeSplit(category.topic_urls, ",");
      urls.forEach((url) => {
        if (url.trim()) allUrls.add(url.trim());
      });

      // Process hashtags
      const hashtags = safeSplit(category.topic_hash_tags, ",");
      hashtags.forEach((hashtag) => {
        const cleanHashtag = hashtag.trim();
        if (cleanHashtag) {
          // Add with # if not present
          if (!cleanHashtag.startsWith("#")) {
            allHashtags.add(`#${cleanHashtag}`);
          } else {
            allHashtags.add(cleanHashtag);
          }
        }
      });

      // Process keywords
      const keywords = safeSplit(category.topic_keywords, ",");
      keywords.forEach((keyword) => {
        const cleanKeyword = keyword.trim();
        if (cleanKeyword) {
          // Add the original keyword
          allKeywords.add(cleanKeyword);

          // If keyword doesn't start with #, also add it with # prefix
          if (!cleanKeyword.startsWith("#")) {
            allKeywords.add(`#${cleanKeyword}`);
          }

          // If keyword starts with #, also add it without # for general text matching
          if (cleanKeyword.startsWith("#")) {
            const withoutHash = cleanKeyword.substring(1);
            if (withoutHash.trim()) {
              allKeywords.add(withoutHash.trim());
            }
          }
        }
      });
    });

    // Combine all search terms (keywords + hashtags) for queries
    const allQueries = [...allKeywords, ...allHashtags];

    console.log(
      `Found ${allKeywords.size} keywords, ${allHashtags.size} hashtags, ${allUrls.size} URLs`
    );
    console.log(`Total queries: ${allQueries.length}`);

    return {
      keywords: Array.from(allKeywords),
      hashtags: Array.from(allHashtags),
      urls: Array.from(allUrls),
      queries: allQueries,
    };
  } catch (error) {
    console.error("Error fetching topic data:", error);
    throw error;
  }
}

async function 
publishToQueue(topicId,startDate, endDate) {
  let connection;
  try {
    // Validate topic ID
    if (!topicId) {
      throw new Error("Topic ID is required");
    }

    // Fetch topic data from database
    const topicData = await fetchTopicData(topicId);

    if (topicData.queries.length === 0) {
      throw new Error(
        `No keywords, hashtags, or URLs found for topic ID: ${topicId}`
      );
    }

    // Hardcode date range: Last 90 days
    const now = new Date();
    const startDate90DaysAgo = new Date(now);
    startDate90DaysAgo.setDate(now.getDate() - 90);
    const hardcodedStartDate = startDate90DaysAgo.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    const hardcodedEndDate = now.toISOString().split("T")[0]; // Format as YYYY-MM-DD

    // Build message payload with fetched data
    const messagePayload = {
      queries: topicData.queries, // Comma-separated keywords and hashtags
      start_date: hardcodedStartDate,
      end_date: hardcodedEndDate, // Current date
      source: "Twitter", // Default sources
      request_type: "GET", // POST to initiate collection, GET to collect and dump
    };

    console.log("\n=== Message Payload ===");
    console.log(
      `Queries (${messagePayload.queries.length}):`,
      messagePayload.queries.slice(0, 10),
      "..."
    );
    console.log(
      `Date Range: ${messagePayload.start_date} to ${messagePayload.end_date}`
    );
    console.log(`Sources:`, messagePayload.source);
    console.log(`Request Type: ${messagePayload.request_type}\n`);

    console.log("Attempting to connect to RabbitMQ...");

    // Create RabbitMQ connection
    connection = await amqp.connect({
      protocol: "amqp",
      hostname: rabbitConfig.hostname,
      port: rabbitConfig.port,
      username: rabbitConfig.username,
      password: rabbitConfig.password,
      vhost: rabbitConfig.vhost,
    });

    console.log("Connected to RabbitMQ successfully");

    // Create channel
    const channel = await connection.createChannel();
    console.log("Channel created successfully");

    // Assert queue exists
    await channel.assertQueue(queueName, {
      durable: true,
    });
    console.log("Queue asserted successfully");

    // Convert payload to Buffer
    const message = Buffer.from(JSON.stringify(messagePayload));

    // Publish message
    const result = channel.sendToQueue(queueName, message);
    console.log("Message published to queue successfully");
    console.log("Publish result:", result);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  } finally {
    // Close database connection
    try {
      await prisma.$disconnect();
      console.log("Database connection closed");
    } catch (error) {
      console.error("Error closing database connection:", error);
    }

    // Close RabbitMQ connection if it was established
    if (connection) {
      try {
        setTimeout(async () => {
          await connection.close();
          console.log("RabbitMQ connection closed");
        //   process.exit(0);
        }, 500);
      } catch (error) {
        console.error("Error closing RabbitMQ connection:", error);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
}

// 📆 Generate 10-day ranges
function generateDateRanges() {
  const now = new Date();
  const currentYear = now.getFullYear();
  let startDate = new Date(`${currentYear}-09-15T00:00:00.000Z`);
  const ranges = [];

  while (startDate < now) {
    let endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 10);
    if (endDate > now) endDate = new Date(now);

    ranges.push({
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    });

    startDate = new Date(endDate);
  }

  return ranges;
}

// Main execution
async function main() {
  // Check if topicId is provided as command line argument
  const topicId = process.argv[2];

  if (!topicId) {
    console.error("Error: Topic ID is required");
    console.error("Usage: node RabbitMQ-script.js <topicId>");
    console.error("Example: node RabbitMQ-script.js 2638");
    process.exit(1);
  }

  if (isNaN(Number(topicId))) {
    console.error("Error: Topic ID must be a valid number");
    process.exit(1);
  }

  console.log("Starting RabbitMQ script...");
  console.log(`Topic ID: ${topicId}\n`);

  try {
    // Since dates are hardcoded to last 90 days in publishToQueue, 
    // we can call it directly without date ranges
    await publishToQueue(topicId, null, null);

    process.exit(0);
  } catch (error) {
    console.error("\nScript failed:", error.message);
    process.exit(1);
  }
}

// Run the script
main();

// node RabbitMQ-script.js 2514 && \
// node RabbitMQ-script.js 2515 && \
// node RabbitMQ-script.js 2516 && \
// node RabbitMQ-script.js 2517 && \
// node RabbitMQ-script.js 2518 && \
// node RabbitMQ-script.js 2519 && \
// node RabbitMQ-script.js 2520 && \
// node RabbitMQ-script.js 2522 && \
// node RabbitMQ-script.js 2523 && \
// node RabbitMQ-script.js 2510 && \
// node RabbitMQ-script.js 2534 && \
// node RabbitMQ-script.js 2535 && \
// node RabbitMQ-script.js 2536 && \
// node RabbitMQ-script.js 2537 && \
// node RabbitMQ-script.js 2538 && \
// node RabbitMQ-script.js 2539 && \
// node RabbitMQ-script.js 2540 && \
// node RabbitMQ-script.js 2541 && \
// node RabbitMQ-script.js 2542 && \
// node RabbitMQ-script.js 2585 && \
// node RabbitMQ-script.js 2571
