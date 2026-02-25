const cron = require("node-cron");
const axios = require("axios");
console.log("cron job started")
// Run every day at 11 PM

module.exports.Index = async () => {
cron.schedule("0 23 * * *", async () => {
  try {
    console.log("Running Employee Leaderboard Cron...");

    const today = new Date();

    const toDate = today.toISOString().split("T")[0];

    // subtract 1 month
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const fromDate = from.toISOString().split("T")[0];
    const topicId = 2648;
    const isCreateOrUpdateCpx = true;
    const payload1 = {
      topicId,
      fromDate,
      toDate,
      categoryItems: [],
      needCommentsData: false,
      isCSV: false,
      isCreateOrUpdateCpx,
    };

    const payload2 = {
      topicId,
      sentimentType: "",
      fromDate,
      toDate,
      categoryItems: [],
      needCommentsData: false,
      isCSV: false,
      isCreateOrUpdateCpx,
    };

    // Call First API
    await axios.post(
      `${process.env.BACKEND_SERVER}/social-media/employee-engagement-leaderboard/getEmployeeData`,
      payload1,
    );

    // Call Second API
    await axios.post(
      `${process.env.BACKEND_SERVER}/social-media/employee-engagement-leaderboard/get`,
      payload2,
    );

    console.log("Cron executed successfully");
  } catch (error) {
    console.error("Cron Error:", error.message);
  }
});
}
