// => controllers/Reports/reportController.js
import * as reportService from '../../services/Reports/reportService.js';

// => GET /api/admin/reports/sectors
export const getSectorsHandler = async (req, res) => {
  try {
    const sectors = await reportService.listSectors();
    res.json({ sectors });
  } catch (err) {
    console.error('getSectorsHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch sectors.' });
  }
};

// => GET /api/admin/reports/clusters
export const getClustersHandler = async (req, res) => {
  try {
    const clusters = await reportService.listClusters();
    res.json({ clusters });
  } catch (err) {
    console.error('getClustersHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch clusters.' });
  }
};

// => GET /api/admin/reports/tesda-courses?sector_id=
export const getTesdaCoursesHandler = async (req, res) => {
  const { sector_id } = req.query;
  if (!sector_id) {
    return res.status(400).json({ error: 'sector_id is required.' });
  }
  try {
    const courses = await reportService.listTesdaCoursesBySector(sector_id);
    res.json({ courses });
  } catch (err) {
    console.error('getTesdaCoursesHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
};

// => GET /api/admin/reports/shs-courses?cluster_id=
export const getShsCoursesHandler = async (req, res) => {
  const { cluster_id } = req.query;
  if (!cluster_id) {
    return res.status(400).json({ error: 'cluster_id is required.' });
  }
  try {
    const courses = await reportService.listShsCoursesByCluster(cluster_id);
    res.json({ courses });
  } catch (err) {
    console.error('getShsCoursesHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
};

// => GET /api/admin/reports/summary?type=TESDA|SHS&course_id=&year=
export const getSummaryHandler = async (req, res) => {
  const { type, course_id, year } = req.query;

  if (!type || !['TESDA', 'SHS'].includes(type)) {
    return res.status(400).json({ error: 'type must be TESDA or SHS.' });
  }
  if (!course_id) {
    return res.status(400).json({ error: 'course_id is required.' });
  }

  // => Defaults to the current year when omitted - matches the page's
  //    default "current year, year to date" behavior
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

  if (Number.isNaN(targetYear)) {
    return res.status(400).json({ error: 'year must be a valid number.' });
  }

  try {
    const summary = await reportService.getCourseSummary(type, course_id, targetYear);
    res.json(summary);
  } catch (err) {
    console.error('getSummaryHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch report summary.' });
  }
};

export const getOverviewHandler = async (req, res) => {
  const { type, group_id, year } = req.query;

  if (!type || !['TESDA', 'SHS'].includes(type)) {
    return res.status(400).json({ error: 'type must be TESDA or SHS.' });
  }
  if (!group_id) {
    return res.status(400).json({ error: 'group_id is required.' });
  }

  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

  if (Number.isNaN(targetYear)) {
    return res.status(400).json({ error: 'year must be a valid number.' });
  }

  try {
    const overview = await reportService.getOverview(type, group_id, targetYear);
    res.json(overview);
  } catch (err) {
    console.error('getOverviewHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch course overview.' });
  }
};