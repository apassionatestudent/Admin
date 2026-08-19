// => admin/pages/Reports/Reports.jsx
// => Enrollment and Batch reporting page, broken down by TESDA Sector or
//    SHS Cluster, then by a specific course under that sector or cluster
// => Backend always returns 12 months of data per course/year - Annually,
//    Quarterly, and Monthly views are all aggregated from that single
//    response client-side, so switching period never triggers a re-fetch

import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

import './Reports.css';
import LoadingState from '../../components/LoadingState/loadingState.jsx';

// => Real picture icon needed here, not emoji or a text glyph. Point this
//    at any small PNG (e.g. an empty-folder or magnifying-glass graphic)
//    under your assets/icons folder, adjust the path to match
import emptyIcon from '../../assets/icons/empty-classes.png';

// => Builds the last 6 years, current year first, for the Year dropdown
const yearOptions = () => {
  const current = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => current - i);
};

// => Aggregates the always-12-row monthly array into whichever period is
//    currently selected. Annually collapses to a single row - for the
//    current year this doubles as "year to date" automatically, since
//    months that have not happened yet simply carry a count of 0
const aggregate = (rows, period, year, keys = ['count']) => {
  const sumKeys = (list) => keys.reduce((acc, k) => {
    acc[k] = list.reduce((sum, r) => sum + (r[k] || 0), 0);
    return acc;
  }, {});

  if (period === 'monthly') {
    return rows.map(r => ({ label: r.label, ...sumKeys([r]) }));
  }

  if (period === 'quarterly') {
    const quarters = [
      { label: 'Q1', months: [1, 2, 3] },
      { label: 'Q2', months: [4, 5, 6] },
      { label: 'Q3', months: [7, 8, 9] },
      { label: 'Q4', months: [10, 11, 12] },
    ];
    return quarters.map(q => ({
      label: q.label,
      ...sumKeys(rows.filter(r => q.months.includes(r.month))),
    }));
  }

  // => Annually - one row, total of all 12 months
  return [{ label: String(year), ...sumKeys(rows) }];
};

export default function Reports() {
  const navigate = useNavigate();
  const { admin } = useOutletContext();

  // => Belt-and-suspenders redirect, same pattern as Enrollments.jsx - the
  //    backend already enforces requireSection('reports') on every call
  //    below, this just avoids rendering the shell for no reason
  useEffect(() => {
    if (admin && admin.role !== 'super_admin' && !admin.sections?.includes('reports')) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  // => Radio filter - which taxonomy is being reported on
  const [reportType, setReportType] = useState('TESDA'); // => 'TESDA' | 'SHS'

  // => Dropdown 1 options and selection (Sectors for TESDA, Clusters for SHS)
  const [groupOptions,  setGroupOptions]  = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupLoading,  setGroupLoading]  = useState(false);
  const [groupError,    setGroupError]    = useState(null);

  // => Dropdown 2 options and selection (Courses under the selected group)
  const [courseOptions,  setCourseOptions]  = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [courseLoading,  setCourseLoading]  = useState(false);
  const [courseError,    setCourseError]    = useState(null);

  // => Year and period filters - period is purely client-side aggregation,
  //    see aggregate() above, it never triggers a re-fetch
  const [year,   setYear]   = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('annually'); // => 'annually' | 'quarterly' | 'monthly'

  // => Raw 12-month summary from the backend, plus loading/error state
  const [summary,        setSummary]        = useState(null); // => { year, enrollees: [...12], batches: [...12] }
  const [summaryLoading, setSummaryLoading]  = useState(false);
  const [summaryError,   setSummaryError]    = useState(null);

  // => Course Overview data - every active course under the selected
  //    Sector/Cluster for the selected year, used for the ranking table
  const [overview,        setOverview]        = useState(null); // => { year, courses: [...] }
  const [overviewLoading, setOverviewLoading]  = useState(false);
  const [overviewError,   setOverviewError]    = useState(null);

  // => Fetch Sectors or Clusters whenever the radio selection changes,
  //    and reset everything downstream of it
  useEffect(() => {
    setSelectedGroup('');
    setSelectedCourse('');
    setCourseOptions([]);
    setSummary(null);

    const fetchGroups = async () => {
      setGroupLoading(true);
      setGroupError(null);
      try {
        const endpoint = reportType === 'TESDA'
          ? '/api/admin/reports/sectors'
          : '/api/admin/reports/clusters';
        const res = await fetch(endpoint, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch options.');
        const data = await res.json();
        setGroupOptions(reportType === 'TESDA' ? data.sectors : data.clusters);
      } catch (err) {
        setGroupError(err.message);
      } finally {
        setGroupLoading(false);
      }
    };

    fetchGroups();
  }, [reportType]);

  // => Fetch Courses whenever the selected Sector/Cluster changes
  useEffect(() => {
    setSelectedCourse('');
    setSummary(null);

    if (!selectedGroup) {
      setCourseOptions([]);
      return;
    }

    const fetchCourses = async () => {
      setCourseLoading(true);
      setCourseError(null);
      try {
        const endpoint = reportType === 'TESDA'
          ? `/api/admin/reports/tesda-courses?sector_id=${selectedGroup}`
          : `/api/admin/reports/shs-courses?cluster_id=${selectedGroup}`;
        const res = await fetch(endpoint, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch courses.');
        const data = await res.json();
        setCourseOptions(data.courses);
      } catch (err) {
        setCourseError(err.message);
      } finally {
        setCourseLoading(false);
      }
    };

    fetchCourses();
  }, [selectedGroup, reportType]);

  // => Fetch the Course Overview whenever the selected Sector/Cluster or
  //    Year changes - independent of which single Course is selected,
  //    since this table shows every course in the group at once
  useEffect(() => {
    if (!selectedGroup) {
      setOverview(null);
      return;
    }

    const fetchOverview = async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const res = await fetch(
          `/api/admin/reports/overview?type=${reportType}&group_id=${selectedGroup}&year=${year}`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to fetch overview.');
        }
        const data = await res.json();
        setOverview(Array.isArray(data?.courses) ? data : { year, courses: [] });
      } catch (err) {
        setOverviewError(err.message);
      } finally {
        setOverviewLoading(false);
      }
    };

    fetchOverview();
  }, [selectedGroup, year, reportType]);

  // => Fetch the summary whenever the selected Course or Year changes.
  //    Period is deliberately NOT in this dependency list - it's
  //    aggregated client-side from the same 12-month response
  useEffect(() => {
    if (!selectedCourse) {
      setSummary(null);
      return;
    }

    const fetchSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await fetch(
          `/api/admin/reports/summary?type=${reportType}&course_id=${selectedCourse}&year=${year}`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to fetch report.');
        }
        const data = await res.json();
        setSummary(data);
      } catch (err) {
        setSummaryError(err.message);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [selectedCourse, year, reportType]);

  const enrolleeRows = summary ? aggregate(summary.enrollees, period, year, ['count']) : [];
  const batchRows    = summary ? aggregate(summary.batches, period, year, ['count']) : [];

  // => Certification rows come from the same table/column pair
  //    (status + updated_at) for both Passed and Failed, so unlike Fill
  //    Rate this one is safe to break out per period
  const certRows = summary
    ? aggregate(summary.certification, period, year, ['passed', 'failed']).map(row => {
        const total = row.passed + row.failed;
        const passRate = total > 0 ? Math.round((row.passed / total) * 100) : null;
        return { ...row, passRate };
      })
    : [];

  // => Totals every course under the selected Sector/Cluster for the
  //    whole selected year, then ranks by enrollee count descending
  const overviewRows = overview
    ? overview.courses
        .map(c => {
          const enrolleeTotal = c.enrollees.reduce((sum, r) => sum + r.count, 0);
          const batchTotal    = c.batches.reduce((sum, r) => sum + r.count, 0);
          const capacityTotal = c.batches.reduce((sum, r) => sum + r.capacity, 0);
          const fillRate = capacityTotal > 0 ? Math.round((enrolleeTotal / capacityTotal) * 100) : null;
          return {
            course_id: c.course_id,
            title: c.title,
            enrollees: enrolleeTotal,
            batches: batchTotal,
            fillRate,
          };
        })
        .sort((a, b) => b.enrollees - a.enrollees)
    : [];

  return (
    <div className="rpt-page">
      <header className="rpt-header">
        <h1 className="rpt-title">Reports</h1>
        <p className="rpt-subtitle">Enrollee and batch counts by sector, cluster, and course</p>
      </header>

      {/* => Radio filter: TESDA Sectors vs SHS Clusters */}
      <div className="rpt-filter-row">
        <div className="rpt-radio-group">
          <label className={`rpt-radio ${reportType === 'TESDA' ? 'rpt-radio--active' : ''}`}>
            <input
              type="radio"
              name="reportType"
              value="TESDA"
              checked={reportType === 'TESDA'}
              onChange={() => setReportType('TESDA')}
            />
            TESDA Sectors
          </label>
          <label className={`rpt-radio ${reportType === 'SHS' ? 'rpt-radio--active' : ''}`}>
            <input
              type="radio"
              name="reportType"
              value="SHS"
              checked={reportType === 'SHS'}
              onChange={() => setReportType('SHS')}
            />
            SHS Clusters
          </label>
        </div>
      </div>

      {/* => Dropdown 1: Sector or Cluster depending on the radio above,
             Dropdown 2: Course under it, plus the Year filter */}
      <div className="rpt-filter-row">
        <div className="rpt-field">
          <label className="rpt-label">{reportType === 'TESDA' ? 'Sector' : 'Cluster'}</label>
          <select
            className="rpt-select"
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
            disabled={groupLoading}
          >
            <option value="">Select {reportType === 'TESDA' ? 'a sector' : 'a cluster'}</option>
            {groupOptions.map(g => (
              <option key={g.sector_id ?? g.cluster_id} value={g.sector_id ?? g.cluster_id}>
                {g.sector ?? g.name}
              </option>
            ))}
          </select>
          {groupError && <p className="rpt-field-error">{groupError}</p>}
        </div>

        <div className="rpt-field">
          <label className="rpt-label">Course</label>
          <select
            className="rpt-select"
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
            disabled={!selectedGroup || courseLoading}
          >
            <option value="">Select a course</option>
            {courseOptions.map(c => (
              <option key={c.course_id} value={c.course_id}>{c.title}</option>
            ))}
          </select>
          {courseError && <p className="rpt-field-error">{courseError}</p>}
        </div>

        <div className="rpt-field">
          <label className="rpt-label">Year</label>
          <select className="rpt-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {yearOptions().map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* => Period toggle: Annually / Quarterly / Monthly */}
      <div className="rpt-filter-row">
        <div className="rpt-period-group">
          {['annually', 'quarterly', 'monthly'].map(p => (
            <button
              key={p}
              type="button"
              className={`rpt-period-btn ${period === p ? 'rpt-period-btn--active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* => Prompt state - shown until a Sector/Cluster is selected */}
      {!selectedGroup && (
        <div className="rpt-empty-state">
          <img src={emptyIcon} alt="" className="rpt-empty-icon" />
          <p>Select a {reportType === 'TESDA' ? 'sector' : 'cluster'} to view its course overview.</p>
        </div>
      )}

      {/* => Course Overview - every active course under the selected
             Sector/Cluster, ranked by enrollees, for the whole selected
             year. Always shows the full year regardless of the Period
             toggle, which only controls the single-course detail section
             further down. Clicking a row drills into that course. */}
      {selectedGroup && (
        <section className="rpt-section">
          <h2 className="rpt-section-label">Course Overview ({year})</h2>

          {overviewLoading && (
            <LoadingState message="Loading overview…" />
          )}

          {!overviewLoading && overviewError && (
            <LoadingState variant="error" message={overviewError} />
          )}

          {!overviewLoading && !overviewError && overviewRows.length === 0 && (
            <div className="rpt-empty-state">
              <img src={emptyIcon} alt="" className="rpt-empty-icon" />
              <p>No active courses found under this {reportType === 'TESDA' ? 'sector' : 'cluster'}.</p>
            </div>
          )}

          {!overviewLoading && !overviewError && overviewRows.length > 0 && (
            <OverviewTable rows={overviewRows} onRowClick={setSelectedCourse} />
          )}
        </section>
      )}

      {/* => Loading / error for the single-course detail fetch */}
      {selectedCourse && summaryLoading && (
        <LoadingState message="Loading report…" />
      )}

      {selectedCourse && !summaryLoading && summaryError && (
        <LoadingState variant="error" message={summaryError} />
      )}

      {/* => Single-course detail: Fill Rate (demand) as one whole-year
             figure, Enrollees and Batches broken out by period as
             before, and Certification (operational efficiency - Passed
             vs Failed Assessment, based on updated_at) broken out by
             period since both counts come from the same table/column */}
      {selectedCourse && !summaryLoading && !summaryError && summary && (
        <>
          <section className="rpt-section">
            <h2 className="rpt-section-label">Course Fill Rate ({summary.year})</h2>
            <div className="rpt-fillrate-card">
              <span className="rpt-fillrate-value">
                {summary.fillRate.rate === null ? '-' : `${summary.fillRate.rate}%`}
              </span>
              <span className="rpt-fillrate-detail">
                {summary.fillRate.enrollees} enrollees against {summary.fillRate.capacity} total capacity opened this year
              </span>
            </div>
          </section>

          <section className="rpt-section">
            <h2 className="rpt-section-label">Enrollees</h2>
            <ReportTable rows={enrolleeRows} countLabel="Enrollees" />
          </section>

          <section className="rpt-section">
            <h2 className="rpt-section-label">Batches</h2>
            <ReportTable rows={batchRows} countLabel="Batches" />
          </section>

          <section className="rpt-section">
            <h2 className="rpt-section-label">Certification</h2>
            <CertificationTable rows={certRows} />
          </section>
        </>
      )}
    </div>
  );
}

// 
// ReportTable - reusable table sub-component for the Batches section
// 
function ReportTable({ rows, countLabel }) {
  return (
    <div className="rpt-table-wrap">
      <table className="rpt-table">
        <colgroup>
          <col style={{ width: '70%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Period</th>
            <th>{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} className="rpt-table-row" style={{ animationDelay: `${idx * 40}ms` }}>
              <td>{row.label}</td>
              <td className="rpt-count-cell">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 
// CertificationTable - Passed vs Failed Assessment per period, the
// operational efficiency metric (how many trained actually got
// certified), independent from the Fill Rate demand metric above
// 
function CertificationTable({ rows }) {
  return (
    <div className="rpt-table-wrap">
      <table className="rpt-table">
        <colgroup>
          <col style={{ width: '34%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '22%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Period</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Pass Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} className="rpt-table-row" style={{ animationDelay: `${idx * 40}ms` }}>
              <td>{row.label}</td>
              <td className="rpt-count-cell">{row.passed}</td>
              <td className="rpt-count-cell">{row.failed}</td>
              <td className="rpt-count-cell">{row.passRate === null ? '-' : `${row.passRate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 
// OverviewTable - ranks every course under the selected Sector/Cluster
// by enrollees. Rows are clickable, drilling into that course's detail
// 
function OverviewTable({ rows, onRowClick }) {
  return (
    <div className="rpt-table-wrap">
      <table className="rpt-table">
        <colgroup>
          <col style={{ width: '46%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Course</th>
            <th>Enrollees</th>
            <th>Batches</th>
            <th>Fill Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.course_id}
              className="rpt-table-row rpt-table-row--clickable"
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => onRowClick(String(row.course_id))}
              tabIndex={0}
              role="button"
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(String(row.course_id));
                }
              }}
            >
              <td>{row.title}</td>
              <td className="rpt-count-cell">{row.enrollees}</td>
              <td className="rpt-count-cell">{row.batches}</td>
              <td className="rpt-count-cell">{row.fillRate === null ? '-' : `${row.fillRate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}