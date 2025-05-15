const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const alertsController = {

    ReadUpdateDeleteNotifications: async (req, res) => {
        try {
            const { id, count, read, readAll, isDeleted, user_id } = req.query
        
            if (count) {
              const totalUnreadCount = await prisma.notification.count({
                where: { idRead: false }
              })
              return res.status(200).json({ totalUnreadCount })
            }
        
            if (readAll) {
              const notification = await prisma.notification.updateMany({
                where: {
                  idRead: false
                },
                data: {
                  idRead: true
                }
              })
              return res.status(200).json({ notification })
            }
        
            if (id && isDeleted) {
              const notificationId = parseInt(id)
              if (!notificationId) {
                return res.status(400).json({ error: 'Invalid ID' })
              }
        
              const notification = await prisma.notification.delete({
                where: { id: notificationId }
              })
              return res.status(200).json({ notification })
            }
        
            if (id) {
              const notificationId = parseInt(id)
              if (!notificationId) {
                return res.status(400).json({ error: 'Invalid ID' })
              }
        
              if (read) {
                await prisma.notification.update({
                  where: {
                    id: notificationId
                  },
                  data: {
                    idRead: true
                  }
                })
              }
        
              const notification = await prisma.notification.findUnique({
                where: { id: notificationId },
                include: { alert: true }
              })
              return res.status(200).json({ notification })
            }
        
            if (!user_id) {
              return res.status(400).json({ error: 'User ID is required' })
            }
        
            const notifications = await prisma.notification.findMany({
              where: {
                alert: {
                  user_id: parseInt(user_id)
                }
              },
              include: {
                alert: true
              },
              orderBy: { createdAt: 'desc' }
            })
        
            return res.status(200).json({ notifications })
          } catch (error) {
            if (error.message.includes('Maximum call stack size exceeded')) {
              return res.status(500).json({ error: 'Maximum call stack size exceeded' })
            }
        
            console.error('Internal server error:', error)
            return res.status(500).json({ error: 'Internal server error' })
          }
    }
}

module.exports = alertsController; 