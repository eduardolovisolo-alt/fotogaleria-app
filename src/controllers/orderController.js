const orderModel = require('../models/orderModel');
const galleryModel = require('../models/galleryModel');
const selectionModel = require('../models/selectionModel');
const photoModel = require('../models/photoModel');
const userModel = require('../models/userModel');
const {
  sendOrderNotificationToPhotographer,
  sendOrderConfirmationToClient,
} = require('../utils/mailer');

const { sameId } = require('../utils/ids');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function withItems(orders) {
  const items = await orderModel.findItemsByOrderIds(orders.map((order) => order.id));
  const byOrder = {};
  items.forEach((item) => {
    byOrder[item.order_id] = byOrder[item.order_id] || [];
    byOrder[item.order_id].push({
      photoId: item.photo_id,
      fileName: item.file_name,
      price: item.price,
    });
  });
  return orders.map((order) => ({ ...order, items: byOrder[order.id] || [] }));
}

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
      discountTiers: gallery.discount_tiers,
    });

    let photoNames = [];
    try {
      const photos = await photoModel.findByIds(photoIds);
      photoNames = photos.map((p) => p.file_name);
    } catch (photosErr) {
      console.error('order photos error:', photosErr);
    }

    try {
      const photographer = await userModel.findById(gallery.admin_id);
      const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL || photographer?.email;

      if (notifyEmail) {
        await sendOrderNotificationToPhotographer({
          to: notifyEmail,
          photographerName: photographer?.name,
          clientName: order.client_name,
          clientEmail: order.client_email,
          clientPhone: order.client_phone,
          order,
          gallery,
          photoNames,
          adminUrl: `${appBaseUrl(req)}/admin-gallery.html?slug=${gallery.slug}`,
        });
      }

      await sendOrderConfirmationToClient({
        to: order.client_email,
        clientName: order.client_name,
        order,
        gallery,
        photoNames,
      });
    } catch (notifyErr) {
      console.error('order notify error:', notifyErr);
    }

    res.status(201).json({
      order,
      photos: photoNames,
      galleryName: gallery.name,
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ error: 'Error al generar el pedido.' });
  }
}

async function listGalleryOrders(req, res) {
  try {
    const key = req.params.id || req.params.slug;
    let gallery = req.gallery || await galleryModel.findById(key);
    if (!gallery) gallery = await galleryModel.findBySlug(key);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }
    const orders = await withItems(await orderModel.findByGallery(gallery.id));
    res.json({ orders });
  } catch (err) {
    console.error('listGalleryOrders error:', err);
    res.status(500).json({ error: 'Error al listar los pedidos.' });
  }
}

async function listMyOrders(req, res) {
  try {
    const user = await userModel.findById(req.user.sub);
    const autoDays = Number(user?.order_auto_delete_days) || 0;
    if (autoDays > 0) {
      await orderModel.deleteCancelledOlderThan(req.user.sub, autoDays);
    }
    const orders = await withItems(await orderModel.findByAdmin(req.user.sub));
    res.json({
      orders,
      settings: { cancelAutoDeleteDays: autoDays || 0 },
    });
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
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const { status } = req.body;
    if (!['pending', 'paid', 'shipped', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const updated = await orderModel.updateStatus(order.id, status);
    res.json({ order: updated });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ error: 'Error al actualizar el pedido.' });
  }
}

async function deleteOrder(req, res) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    const gallery = await galleryModel.findById(order.gallery_id);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    await orderModel.deleteById(order.id);
    res.json({ message: 'Pedido eliminado.' });
  } catch (err) {
    console.error('deleteOrder error:', err);
    res.status(500).json({ error: 'Error al eliminar el pedido.' });
  }
}

async function updateOrderSettings(req, res) {
  try {
    const days = req.body.cancelAutoDeleteDays;
    const user = await userModel.updateOrderAutoDeleteDays(req.user.sub, days);
    res.json({
      settings: { cancelAutoDeleteDays: Number(user.order_auto_delete_days) || 0 },
    });
  } catch (err) {
    console.error('updateOrderSettings error:', err);
    res.status(500).json({ error: 'Error al guardar la configuración de pedidos.' });
  }
}

module.exports = {
  createOrder,
  listGalleryOrders,
  listMyOrders,
  updateOrderStatus,
  deleteOrder,
  updateOrderSettings,
};
