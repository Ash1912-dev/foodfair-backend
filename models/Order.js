const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: String,
  name: String,
  email: String,
  phone: String,
  items: Array,
  total: Number,
  timestamp: Date,
  served: { type: Boolean, default: false },
  paid: { type: Boolean, default: false },
  closed: { type: Boolean, default: false }
});

module.exports = mongoose.model('Order', orderSchema);
