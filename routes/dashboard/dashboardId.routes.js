const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const prisma = require('../../config/database');


// Fetch topics
router.get('/topics/:id',authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid ID' })

  try {
    const topicData = await prisma.customer_topics.findUnique({
      where: { topic_id: id }
    })
    res.json(topicData)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Fetch categories
router.get('/categories/:id',authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid ID' })

  try {
    const categoryData = await prisma.topic_categories.findMany({
      where: { customer_topic_id: id }
    })
    res.json(categoryData)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Fetch country list
router.get('/countries',authMiddleware, async (req, res) => {
  try {
    const countryList = await prisma.countries_list.findMany({
      select: { country_name: true },
      orderBy: { country_name: 'asc' }
    })
    res.json(countryList)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

module.exports = router; 