// => services/sectorClusterService.js

import * as SectorClusterModel from '../../models/Courses/sectorClusterModel.js';
import { pool } from '../../config/db.js';
import { logActivity } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

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

export async function deleteSector(sectorId, actor) {
  const deleted = await SectorClusterModel.softDeleteSector(sectorId);
  if (!deleted) {
    const error = new Error('Sector not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'sector',
    entity_id: deleted.sector_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: `Deleted sector "${deleted.sector}"`,
  });

  // => Cascade: any TESDA course still marked active under this sector gets
  // => flipped to inactive, so it can't sit invisible on the public site
  // => while still reading "active" in the admin dashboard
  const affectedCourses = await SectorClusterModel.deactivateTesdaCoursesBySector(sectorId);
  for (const course of affectedCourses) {
    await logActivity(pool, {
      entity_type: 'tesda_course',
      entity_id: course.course_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `Status changed from "active" to "inactive" (sector "${deleted.sector}" was deleted)`,
    });
  }

  return { ...deleted, affectedCourseCount: affectedCourses.length };
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

export async function deleteCluster(clusterId, actor) {
  const deleted = await SectorClusterModel.softDeleteCluster(clusterId);
  if (!deleted) {
    const error = new Error('Cluster not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  await logActivity(pool, {
    entity_type: 'cluster',
    entity_id: deleted.cluster_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: `Deleted cluster "${deleted.name}"`,
  });

  // => Cascade: any SHS course still marked active under this cluster gets
  // => flipped to inactive, same reasoning as deleteSector above
  const affectedCourses = await SectorClusterModel.deactivateShsCoursesByCluster(clusterId);
  for (const course of affectedCourses) {
    await logActivity(pool, {
      entity_type: 'shs_course',
      entity_id: course.course_id,
      actor_type: 'Staff',
      actor_id: actor?.admin_id,
      actor_name: actor?.full_name,
      action: ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `Status changed from "active" to "inactive" (cluster "${deleted.name}" was deleted)`,
    });
  }

  return { ...deleted, affectedCourseCount: affectedCourses.length };
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
