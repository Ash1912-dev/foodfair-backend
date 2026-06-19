const MenuItem = require('./models/MenuItem');
const Setting = require('./models/Setting');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const Order = require('./models/Order');
const app = express();

// Wrap existing HTTP server with Socket.IO
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });
io.on('connection', (socket) => {
  socket.on('join_order', (orderId) => socket.join(`order_${orderId}`));
});

// Middleware
app.use(cors());    
app.use(express.json());

// ✅ MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// ✅ Root route to confirm backend works
app.get('/', (req, res) => {
  res.send('🎉 Funfair backend is running!');
});

// ✅ Get current ordering status
app.get('/api/settings', async (req, res) => {
  let setting = await Setting.findOne();
  if (!setting) {
    setting = await Setting.create({ allowOrdering: true });
  }
  res.json({ allowOrdering: setting.allowOrdering });
});

// ✅ Update ordering status
app.post('/api/settings', async (req, res) => {
  const { allowOrdering } = req.body;
  let setting = await Setting.findOne();
  if (!setting) {
    setting = new Setting({ allowOrdering });
  } else {
    setting.allowOrdering = allowOrdering;
  }
  await setting.save();
  res.json({ allowOrdering });
});

// Already at top:
require('dotenv').config();

// New route below your existing API routes
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (username === adminUser && password === adminPass) {
    res.json({ message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});


// POST: Create a new order
app.post('/api/orders', async (req, res) => {
  try {
    const { orderId, name, email, phone, items, total, timestamp } = req.body;

    const newOrder = new Order({
      orderId,
      name,
      items,
      total,
      timestamp,
      served: false,
      paid: false,
      closed: false
    });
    await newOrder.save();
    io.emit('new_order', { orderId, status: 'Pending', items, customerName: name });
    res.status(201).json({ message: 'Order saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save order' });
  }
});

// ✅ Fetch all orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ timestamp: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// PATCH: Update order status (served, paid, closed)
app.patch('/api/orders/:id', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, req.body);
    const updatedOrder = await Order.findById(req.params.id);
    const newStatus = Object.keys(req.body)[0]; 
    io.to(`order_${updatedOrder.orderId}`).emit('order_status_updated', { orderId: updatedOrder.orderId, newStatus });
    res.json({ message: 'Order updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ✅ Clear all orders
app.delete('/api/orders', async (req, res) => {
  try {
    await Order.deleteMany({});
    res.json({ message: 'All orders cleared' });
  } catch (err) {
    console.error('❌ Error clearing orders:', err);
    res.status(500).json({ error: 'Failed to clear orders' });
  }
});

// Get all menu items
app.get('/api/menu', async (req, res) => {
  const items = await MenuItem.find();
  res.json(items);
});

// Add new item
app.post('/api/menu', async (req, res) => {
  const item = new MenuItem(req.body);
  await item.save();
  res.status(201).json({ message: 'Item added' });
});

// Update item
app.put('/api/menu/:id', async (req, res) => {
  await MenuItem.findByIdAndUpdate(req.params.id, req.body);
  res.json({ message: 'Item updated' });
});

// Delete item
app.delete('/api/menu/:id', async (req, res) => {
  await MenuItem.findByIdAndDelete(req.params.id);
  res.json({ message: 'Item deleted' });
});

// Daily report endpoint
const { Parser } = require('json2csv');

app.get('/api/reports/daily/export', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await Order.find({ timestamp: { $gte: today } });

    const flatData = [];

    orders.forEach(order => {
      order.items.forEach(item => {
        flatData.push({
          orderId: order.orderId || '',
          customerName: order.name || '',
          itemName: item.name || '',
          quantity: item.quantity || 0,
          price: item.price || 0,
          itemTotal: (item.quantity && item.price) ? item.quantity * item.price : 0,
          total: order.total || 0,
          timestamp: new Date(order.timestamp).toLocaleString('en-IN'),
          served: order.served ? 'Yes' : 'No',
          paid: order.paid ? 'Yes' : 'No',
          closed: order.closed ? 'Yes' : 'No'
        });
      });
    });

    const fields = [
      { label: 'Order ID', value: 'orderId' },
      { label: 'Customer Name', value: 'customerName' },
      { label: 'Item Name', value: 'itemName' },
      { label: 'Quantity', value: 'quantity' },
      { label: 'Price', value: 'price' },
      { label: 'Item Total', value: 'itemTotal' },
      { label: 'Total Bill', value: 'total' },
      { label: 'Timestamp', value: 'timestamp' },
      { label: 'Served', value: 'served' },
      { label: 'Paid', value: 'paid' },
      { label: 'Closed', value: 'closed' }
    ];

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(flatData);

    res.header('Content-Type', 'text/csv');
    res.attachment(`daily-report-${today.toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error("❌ CSV Export Error:", err);
    res.status(500).json({ error: "Failed to export daily report" });
  }
});




// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
