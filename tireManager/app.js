require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require("cookie-parser");




// Import routes
const tireRoutes = require('./routes/tires');
const vehicleRoutes = require('./routes/vehicles');
const inventoryRoutes = require('./routes/inventory');
const supplierRoutes = require('./routes/suppliers');
const movementRoutes = require('./routes/movements');
const authRoutes = require('./routes/auth');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cookieParser());

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000", 
    credentials: true,               
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tires', tireRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.options("*", cors());


app.listen(PORT, () => {
    console.log(`Tire Management System running on port ${PORT}`);
    console.log(`API Base URL: http://localhost:${PORT}/api`);
});

module.exports = app;