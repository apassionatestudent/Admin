// => services/sectorClusterService.js

import * as SectorClusterModel from '../models/sectorClusterModel.js';

export async function listSectors() {
  return SectorClusterModel.findAllSectors();
}

export async function createSector(sectorName) {
  if (!sectorName || !sectorName.trim()) {
    const error = new Error('A name is required');
    error.statusCode = 400;
    throw error;
  }
  return SectorClusterModel.insertSector(sectorName.trim());
}

export async function deleteSector(sectorId) {
  const deleted = await SectorClusterModel.softDeleteSector(sectorId);
  if (!deleted) {
    const error = new Error('Sector not found or already deleted');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}

export async function listDeletedSectors() {
  return SectorClusterModel.findAllDeletedSectors();
}

export async function restoreSector(sectorId) {
  const restored = await SectorClusterModel.restoreSector(sectorId);
  if (!restored) {
    const error = new Error('Sector not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }
  return restored;
}

export async function listClusters() {
  return SectorClusterModel.findAllClusters();
}

export async function createCluster(clusterName) {
  if (!clusterName || !clusterName.trim()) {
    const error = new Error('A name is required');
    error.statusCode = 400;
    throw error;
  }
  return SectorClusterModel.insertCluster(clusterName.trim());
}

export async function deleteCluster(clusterId) {
  const deleted = await SectorClusterModel.softDeleteCluster(clusterId);
  if (!deleted) {
    const error = new Error('Cluster not found or already deleted');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}

export async function listDeletedClusters() {
  return SectorClusterModel.findAllDeletedClusters();
}

export async function restoreCluster(clusterId) {
  const restored = await SectorClusterModel.restoreCluster(clusterId);
  if (!restored) {
    const error = new Error('Cluster not found or is not currently deleted');
    error.statusCode = 404;
    throw error;
  }
  return restored;
}
