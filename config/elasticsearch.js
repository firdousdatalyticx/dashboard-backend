const { Client } = require('@elastic/elasticsearch');

// const client = new Client({
//     node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
//     auth: {
//         username: process.env.ELASTICSEARCH_USERNAME,
//         password: process.env.ELASTICSEARCH_PASSWORD
//     },
//     tls: {
//         rejectUnauthorized: false
//     }
// });




const elasticClient = new Client({
  node: `http://${process.env.ELASTICSEARCH_HOST ??
    (() => {
      throw new Error('Missing ELASTICSEARCH_HOST')
    })()
    }`,
  auth: {
    username:
      process.env.ELASTICSEARCH_USER ??
      (() => {
        throw new Error('Missing ELASTICSEARCH_USER')
      })(),
    password:
      process.env.ELASTICSEARCH_PASS ??
      (() => {
        throw new Error('Missing ELASTICSEARCH_PASS')
      })()
  },
  tls: {
    rejectUnauthorized: false // Set to true if SSL certificate is trusted
  }
})



module.exports = { elasticClient };    