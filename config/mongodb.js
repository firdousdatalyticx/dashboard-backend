const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const connectionString = process.env.MONGODB_URI || "mongodb://datalyticxmongo:rl4C5oEvYKjUDFyEBl3o65XFdl8OyTUZvbz6jo3zoPwFUIjDdsZMMIgXuMol9kQNlNi7HPLVNSBgACDbAuFbFg%3D%3D@datalyticxmongo.mongo.cosmos.azure.com:10255/?ssl=true&retrywrites=false&maxIdleTimeMS=120000&appName=@datalyticxmongo@";
        
        await mongoose.connect(connectionString, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('MongoDB Connected Successfully');

        // Create default customer if not exists
        const Customer = require('../models/Customer');
        const defaultCustomer = await Customer.findOne({ customerId: '453' });

        console.log(defaultCustomer);

        if (!defaultCustomer) {
            await Customer.create({
                customerId: '453',
                name: 'Meezan Bank',
                email: 'demo@meezanbank.com',
                status: 'active'
            });
            console.log('Default customer created');
        }
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB; 