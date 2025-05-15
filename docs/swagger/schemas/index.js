const socialMediaSchemas = require('./social-media');
const googleSchemas = require('./google');
const topicSchema = require('./topic.schema');
const userSchemas = require('./user.schema');
const authSchemas = require('./auth.schema');
const commonSchemas = require('./common.schema');
const errorsSchemas = require('./errors.schema');
const dashboardSchemas = require('./dashboard/keywords.schema');

module.exports = {
    ...socialMediaSchemas,
    ...googleSchemas,
    topicSchema,
    ...userSchemas,
    ...authSchemas,
    ...commonSchemas,
    ...errorsSchemas,
    ...dashboardSchemas
}; 