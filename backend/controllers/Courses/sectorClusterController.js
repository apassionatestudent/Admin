// => controllers/sectorClusterController.js

import * as SectorClusterService from '../../services/Courses/sectorClusterService.js';

export async function getSectors(req, res) {
  try {
    const sectors = await SectorClusterService.listSectors();
    res.status(200).json({ success: true, data: sectors });
  } catch (error) {
    console.error('getSectors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sectors' });
  }
}

export async function createSector(req, res) {
  try {
    const { sector } = req.body;
    const newSector = await SectorClusterService.createSector(sector);
    res.status(201).json({ success: true, data: newSector });
  } catch (error) {
    console.error('createSector error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create sector' });
  }
}

export async function deleteSector(req, res) {
  try {
    const { sectorId } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const result = await SectorClusterService.deleteSector(sectorId, actor);
    const message = result.affectedCourseCount > 0
      ? `Sector deleted. ${result.affectedCourseCount} related course(s) were marked inactive.`
      : 'Sector deleted';
    res.status(200).json({ success: true, message, affectedCourseCount: result.affectedCourseCount });
  } catch (error) {
    console.error('deleteSector error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete sector' });
  }
}

export async function getDeletedSectors(req, res) {
  try {
    const sectors = await SectorClusterService.listDeletedSectors();
    res.status(200).json({ success: true, data: sectors });
  } catch (error) {
    console.error('getDeletedSectors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch deleted sectors' });
  }
}

export async function restoreSector(req, res) {
  try {
    const { sectorId } = req.params;
    const restored = await SectorClusterService.restoreSector(sectorId);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreSector error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore sector' });
  }
}

export async function getClusters(req, res) {
  try {
    const clusters = await SectorClusterService.listClusters();
    res.status(200).json({ success: true, data: clusters });
  } catch (error) {
    console.error('getClusters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch clusters' });
  }
}

export async function createCluster(req, res) {
  try {
    const { name } = req.body;
    const newCluster = await SectorClusterService.createCluster(name);
    res.status(201).json({ success: true, data: newCluster });
  } catch (error) {
    console.error('createCluster error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to create cluster' });
  }
}

export async function deleteCluster(req, res) {
  try {
    const { clusterId } = req.params;
    const actor = { admin_id: req.admin?.admin_id, full_name: req.admin?.full_name };
    const result = await SectorClusterService.deleteCluster(clusterId, actor);
    const message = result.affectedCourseCount > 0
      ? `Cluster deleted. ${result.affectedCourseCount} related course(s) were marked inactive.`
      : 'Cluster deleted';
    res.status(200).json({ success: true, message, affectedCourseCount: result.affectedCourseCount });
  } catch (error) {
    console.error('deleteCluster error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete cluster' });
  }
}

export async function getDeletedClusters(req, res) {
  try {
    const clusters = await SectorClusterService.listDeletedClusters();
    res.status(200).json({ success: true, data: clusters });
  } catch (error) {
    console.error('getDeletedClusters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch deleted clusters' });
  }
}

export async function restoreCluster(req, res) {
  try {
    const { clusterId } = req.params;
    const restored = await SectorClusterService.restoreCluster(clusterId);
    res.status(200).json({ success: true, data: restored });
  } catch (error) {
    console.error('restoreCluster error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to restore cluster' });
  }
}
