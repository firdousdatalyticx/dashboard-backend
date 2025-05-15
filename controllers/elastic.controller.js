const { elasticClient } = require("../config/elasticsearch");
const express = require('express');
const router = express.Router();
const elasticSearchFunction = async (body) => {

    try {
      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX, 
        body: body
      })
  
      return response
    } catch (error) {
      console.error('Elasticsearch count error:', error)
      throw error
    }
  }

  const elasticController = {
    
    elasticSearch: async (req, res) => {
      try {
      const response =  await elasticSearchFunction(req.body);
        return res.status(200).json(response);
  
      } catch (error) {
          console.error("Error fetching data:", error);
          return res.status(500).json({ error: "Internal server error" });
      }
  }
}

module.exports = elasticController; 