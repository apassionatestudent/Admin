// => models/sectorClusterModel.js
// => Pure persistence layer for BOTH tesda 'sectors' and shs 'shs_clusters'
// => lookup tables in one file - they're the same kind of thing (a simple
// => dynamic dropdown-source table an admin can add to), so splitting them
// => into separate resource files would just be structural duplication for
// => no benefit. List + Create + soft-delete + restore - no edit yet, since
// => nothing in the UI calls for it.

import { pool } from '../../config/db.js';

// => Excludes soft-deleted rows so the dropdown never offers a deleted
// => sector for a NEW selection - existing courses that already reference
// => a deleted sector still display it fine, since the course-list JOIN
// => doesn't filter on the sector's own deleted_at
export async function findAllSectors() {
  const result = await pool.query(
    `SELECT sector_id, sector FROM sectors WHERE deleted_at IS NULL ORDER BY sector ASC`
  );
  return result.rows;
}

export async function insertSector(sectorName) {
  const result = await pool.query(
    `INSERT INTO sectors (sector) VALUES ($1) RETURNING sector_id, sector`,
    [sectorName]
  );
  return result.rows[0];
}

// => Soft delete only - never hard delete, matches your standing rule for
// => courses. A deleted sector's rows/history stay intact for any course
// => still referencing it.
export async function softDeleteSector(sectorId) {
  const result = await pool.query(
    `UPDATE sectors SET deleted_at = NOW() WHERE sector_id = $1 AND deleted_at IS NULL RETURNING sector_id`,
    [sectorId]
  );
  return result.rows[0] || null;
}

// => Deleted-sectors list - mirror of findAllSectors, flipped filter
export async function findAllDeletedSectors() {
  const result = await pool.query(
    `SELECT sector_id, sector, deleted_at FROM sectors WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
  );
  return result.rows;
}

// => Un-deletes a sector - clears deleted_at, nothing else. Only matches
// => rows that are actually currently deleted.
export async function restoreSector(sectorId) {
  const result = await pool.query(
    `UPDATE sectors SET deleted_at = NULL WHERE sector_id = $1 AND deleted_at IS NOT NULL RETURNING sector_id, sector`,
    [sectorId]
  );
  return result.rows[0] || null;
}

export async function findAllClusters() {
  const result = await pool.query(
    `SELECT cluster_id, name FROM shs_clusters WHERE deleted_at IS NULL ORDER BY name ASC`
  );
  return result.rows;
}

// => value column was dropped from shs_clusters in a prior migration -
//    name is now the sole identifying label, no derived slug needed
export async function insertCluster(clusterName) {
  const result = await pool.query(
    `INSERT INTO shs_clusters (name) VALUES ($1) RETURNING cluster_id, name`,
    [clusterName]
  );
  return result.rows[0];
}

export async function softDeleteCluster(clusterId) {
  const result = await pool.query(
    `UPDATE shs_clusters SET deleted_at = NOW() WHERE cluster_id = $1 AND deleted_at IS NULL RETURNING cluster_id`,
    [clusterId]
  );
  return result.rows[0] || null;
}

// => Deleted-clusters list - mirror of findAllClusters, flipped filter
export async function findAllDeletedClusters() {
  const result = await pool.query(
    `SELECT cluster_id, name, deleted_at FROM shs_clusters WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
  );
  return result.rows;
}

export async function restoreCluster(clusterId) {
  const result = await pool.query(
    `UPDATE shs_clusters SET deleted_at = NULL WHERE cluster_id = $1 AND deleted_at IS NOT NULL RETURNING cluster_id, name`,
    [clusterId]
  );
  return result.rows[0] || null;
}
