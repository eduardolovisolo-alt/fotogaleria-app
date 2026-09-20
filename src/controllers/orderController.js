const orderModel = require('../models/orderModel');
const galleryModel = require('../models/galleryModel');
const selectionModel = require('../models/selectionModel');
const photoModel = require('../models/photoModel');
const userModel = require('../models/userModel');
const {
  sendOrderNotificationToPhotographer,
  sendOrderConfirmationToClient,
} = require('../utils/mailer');
const { withDownloadUrls, signedOriginalDownloadUrl } = require('./photoController');
const {
  pinsMatch,
  normalizePin,
  canDownloadStatus,
  orderDownloadUrl,
  publicOrderView,
  isUnlockBlocked,
  registerUnlockFailure,
  clearUnlockFailures,
} = require('../utils/orderAccess');

const { sameId } = require('../utils/ids');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || '';
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

async function photosForOrder(order) {
  if (Number(order.full_gallery) === 1) {
    return photoModel.findByGallery(order.gallery_id);
  }
  const items = await orderModel.findItemsByOrderIds([order.id]);
  const photos = await photoModel.findByIds(items.map((item) => item.photo_id));
  const byId = new Map(photos.map((photo) => [Number(photo.id), photo]));
  return items.map((item) => byId.get(Number(item.photo_id))).filter(Boolean);
}

async function photoBelongsToOrder(order, photoId) {
  const photo = await photoModel.findById(photoId);
  if (!photo || photo.gallery_id !== order.gallery_id) return null;
  if (Number(order.full_gallery) === 1) return photo;
  const items = await orderModel.findItemsByOrderIds([order.id]);
  return items.some((item) => Number(item.photo_id) === Number(photo.id)) ? photo : null;
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

    const downloadUrl = orderDownloadUrl(appBaseUrl(req), order.download_token);

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
        downloadUrl,
      });
    } catch (notifyErr) {
      console.error('order notify error:', notifyErr);
    }

    res.status(201).json({
      order,
      photos: photoNames,
      galleryName: gallery.name,
      downloadUrl,
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

async function updateOrder(req, res) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    const gallery = await galleryModel.findById(order.gallery_id);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const { status, fullGallery } = req.body;
    let updated = order;

    if (status !== undefined) {
      if (!['pending', 'paid', 'shipped', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }
      updated = await orderModel.updateStatus(order.id, status);
    }

    if (fullGallery !== undefined) {
      updated = await orderModel.updateFullGallery(order.id, !!fullGallery);
    }

    res.json({ order: updated });
  } catch (err) {
    console.error('updateOrder error:', err);
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

async function getDownloadByToken(req, res) {
  try {
    const order = await orderModel.findByDownloadToken(req.params.token);
    if (!order) {
      return res.status(404).json({ error: 'No encontramos ese pedido.' });
    }
    const gallery = await galleryModel.findById(order.gallery_id);
    const canDownload = canDownloadStatus(order.status);
    let photos = [];
    if (canDownload) {
      const rows = await photosForOrder(order);
      photos = await Promise.all(rows.map((photo) => withDownloadUrls(photo)));
    }
    res.json({
      order: publicOrderView(order, gallery || {}),
      canDownload,
      photos,
    });
  } catch (err) {
    console.error('getDownloadByToken error:', err);
    res.status(500).json({ error: 'Error al cargar el pedido.' });
  }
}

async function downloadOrderFile(req, res) {
  try {
    const order = await orderModel.findByDownloadToken(req.params.token);
    if (!order) {
      return res.status(404).json({ error: 'No encontramos ese pedido.' });
    }
    if (!canDownloadStatus(order.status)) {
      return res.status(403).json({ error: 'Este pedido todavía no está listo para descargar.' });
    }
    const photo = await photoBelongsToOrder(order, req.params.photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Esa foto no está en este pedido.' });
    }
    const url = await signedOriginalDownloadUrl(photo, 10 * 60);
    res.redirect(url);
  } catch (err) {
    console.error('downloadOrderFile error:', err);
    res.status(500).json({ error: 'Error al descargar la foto.' });
  }
}

async function unlockOrder(req, res) {
  try {
    const orderId = parseInt(req.body.orderId, 10);
    const pin = normalizePin(req.body.pin);
    if (!orderId || pin.length !== 6) {
      return res.status(400).json({ error: 'Ingresá el número de pedido y el PIN de 6 dígitos.' });
    }

    const ip = clientIp(req);
    if (isUnlockBlocked(ip, orderId)) {
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    }

    const order = await orderModel.findById(orderId);
    if (!order || !pinsMatch(order.access_pin, pin)) {
      registerUnlockFailure(ip, orderId);
      return res.status(401).json({ error: 'Número de pedido o PIN incorrectos.' });
    }

    clearUnlockFailures(ip, orderId);
    const gallery = await galleryModel.findById(order.gallery_id);
    res.json({
      token: order.download_token,
      downloadUrl: orderDownloadUrl(appBaseUrl(req), order.download_token),
      order: publicOrderView(order, gallery || {}),
    });
  } catch (err) {
    console.error('unlockOrder error:', err);
    res.status(500).json({ error: 'Error al abrir el pedido.' });
  }
}

module.exports = {
  createOrder,
  listGalleryOrders,
  listMyOrders,
  updateOrder,
  updateOrderStatus: updateOrder,
  deleteOrder,
  updateOrderSettings,
  getDownloadByToken,
  downloadOrderFile,
  unlockOrder,
};
