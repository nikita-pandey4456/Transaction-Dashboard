const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const cors = require('cors'); 

const app = express();
app.use(cors({ origin: '*' }));
const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb://localhost:27017/test', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;

const transactionSchema = new mongoose.Schema({
    id: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    sold: {
      type: Boolean,
      required: true,
    },
    dateOfSale: {
      type: Date,
      required: true,
    },
  });
  
  // Model based on the schema
  const Transaction = mongoose.model('Transaction', transactionSchema);
  

app.get('/api/initialize-database', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const seedData = response.data;

    await Transaction.insertMany(seedData);

    res.json({ success: true, message: 'Database initialized with seed data.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error initializing database.' });
  }
});

app.get('/api/transactions', async (req, res) => {
    try {
      const { page = 1, perPage = 10, search = '' } = req.query;

      const query = search
        ? {
            $or: [
              { 'product.title': { $regex: search, $options: 'i' } },
              { 'product.description': { $regex: search, $options: 'i' } },
              { 'product.price': { $regex: search, $options: 'i' } },
            ],
          }
        : {};
  
      const transactions = await Transaction.find(query)
        .skip((page - 1) * perPage)
        .limit(perPage);
  
      res.json({ success: true, transactions });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error fetching transactions.' });
    }
  });
  
app.get('/api/statistics', async (req, res) => {
    try {
      const { month } = req.query;
  
      const startDate = new Date(`${month}-01T00:00:00.000Z`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
  
      const totalSaleAmount = await Transaction.aggregate([
        { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]);
  
      const totalSoldItems = await Transaction.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
      });
  
      const totalNotSoldItems = await Transaction.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
        sold: false,
      });
  
      res.json({
        success: true,
        totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].total : 0,
        totalSoldItems,
        totalNotSoldItems,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error calculating statistics.' });
    }
  });  
  
  // API for bar chart
app.get('/api/bar-chart', async (req, res) => {
    try {
      const { month } = req.query;
  
      const priceRanges = [
        { min: 0, max: 100 },
        { min: 101, max: 200 },
        { min: 201, max: 300 },
        { min: 301, max: 400 },
        { min: 401, max: 500 },
        { min: 501, max: 600 },
        { min: 601, max: 700 },
        { min: 701, max: 800 },
        { min: 801, max: 900 },
        { min: 901, max: Infinity },
      ];
  
      const barChartData = await Promise.all(
        priceRanges.map(async (range) => {
          const count = await Transaction.countDocuments({
            dateOfSale: {
              $gte: new Date(`${month}-01T00:00:00.000Z`),
              $lt: new Date(`${month}-31T23:59:59.999Z`),
            },
            'price': { $gte: range.min, $lt: range.max },
          });
  
          return { range, count };
        })
      );
  
      res.json({ success: true, barChartData });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error generating bar chart data.' });
    }
  });
  
  
  // API for pie chart
  app.get('/api/pie-chart', async (req, res) => {
    try {
      const { month } = req.query;
  
      const categoriesData = await Transaction.aggregate([
        { $match: { dateOfSale: { $regex: `${month}-`, $options: 'i' } } },
        { $group: { _id: '$product.category', count: { $sum: 1 } } },
      ]);
  
      const pieChartData = categoriesData.map(({ _id, count }) => ({ category: _id, count }));
  
      res.json({ success: true, pieChartData });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error generating pie chart data.' });
    }
  });
  
  // API to fetch and combine data from all APIs
  app.get('/api/combined-data', async (req, res) => {
    try {
      const { month } = req.query;
  
      // Fetch data from each API endpoint
      const initializeDatabaseResponse = await axios.get('http://localhost:3000/api/initialize-database');
      const transactionsResponse = await axios.get(`http://localhost:3000/api/transactions?month=${month}`);
      const statisticsResponse = await axios.get(`http://localhost:3000/api/statistics?month=${month}`);
      const barChartResponse = await axios.get(`http://localhost:3000/api/bar-chart?month=${month}`);
      const pieChartResponse = await axios.get(`http://localhost:3000/api/pie-chart?month=${month}`);
  
      // Combine responses
      const combinedData = {
        initializeDatabase: initializeDatabaseResponse.data,
        transactions: transactionsResponse.data,
        statistics: statisticsResponse.data,
        barChart: barChartResponse.data,
        pieChart: pieChartResponse.data,
      };
  
      res.json({ success: true, combinedData });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error fetching combined data.' });
    }
  });
    
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
