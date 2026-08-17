const selectionModel = require('../models/selectionModel');
const photoModel = require('../models/photoModel');

async function toggleSelection(req, res) {
  try {
    const { photoId, clientToken, selected } = req.body;

    if (!photoId || !clientToken) {
      return res.status(400).json({ error: 'Falta photoId o clientToken.' });
    }

    const photo = await photoModel.findById(photoId);
    if (!photo || photo.gallery_id !== req.gallery.id) {
      return res.status(404).json({ error: 'Foto no encontrada en esta galería.' });
    }

    if (selected) {
      await selectionModel.add(req.gallery.id, photoId, clientToken);
    } else {
      await selectionModel.remove(req.gallery.id, photoId, clientToken);
    }

    const current = await selectionModel.findByClient(req.gallery.id, clientToken);
    res.json({ selectedPhotoIds: current });
  } catch (err) {
    console.error('toggleSelection error:', err);
    res.status(500).json({ error: 'Error al guardar la selección.' });
  }
}

async function getMySelections(req, res) {
  try {
    const { clientToken } = req.query;
    if (!clientToken) {
      return res.status(400).json({ error: 'Falta clientToken.' });
    }
    const selectedPhotoIds = await selectionModel.findByClient(req.gallery.id, clientToken);
    res.json({ selectedPhotoIds });
  } catch (err) {
    console.error('getMySelections error:', err);
    res.status(500).json({ error: 'Error al obtener la selección.' });
  }
}

module.exports = { toggleSelection, getMySelections };
