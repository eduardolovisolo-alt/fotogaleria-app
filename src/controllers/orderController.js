const orderModel = require('../models/orderModel');
const galleryModel = require('../models/galleryModel');
const selectionModel = require('../models/selectionModel');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createOrder(req, res) {
  try {
    const gallery = req.gallery;
    const { clientToken, clientName, clientEmail, clientPhone } = req.body;

    if (!clientToken || !clientName || !clientEmail) {
      return res.status(400).json({ error: 'Nombre, email y selección son obligatorios.' });
    }
    if (!EMAIL_RE.test(clientEmail)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const photoIds = await selectionModel.findByClient(gallery.id, clientToken);
    if (!photoIds.length) {
      return res.status(400).json({ error: 'No seleccionaste ninguna foto todavía.' });
    }

    const order = await orderModel.create({
      galleryId: gallery.id,
      clientToken,
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone ? clientPhone.trim() : null,
      photoIds,
      pricePerPhoto: gallery.price_per_photo,
    });

    res.status(201).json({ order });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ error: 'Error al generar el pedido.' });
  }
}

async function listGalleryOrders(req, res) {
  try {
    const gallery = await galleryModel.findById(req.params.id);
    if (!gallery || gallery.admin_id !== req.user.sub) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }
    const orders = await orderModel.findByGallery(gallery.id);
    res.json({ orders });
  } catch (err) {
    console.error('listGalleryOrders error:', err);
    res.status(500).json({ error: 'Error al listar los pedidos.' });
  }
}

async function listMyOrders(req, res) {
  try {
    const orders = await orderModel.findByAdmin(req.user.sub);
    res.json({ orders });
  } catch (err) {
    console.error('listMyOrders error:', err);
    res.status(500).json({ error: 'Error al listar los pedidos.' });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    const gallery = await galleryModel.findById(order.gallery_id);
    if (!gallery || gallery.admin_id !== req.user.sub) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const { status } = req.body;
    if (!['pending', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const updated = await orderModel.updateStatus(order.id, status);
    res.json({ order: updated });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ error: 'Error al actualizar el pedido.' });
  }
}

module.exports = { createOrder, listGalleryOrders, listMyOrders, updateOrderStatus };
