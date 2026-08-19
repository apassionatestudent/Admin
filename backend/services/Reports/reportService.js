// => services/Reports/reportService.js
import * as reportModel from '../../models/Reports/reportModel.js';

// => Month labels attached to every monthly row before it reaches the frontend
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// => Converts each raw monthly row into {month, label, ...valueKeys}.
//    valueKeys lets the same helper serve Enrollees (count), Batches
//    (count, capacity), and Certification (passed, failed) rows alike
const withLabels = (rows, valueKeys) => rows.map(r => {
  const row = { month: r.month, label: MONTH_LABELS[r.month - 1] };
  valueKeys.forEach(key => { row[key] = Number(r[key]); });
  return row;
});

export const listSectors = () => reportModel.getActiveSectors();

export const listClusters = () => reportModel.getActiveClusters();

export const listTesdaCoursesBySector = (sectorId) => reportModel.getTesdaCoursesBySector(sectorId);

export const listShsCoursesByCluster = (clusterId) => reportModel.getShsCoursesByCluster(clusterId);

// => Returns 12-month enrollee and batch counts for a course and year.
//    The frontend aggregates this same 12-row array into Annually,
//    Quarterly, or Monthly views on its own, so only one fetch is needed
//    per course/year combination no matter which period view is active
export const getCourseSummary = async (type, courseId, year) => {
  const [enrolleeRows, batchRows, certRows] = type === 'TESDA'
    ? await Promise.all([
        reportModel.getTesdaEnrolleeMonthlyCounts(courseId, year),
        reportModel.getTesdaBatchMonthlyCounts(courseId, year),
        reportModel.getTesdaCertificationMonthlyCounts(courseId, year),
      ])
    : await Promise.all([
        reportModel.getShsEnrolleeMonthlyCounts(courseId, year),
        reportModel.getShsBatchMonthlyCounts(courseId, year),
        reportModel.getShsCertificationMonthlyCounts(courseId, year),
      ]);

  const enrollees = withLabels(enrolleeRows, ['count']);
  const batches = withLabels(batchRows, ['count', 'capacity']);
  const certification = withLabels(certRows, ['passed', 'failed']);

  // => Fill Rate is deliberately one whole-year figure, not broken out
  //    per period. Enrollees are counted by submitted_at (application
  //    date), Batches are counted by created_at (batch creation date) -
  //    a Reserved applicant later placed into a batch opened in a
  //    different period would make any narrower comparison misleading.
  //    Only the full-year total holds up.
  const totalEnrollees = enrollees.reduce((sum, r) => sum + r.count, 0);
  const totalCapacity  = batches.reduce((sum, r) => sum + r.capacity, 0);
  const fillRate = totalCapacity > 0 ? Math.round((totalEnrollees / totalCapacity) * 100) : null;

  return {
    year,
    enrollees,
    batches,
    certification,
    fillRate: { enrollees: totalEnrollees, capacity: totalCapacity, rate: fillRate },
  };
};

export const getOverview = async (type, groupId, year) => {
  const [enrolleeRows, batchRows] = type === 'TESDA'
    ? await Promise.all([
        reportModel.getTesdaOverviewEnrollees(groupId, year),
        reportModel.getTesdaOverviewBatches(groupId, year),
      ])
    : await Promise.all([
        reportModel.getShsOverviewEnrollees(groupId, year),
        reportModel.getShsOverviewBatches(groupId, year),
      ]);

  const courseMap = new Map();

  enrolleeRows.forEach(r => {
    if (!courseMap.has(r.course_id)) {
      courseMap.set(r.course_id, { course_id: r.course_id, title: r.title, enrollees: [], batches: [] });
    }
    courseMap.get(r.course_id).enrollees.push({
      month: r.month,
      label: MONTH_LABELS[r.month - 1],
      count: Number(r.count),
    });
  });

  batchRows.forEach(r => {
    if (!courseMap.has(r.course_id)) {
      courseMap.set(r.course_id, { course_id: r.course_id, title: null, enrollees: [], batches: [] });
    }
    courseMap.get(r.course_id).batches.push({
      month: r.month,
      label: MONTH_LABELS[r.month - 1],
      count: Number(r.count),
      capacity: Number(r.capacity),
    });
  });

  return { year, courses: Array.from(courseMap.values()) };
};