// => admin/pages/Classes/Classes.jsx
// => Displays all Ongoing and Pending classes for admin review, combining
//    TESDA + SHS (mirrors Enrollments.jsx's type/status filter pattern)
// => Also handles cross-status search and Add Class modal (TESDA-only for now)

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

import './Classes.css';
import axiosAdmin from '../../utils/axiosAdmin.js'; 

import searchIcon from '../../assets/icons/magnifying-glass.png';
// => Replace each of these with your actual icon assets - they just need to live at these paths
import emptyClassesIcon from '../../assets/icons/empty-classes.png';
import warningIcon from '../../assets/icons/warning.png';
import closeIcon from '../../assets/icons/close.png';
import chevronIcon from '../../assets/icons/chevron-down.png'; // => rotated via CSS when open, see .adm-chevron--up
// import arrowIcon from '../../assets/icons/chevron-right.png';

// => New: Facilities tab modal - lives in its own Classes subfolder per
//    the components/Classes/<ComponentName>/ convention
import AddFacilityModal from '../../components/Classes/AddFacilityModal/AddFacilityModal.jsx';
import AddTrainerModal from '../../components/Classes/AddTrainerModal/addTrainerModal.jsx';
import AddSessionModal from '../../components/Classes/AddSessionModal/addSessionModal.jsx';
import AddBatchModal from '../../components/Classes/AddBatchModal/addBatchModal.jsx';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal.jsx';
// => Shared spinner/error block, replaces the local adm-classes-state markup below
import LoadingState from '../../components/LoadingState/loadingState.jsx';

// => Maps each status to a CSS modifier class
const statusClass = {
  'Pending':   'status--pending',
  'Ongoing':   'status--ongoing',
  'Concluded': 'status--concluded',
  'Dissolved': 'status--dissolved',
};

// => Formats a DATE string (YYYY-MM-DD) to "Jan 1, 2025"
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const datePart = String(dateStr).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

// => getTomorrowDateString / getMinEndDate / validateBatchDatesClient moved
//    into AddBatchModal.jsx - only ever used by the Add Batch form, now
//    fully extracted out of this file

// => Empty search filters - used for reset
// => program_type/cluster/grade_level added for SHS; sector/trainer_id stay
//    TESDA-only. batch_name (renamed from course_name) applies to both -
//    it matches TESDA course title OR SHS cluster name on the backend.
// => No track filter - track was removed from the schema entirely, single
//    a meaningful thing to filter by
// => Removed program_type/status: those are now driven by the Type/Status
//    pills below More Options instead of their own duplicate dropdowns -
//    see getSearchFilters() which merges typeFilter/statusFilter in at
//    search time
const EMPTY_FILTERS = {
  batch_name:      '', // => Renamed from course_name - matches TESDA course title OR SHS cluster name
  trainer_id:      '', // => TESDA only, now an exact-match dropdown instead of free text
  sector:          '',
  cluster:         '',
  grade_level:     '', // => SHS only, filters by enrolled students' course grade level
  start_date_from: '',
  start_date_to:   '',
};

// => EMPTY_SHS_BATCH_FORM / EMPTY_CLASS_FORM moved into AddBatchModal.jsx
//    along with the rest of the Add Batch form state

export default function Classes() {
  const navigate = useNavigate();
  const { admin } = useOutletContext();

  // => Belt-and-suspenders redirect - the backend already returns 403 on
  // => every fetch below via requireSection('classes'), but without this
  // => the page still renders its full shell and only shows "Failed to
  // => fetch..." errors instead of bouncing back to Dashboard
  useEffect(() => {
    if (admin && admin.role !== 'super_admin' && !admin.sections?.includes('classes')) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  // => Which of the four top-level tabs is showing. 'batches' is the
  //    default since it's the one page that already fully works - the
  //    other three are new. Everything below this point that existed
  //    before (classes/loading/error/filters/search/modal state) belongs
  //    to the Batches tab specifically, even though the variable names
  //    weren't renamed to say so.
  const [mainTab, setMainTab] = useState('classes'); // => 'classes' | 'batches' | 'facilities' | 'trainers'

  // => Facilities tab: list + create-modal state
  const [facilities,           setFacilities]           = useState([]);
  const [facilitiesLoading,    setFacilitiesLoading]     = useState(false);
  const [facilitiesError,      setFacilitiesError]       = useState(null);
  const [showAddFacilityModal, setShowAddFacilityModal]  = useState(false);
  // => Active/Deleted toggle - mirrors Courses.jsx's viewMode pattern
  const [facilityViewMode,     setFacilityViewMode]      = useState('active'); // => 'active' | 'deleted'

  // => Client-side only, mirrors the Trainers filter pattern - none of
  //    these ever re-fetch, they just re-filter whatever's already loaded
  //    in `facilities`
  const [facilityRestrictionFilter, setFacilityRestrictionFilter] = useState('ALL'); // => 'ALL' | 'RESTRICTED' | 'GENERAL'
  const [facilityStatusFilter,      setFacilityStatusFilter]      = useState('ALL'); // => 'ALL' | 'active' | 'inactive'
  const [facilitySearchTerm,        setFacilitySearchTerm]        = useState('');

  // => Class Sessions tab: facility picker list - separate from `facilities`
  //    above since this only ever shows active facilities with their
  //    allowed course titles attached, a different shape than the plain
  //    CRUD list the Facilities tab uses
  const [sessionFacilities,        setSessionFacilities]        = useState([]);
  const [sessionFacilitiesLoading, setSessionFacilitiesLoading] = useState(false);
  const [sessionFacilitiesError,   setSessionFacilitiesError]   = useState(null);

  // => NEW - Class Sessions tab now has 2 subsections: Facility-Based
  //    (the existing calendar-driven flow above) and Mobile & Online (a
  //    flat list, no calendar since these aren't tied to a facility)
  const [sessionSubTab,        setSessionSubTab]        = useState('facility'); // => 'facility' | 'remote'
  const [remoteSessions,       setRemoteSessions]       = useState([]);
  const [remoteSessionsLoading,setRemoteSessionsLoading] = useState(false);
  const [remoteSessionsError,  setRemoteSessionsError]   = useState(null);

  // => NEW - client-side only filters for the Class Sessions tab's two
  //    subsections, mirrors the Facilities/Trainers filter pattern, never
  //    triggers a re-fetch, just re-filters what's already loaded
  const [facilitySessionSearchTerm,   setFacilitySessionSearchTerm]   = useState(''); // => matches facility name OR any TESDA/SHS course title
  const [facilitySessionStatusFilter, setFacilitySessionStatusFilter] = useState('ALL'); // => 'ALL' | 'active' | 'inactive'
  const [facilitySessionTypeFilter,   setFacilitySessionTypeFilter]   = useState('ALL'); // => 'ALL' | 'TESDA' | 'SHS' - one pill instead of 2 dropdowns

  const [remoteSessionSearchTerm, setRemoteSessionSearchTerm] = useState(''); // => matches batch name OR trainer name
  const [remoteSessionTypeFilter, setRemoteSessionTypeFilter] = useState('ALL'); // => 'ALL' | 'Mobile' | 'Online'
  const [remoteSessionDateFrom,   setRemoteSessionDateFrom]   = useState('');
  const [remoteSessionDateTo,     setRemoteSessionDateTo]     = useState('');
  const [showAddRemoteModal,   setShowAddRemoteModal]    = useState(false);

  // => Trainers tab: list + create-modal state - mirrors Facilities exactly
  const [trainers,            setTrainers]            = useState([]);
  const [trainersLoading,     setTrainersLoading]      = useState(false);
  const [trainersError,       setTrainersError]        = useState(null);
  const [showAddTrainerModal, setShowAddTrainerModal]  = useState(false);
  const [trainerViewMode,     setTrainerViewMode]      = useState('active'); // => 'active' | 'deleted'

  // => Client-side only, mirrors Batches' typeFilter/statusFilter - none of
  //    these ever re-fetch, they just re-filter whatever's already loaded
  //    in `trainers`
  const [trainerProgramFilter, setTrainerProgramFilter] = useState('ALL'); // => 'ALL' | 'TESDA' | 'SHS'
  const [trainerStatusFilter,  setTrainerStatusFilter]  = useState('ALL'); // => 'ALL' | 'active' | 'inactive'
  const [trainerSearchTerm,    setTrainerSearchTerm]    = useState('');

  // => Shared ConfirmModal instance for the restore action - reused by both
  //    Facilities and Trainers restore flows
  const [confirmModal,         setConfirmModal]          = useState({ isOpen: false, message: '', onConfirm: null });

  // => Default classes list (Ongoing + Pending), combining TESDA + SHS
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // => Search state
  const [filters,       setFilters]       = useState(EMPTY_FILTERS);
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [searchResults, setSearchResults] = useState(null); // => null = not searched yet
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState(null);

  // => Client-side ONLY filters (type + status) - never trigger a re-fetch,
  //    they just filter whatever's already loaded in `classes` / `searchResults`
  //    Mirrors Enrollments.jsx's typeFilter/statusFilter pattern
  const [typeFilter,   setTypeFilter]   = useState('ALL'); // => 'ALL' | 'TESDA' | 'SHS'
  const [statusFilter, setStatusFilter] = useState('ALL'); // => 'ALL' | one of statusClass's keys

  // => Cache for sector/cluster dropdowns in More Options
  // => useRef so it survives re-renders without triggering one
  const filterOptionsCache = useRef(null);
  const [filterOptions, setFilterOptions] = useState({ sectors: [], clusters: [], trainers: [] });

  // => Fetch sectors, clusters, and trainers for the More Options dropdowns
  // => Must live inside the component so it can access filterOptionsCache and setFilterOptions
  const fetchFilterOptions = async () => {
    if (filterOptionsCache.current) {
      // => Already fetched this session, reuse cached data
      setFilterOptions(filterOptionsCache.current);
      return;
    }
    try {
      const res = await axiosAdmin.get('/api/admin/batches/form-options');
      const data = res.data;
      const extracted = { sectors: data.sectors, clusters: data.clusters, trainers: data.trainers };
      // => Store in ref (persists without re-render) and state (drives the UI)
      filterOptionsCache.current = extracted;
      setFilterOptions(extracted);
    } catch {
      // => Silently fail - dropdowns just stay empty
    }
  };

  // => Add Batch modal - just a visibility flag now, all form state/logic
  //    lives inside AddBatchModal.jsx after extraction
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);

  // => Ref to abort stale search requests
  const abortRef = useRef(null);

  // => Fetch default (Ongoing + Pending) classes on mount - combined TESDA + SHS
  useEffect(() => {
    const fetchClasses = async () => {
      setLoading(true);
      setError(null);
      try {
        // => Renamed from /api/admin/classes
        const res = await axiosAdmin.get('/api/admin/batches');
        setClasses(res.data.batches);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch batches.');
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  // => Fetch facilities list - switches endpoint based on facilityViewMode,
  //    same pattern as Courses.jsx's Active/Deleted toggle
  const fetchFacilities = async () => {
    setFacilitiesLoading(true);
    setFacilitiesError(null);
    try {
      const path = facilityViewMode === 'deleted' ? '/api/admin/facilities/deleted' : '/api/admin/facilities';
      const res = await axiosAdmin.get(path);
      setFacilities(res.data.facilities);
    } catch (err) {
      setFacilitiesError(err.response?.data?.message || 'Failed to fetch facilities.');
    } finally {
      setFacilitiesLoading(false);
    }
  };

  // => Re-fetch whenever the Facilities tab is opened OR the view mode changes
  useEffect(() => {
    if (mainTab === 'facilities') fetchFacilities();
  }, [mainTab, facilityViewMode]);

  // => Fired by AddFacilityModal on successful creation
  const handleFacilityCreated = () => {
    setShowAddFacilityModal(false);
    fetchFacilities();
  };

  // => Fetch the facility picker list for the Class Sessions tab - only
  //    active facilities, each with its allowed course titles pre-attached
  const fetchSessionFacilities = async () => {
    setSessionFacilitiesLoading(true);
    setSessionFacilitiesError(null);
    try {
      const res = await axiosAdmin.get('/api/admin/class-sessions/facilities');
      setSessionFacilities(res.data.facilities);
    } catch (err) {
      console.error('Failed to load session facilities:', err);
      setSessionFacilitiesError('Could not load facilities. Please try again.');
    } finally {
      setSessionFacilitiesLoading(false);
    }
  };

  // => Re-fetch whenever the Class Sessions tab is opened
  useEffect(() => {
    if (mainTab === 'classes') fetchSessionFacilities();
  }, [mainTab]);

  // => NEW - fetch Mobile/Online sessions, rolling 60-day window from
  //    today. No date filter UI yet since this is a flat list, not a
  //    calendar - tell me if you want date-range controls added here.
  const getDateOffsetString = (daysOffset) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().slice(0, 10);
  };

  const fetchRemoteSessions = async () => {
    setRemoteSessionsLoading(true);
    setRemoteSessionsError(null);
    try {
      const from = getDateOffsetString(0);
      const to = getDateOffsetString(60);
      const res = await axiosAdmin.get(`/api/admin/class-sessions/remote?from=${from}&to=${to}`);
      setRemoteSessions(res.data.sessions);
    } catch (err) {
      console.error('Failed to load remote sessions:', err);
      setRemoteSessionsError('Could not load Mobile/Online sessions. Please try again.');
    } finally {
      setRemoteSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'classes' && sessionSubTab === 'remote') fetchRemoteSessions();
  }, [mainTab, sessionSubTab]);

  const handleRemoteSessionCreated = () => {
    setShowAddRemoteModal(false);
    fetchRemoteSessions();
  };

  // => Fetch trainers list - switches endpoint based on trainerViewMode,
  //    same pattern as fetchFacilities above
  const fetchTrainers = async () => {
    setTrainersLoading(true);
    setTrainersError(null);
    try {
      const path = trainerViewMode === 'deleted' ? '/api/admin/trainers/deleted' : '/api/admin/trainers';
      const res = await axiosAdmin.get(path);
      setTrainers(res.data.trainers);
    } catch (err) {
      setTrainersError(err.response?.data?.message || 'Failed to fetch trainers.');
    } finally {
      setTrainersLoading(false);
    }
  };

  // => Re-fetch whenever the Trainers tab is opened OR the view mode changes
  useEffect(() => {
    if (mainTab === 'trainers') fetchTrainers();
  }, [mainTab, trainerViewMode]);

  // => Fired by AddTrainerModal on successful creation
  const handleTrainerCreated = () => {
    setShowAddTrainerModal(false);
    fetchTrainers();
  };

  // => ConfirmModal helpers - shared between any facility/trainer action
  //    that needs a yes/no gate (currently just Restore, for both tabs)
  const openConfirm = (message, onConfirm) => setConfirmModal({ isOpen: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  // => Restore a soft-deleted facility - confirmed via ConfirmModal first
  // => Same axiosAdmin fix as handleRestoreTrainer - plain fetch was
  //    silently omitting the x-csrf-token header
  const handleRestoreFacility = (facility) => {
    openConfirm(`Restore "${facility.name}"? It will reappear in the active facilities list.`, async () => {
      try {
        await axiosAdmin.post(`/api/admin/facilities/${facility.public_id}/restore`);
        fetchFacilities();
      } catch (err) {
        console.error('Failed to restore facility:', err);
      }
    });
  };

  // => Restore a soft-deleted trainer - confirmed via ConfirmModal first
  // => Uses axiosAdmin instead of raw fetch specifically because axiosAdmin
  //    attaches the x-csrf-token header automatically - plain fetch here
  //    was silently sending no CSRF header at all, causing a 403 even with
  //    a perfectly valid session/token
  const handleRestoreTrainer = (trainer) => {
    openConfirm(`Restore "${trainer.trainer_full_name}"? They will reappear in the active trainers list.`, async () => {
      try {
        await axiosAdmin.post(`/api/admin/trainers/${trainer.public_id}/restore`);
        fetchTrainers();
      } catch (err) {
        console.error('Failed to restore trainer:', err);
      }
    });
  };

  // => Navigate to the correct batch detail page depending on program type
  // => Route must match App.jsx: /dashboard/classes/tesda/:publicId and
  //    /dashboard/classes/shs/:publicId
  const handleRowClick = (publicId, classType) => {
    const segment = classType === 'SHS' ? 'shs' : 'tesda';
    navigate(`/dashboard/classes/${segment}/${publicId}`);
  };

  // => Build query string from non-empty filters only
  const buildQuery = (f) => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v && String(v).trim()) params.set(k, String(v).trim());
    });
    return params.toString();
  };

  // => Merges the Type/Status pills into the search filters - those pills
  //    used to be client-side-only narrowing, but since Class Type/Status
  //    were removed from More Options as duplicates, they're now the only
  //    UI for setting program_type/status on an actual search request too
  const getSearchFilters = () => ({
    ...filters,
    program_type: typeFilter   === 'ALL' ? '' : typeFilter,
    status:       statusFilter === 'ALL' ? '' : statusFilter,
  });

  // => Run search against /api/admin/batches/search
  const handleSearch = async () => {
    const query = buildQuery(getSearchFilters());
    if (!query) return;

    // => Cancel any in-flight search
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      // => Renamed from /api/admin/classes/search
      const res = await axiosAdmin.get(`/api/admin/batches/search?${query}`, {
        signal: abortRef.current.signal,
      });
      setSearchResults(res.data.batches);
    } catch (err) {
      // => axios throws a CanceledError (not fetch's AbortError) when the
      // => signal fires - axios.isCancel() is the correct check for either
      if (axiosAdmin.isCancel?.(err) || err.name === 'CanceledError') return; // => stale request, ignore
      setSearchError(err.response?.data?.error || 'Search failed.');
    } finally {
      setSearchLoading(false);
    }
  };

  // => Allow pressing Enter in search inputs to trigger search
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // => Clear search and restore default view
  const handleClearSearch = () => {
    setFilters(EMPTY_FILTERS);
    setSearchResults(null);
    setSearchError(null);
    setMoreOpen(false);
  };

  
  // => Add Batch create/submit logic now lives inside AddBatchModal.jsx

  // => Determine what's currently displayed
  const isSearchMode = searchResults !== null;

  // => Applies type/status filters in memory only - no fetch, no API call
  //    Mirrors Enrollments.jsx's applyFilters
  const applyFilters = (rows) => rows.filter(r =>
    (typeFilter === 'ALL'   || r.program_type === typeFilter) &&
    (statusFilter === 'ALL' || r.status === statusFilter)
  );

  // => Same in-memory filtering pattern for Facilities - filters whatever's
  //    already loaded in `facilities`, never triggers a re-fetch. Combines
  //    restriction type + status + free-text search into one pass.
  const applyFacilityFilters = (rows) => rows.filter(f => {
    const matchesRestriction =
      facilityRestrictionFilter === 'ALL' ||
      (facilityRestrictionFilter === 'GENERAL' && f.allows_all_courses) ||
      (facilityRestrictionFilter === 'RESTRICTED' && !f.allows_all_courses);

    const matchesStatus =
      facilityStatusFilter === 'ALL' ||
      f.status?.toLowerCase() === facilityStatusFilter;

    const term = facilitySearchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      f.name?.toLowerCase().includes(term);

    return matchesRestriction && matchesStatus && matchesSearch;
  });

  // => Same in-memory filtering pattern for Trainers - filters whatever's
  //    already loaded in `trainers`, never triggers a re-fetch. Combines
  //    program type + status + free-text search into one pass.
  const applyTrainerFilters = (rows) => rows.filter(i => {
    const matchesProgram =
      trainerProgramFilter === 'ALL' ||
      (trainerProgramFilter === 'TESDA' && i.handles_tesda) ||
      (trainerProgramFilter === 'SHS' && i.handles_shs);

    const matchesStatus =
      trainerStatusFilter === 'ALL' ||
      i.status?.toLowerCase() === trainerStatusFilter;

    const term = trainerSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      i.trainer_full_name?.toLowerCase().includes(term) ||
      i.contact_number?.toLowerCase().includes(term) ||
      i.email?.toLowerCase().includes(term);

    return matchesProgram && matchesStatus && matchesSearch;
  });

  // => NEW - Facility-Based Class Sessions filter. One search box covers
  //    facility name AND both course-title arrays, so there's no need for
  //    2 separate TESDA/SHS search fields. The Course Type pill narrows to
  //    facilities that actually teach that program - "Allows all courses"
  //    facilities always pass, since they implicitly offer both.
  const applyFacilitySessionFilters = (rows) => rows.filter(f => {
    const matchesStatus =
      facilitySessionStatusFilter === 'ALL' ||
      f.status?.toLowerCase() === facilitySessionStatusFilter;

    const matchesType =
      facilitySessionTypeFilter === 'ALL' ||
      f.allows_all_courses ||
      (facilitySessionTypeFilter === 'TESDA' && f.tesda_course_titles?.length > 0) ||
      (facilitySessionTypeFilter === 'SHS' && f.shs_course_titles?.length > 0);

    const term = facilitySessionSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      f.name?.toLowerCase().includes(term) ||
      f.tesda_course_titles?.some(t => t.toLowerCase().includes(term)) ||
      f.shs_course_titles?.some(t => t.toLowerCase().includes(term));

    return matchesStatus && matchesType && matchesSearch;
  });

  // => NEW - Mobile & Online Class Sessions filter. Session Type pill,
  //    free text on batch/trainer, plus a date range on session_date.
  const applyRemoteSessionFilters = (rows) => rows.filter(s => {
    const matchesType =
      remoteSessionTypeFilter === 'ALL' ||
      s.session_type === remoteSessionTypeFilter;

    const term = remoteSessionSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      s.batch_label?.toLowerCase().includes(term) ||
      s.trainer_name?.toLowerCase().includes(term);

    // => session_date comes through as a YYYY-MM-DD-able string, same
    //    slicing formatDate() already does above, so plain string
    //    comparison works fine, the format is zero-padded and sorts correctly
    const sessionDateStr = s.session_date ? String(s.session_date).slice(0, 10) : '';
    const matchesDateFrom = !remoteSessionDateFrom || (sessionDateStr && sessionDateStr >= remoteSessionDateFrom);
    const matchesDateTo   = !remoteSessionDateTo   || (sessionDateStr && sessionDateStr <= remoteSessionDateTo);

    return matchesType && matchesSearch && matchesDateFrom && matchesDateTo;
  });

  // => Split default classes into two priority buckets, then run them
  //    through the client-side type/status filters
  const ongoing = applyFilters(classes.filter(c => c.status === 'Ongoing'));
  const pending = applyFilters(classes.filter(c => c.status === 'Pending'));

  // => Shared page header content - one header block sits above the tabs
  //    now, and its title/subtitle/count change based on which tab is
  //    active, instead of each tab rendering its own separate header
  const tabMeta = {
    classes:     { label: 'Class Sessions' },
    batches:     { label: 'Batches' },
    facilities:  { label: 'Facilities' },
    trainers: { label: 'Trainers' },
  };

  const headerSubtitle = (() => {
    if (mainTab === 'batches') {
      return isSearchMode
        ? <>Showing search results - <strong>{searchResults.length}</strong> class{searchResults.length !== 1 ? 'es' : ''} found.</>
        : <>Showing <strong>Ongoing</strong> and <strong>Pending</strong> classes.</>;
    }
    if (mainTab === 'facilities') {
      const suffix = facilityViewMode === 'deleted' ? ' (deleted)' : '';
      return <>Showing <strong>{facilities.length}</strong> facilit{facilities.length !== 1 ? 'ies' : 'y'}{suffix}.</>;
    }
    if (mainTab === 'trainers') {
      const suffix = trainerViewMode === 'deleted' ? ' (deleted)' : '';
      return <>Showing <strong>{trainers.length}</strong> trainer{trainers.length !== 1 ? 's' : ''}{suffix}.</>;
    }
    if (mainTab === 'classes') return <>Showing <strong>{sessionFacilities.length}</strong> facilit{sessionFacilities.length !== 1 ? 'ies' : 'y'}. Click a facility to view or book its schedule.</>;
    return '';
  })();

  // => Count badge only shows when there's a meaningful number to show -
  //    hidden during loading/error/search-mode, same conditions each tab
  //    used individually before this got consolidated.
  // => Facilities intentionally has none - the subtitle above already says
  //    "Showing N facilities", and a second number badge just duplicated
  //    that and read as confusing next to the Active/Inactive toggle.
  const headerCount = (() => {
    // => Renamed from "active classes" - now counts only the Ongoing
    //    array specifically so the label and the number actually match
    //    (the old version counted Ongoing + Pending combined but labeled
    //    it "active", which was misleading)
    if (mainTab === 'batches' && !loading && !error && !isSearchMode) {
      return { num: ongoing.length, label: 'Ongoing Batches' };
    }
    return null;
  })();

  return (
    <div className="adm-classes-page">

      {/* ════════════════════════════════════
          PAGE HEADER
          => Shared across all four tabs - title reads "Classes | <Tab>",
             subtitle and count badge swap based on mainTab via the
             headerSubtitle/headerCount computed above
          ════════════════════════════════════ */}
      <div className="adm-classes-header">
        <div>
          <h1 className="adm-classes-title">Classes | {tabMeta[mainTab].label}</h1>
          <p className="adm-classes-subtitle">{headerSubtitle}</p>
        </div>
        {headerCount && (
          <div className="adm-classes-count">
            <span className="adm-classes-count-num">{headerCount.num}</span>
            <span className="adm-classes-count-label">{headerCount.label}</span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          TOP-LEVEL TABS + VIEW TOGGLE ROW
          => Plain tab labels on the left (the "Classes | " prefix lives in
             the header above, not repeated on every tab button). The
             Active/Deleted toggle sits on the right of this same row,
             matching Courses.jsx's layout, and only renders while the
             Facilities tab is active - Batches/Class Sessions/Trainers
             don't have a soft-delete concept (yet).
          ════════════════════════════════════ */}
      <div className="adm-main-tabs-row">
        <div className="adm-main-tabs">
          {Object.entries(tabMeta).map(([key, meta]) => (
            <button
              key={key}
              className={`adm-main-tab-btn ${mainTab === key ? 'adm-main-tab-btn--active' : ''}`}
              onClick={() => setMainTab(key)}
            >
              {meta.label}
            </button>
          ))}
        </div>

        {mainTab === 'facilities' && (
          <div className="view-toggle">
            <button
              className={facilityViewMode === 'active' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setFacilityViewMode('active')}
            >
              Active/Inactive
            </button>
            <button
              className={facilityViewMode === 'deleted' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setFacilityViewMode('deleted')}
            >
              Deleted
            </button>
          </div>
        )}

        {mainTab === 'trainers' && (
          <div className="view-toggle">
            <button
              className={trainerViewMode === 'active' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setTrainerViewMode('active')}
            >
              Active/Inactive
            </button>
            <button
              className={trainerViewMode === 'deleted' ? 'view-toggle-btn view-toggle-active' : 'view-toggle-btn'}
              onClick={() => setTrainerViewMode('deleted')}
            >
              Deleted
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          BATCHES TAB
          => Everything from here through the Add Class modal below is
             the original, unmodified Classes.jsx content - just gated
             behind mainTab === 'batches' now instead of always rendering.
             Its old local header block was removed - the shared header
             above now covers title/subtitle/count for this tab too.
          ════════════════════════════════════ */}
      {mainTab === 'batches' && (
      <>
      {/* ════════════════════════════════════
          SEARCH BAR
          ════════════════════════════════════ */}
      <div className="adm-search-wrap">

        {/* => Primary search row: batch name + Search button + More Options toggle */}
        <div className="adm-search-row">
          <input
            type="text"
            className="adm-search-input"
            placeholder="Search by batch name…"
            value={filters.batch_name}
            onChange={e => setFilters(f => ({ ...f, batch_name: e.target.value }))}
            onKeyDown={handleKeyDown}
          />

          <button
            className="adm-search-btn"
            onClick={handleSearch}
            disabled={searchLoading || !buildQuery(getSearchFilters())}
          >
            {searchLoading ? 'Searching…' : 'Search'}
          </button>

          {/* => Toggle More Options panel */}
          {/* <button
            className={`adm-more-btn ${moreOpen ? 'adm-more-btn--open' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            More Options {moreOpen ? '▲' : '▼'}
          </button> */}
          <button
            className={`adm-more-btn ${moreOpen ? 'adm-more-btn--open' : ''}`}
            onClick={() => {
              const next = !moreOpen;
              setMoreOpen(next);
              // => Fetch options the first time the panel is opened
              if (next) fetchFilterOptions();
            }}
          >
            More Options
            <img
              className={`adm-chevron ${moreOpen ? 'adm-chevron--up' : ''}`}
              src={chevronIcon}
              alt=""
            />
          </button>
          {isSearchMode && (
            <button className="adm-clear-btn" onClick={handleClearSearch}>
              <img className="adm-btn-icon" src={closeIcon} alt="" /> Clear Search
            </button>
          )}
        </div>

        {/* => Collapsible More Options panel - filters based on tesda_batches/shs_batches
               => Class Type and Status dropdowns removed: they duplicated the
                  Type/Status pills in the filter row below, which now double
                  as the search filters too (see getSearchFilters()).
               => Trainer (TESDA) and Grade Level (SHS) fields removed - Sector/
                  Cluster plus the date range covers what's actually needed here.
               => Start Date From/To moved back into this panel from the filter
                  row below, so the panel always has something to show no
                  matter which Type pill is active - no more empty-state note. */}
        {moreOpen && (
          <div className="adm-more-panel">
            <div className="adm-more-grid">

              {/* => TESDA-only field - keyed off the Type pill below instead
                     of a dedicated dropdown in this panel */}
              {typeFilter === 'TESDA' && (
                <div className="adm-more-field">
                  <label className="adm-more-label">Sector</label>
                  {/* => Dropdown pulled from sectors table, cached after first open */}
                  <select
                    className="adm-more-input"
                    value={filters.sector}
                    onChange={e => setFilters(f => ({ ...f, sector: e.target.value }))}
                  >
                    <option value="">- Any -</option>
                    {filterOptions.sectors.map(s => (
                      <option key={s.sector_id} value={s.sector}>
                        {s.sector}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* => SHS-only field - keyed off the Type pill below instead
                     of a dedicated dropdown in this panel */}
              {/* => No Track field - track column removed from shs_batches entirely */}
              {typeFilter === 'SHS' && (
                <div className="adm-more-field">
                  <label className="adm-more-label">Cluster</label>
                  {/* => Dropdown pulled from shs_clusters, cached after first open */}
                  <select
                    className="adm-more-input"
                    value={filters.cluster}
                    onChange={e => setFilters(f => ({ ...f, cluster: e.target.value }))}
                  >
                    <option value="">- Any -</option>
                    {filterOptions.clusters.map(c => (
                      <option key={c.cluster_id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* => Start Date From/To - shown for All/TESDA/SHS alike,
                     still filters on start_date same as before */}
              <div className="adm-more-field">
                <label className="adm-more-label">Start Date From</label>
                <input
                  type="date"
                  className="adm-more-input"
                  value={filters.start_date_from}
                  onChange={e => setFilters(f => ({ ...f, start_date_from: e.target.value }))}
                />
              </div>

              <div className="adm-more-field">
                <label className="adm-more-label">Start Date To</label>
                <input
                  type="date"
                  className="adm-more-input"
                  value={filters.start_date_to}
                  onChange={e => setFilters(f => ({ ...f, start_date_to: e.target.value }))}
                />
              </div>

            </div>
          </div>
        )}

        {/* => Search error */}
        {searchError && (
          <p className="adm-search-error"><img className="adm-inline-icon" src={warningIcon} alt="" /> {searchError}</p>
        )}
      </div>

      {/* ════════════════════════════════════
          FILTER BUTTONS (type + status)
          => Client-side only - toggling these never re-fetches, they just
             re-filter classes/searchResults already sitting in state
          ════════════════════════════════════ */}
      <div className="adm-filter-wrap">
        <div className="adm-filter-group">
          <span className="adm-filter-label">Type</span>
          {['ALL', 'TESDA', 'SHS'].map(t => (
            <button
              key={t}
              className={`adm-filter-btn ${typeFilter === t ? 'adm-filter-btn--active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'ALL' ? 'All' : t}
            </button>
          ))}
        </div>

        <div className="adm-filter-group">
          <span className="adm-filter-label">Status</span>
          <select
            className="adm-filter-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            {Object.keys(statusClass).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        
      </div>

      {/* ════════════════════════════════════
          SEARCH RESULTS MODE
          ════════════════════════════════════ */}
      {isSearchMode && (
        <>
          {searchLoading && (
            <LoadingState message="Searching…" />
          )}

          {!searchLoading && searchResults.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"> <img src={searchIcon} alt="Search" /> </span>
              <p>No classes matched your search.</p>
            </div>
          )}

          {/* => searchResults has rows, but the type/status filters narrowed it to 0 */}
          {!searchLoading && searchResults.length > 0 && applyFilters(searchResults).length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={warningIcon} alt="" /></span>
              <p>No classes match the current Type/Status filters.</p>
            </div>
          )}

          {!searchLoading && applyFilters(searchResults).length > 0 && (
            <section className="adm-classes-section">
              <ClassTable rows={applyFilters(searchResults)} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          DEFAULT MODE (Ongoing + Pending)
          ════════════════════════════════════ */}
      {!isSearchMode && (
        <>
          {/* Loading state */}
          {loading && (
            <LoadingState message="Loading classes…" />
          )}

          {/* Error state */}
          {!loading && error && (
            <LoadingState variant="error" message={error} />
          )}

          {/* Empty state */}
          {!loading && !error && classes.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"> <img src={emptyClassesIcon} alt="No classes" /> </span>
              <p>No active classes found. Add one using the + button below.</p>
            </div>
          )}

          {/* => classes has rows, but type/status filters narrowed both buckets to 0 */}
          {!loading && !error && classes.length > 0 && ongoing.length === 0 && pending.length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={warningIcon} alt="" /></span>
              <p>No classes match the current Type/Status filters.</p>
            </div>
          )}

          {/* => Ongoing group - shown first (already running) */}
          {!loading && !error && ongoing.length > 0 && (
            <section className="adm-classes-section">
              <h2 className="adm-section-label adm-section-label--ongoing">
                Ongoing
                <span className="adm-section-count">{ongoing.length}</span>
              </h2>
              <ClassTable rows={ongoing} onRowClick={handleRowClick} />
            </section>
          )}

          {/* => Pending group */}
          {!loading && !error && pending.length > 0 && (
            <section className="adm-classes-section">
              <h2 className="adm-section-label adm-section-label--pending">
                Pending
                <span className="adm-section-count">{pending.length}</span>
              </h2>
              <ClassTable rows={pending} onRowClick={handleRowClick} />
            </section>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          ADD CLASS FAB (Floating Action Button)
          ════════════════════════════════════ */}
      <button
        className="adm-fab"
        onClick={() => setShowAddBatchModal(true)}
        title="Add new class"
        aria-label="Add new class"
      >
        {/* => White plus icon on green background */}
        <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {showAddBatchModal && (
        <AddBatchModal
          onClose={() => setShowAddBatchModal(false)}
        />
      )}

      </>
      )}

      {/* ════════════════════════════════════
          CLASSES TAB (session calendar)
          => Not built yet - calendar component comes in a later pass.
             Placeholder so the tab isn't a dead click.
          ════════════════════════════════════ */}
      {/* ════════════════════════════════════
          CLASS SESSIONS TAB
          => Facility picker - click a facility to open its dedicated
             calendar page (classes/sessions/:facilityPublicId). This tab
             never shows the calendar itself, only the entry point into it.
          ════════════════════════════════════ */}
      {mainTab === 'classes' && (
        <>

          {/* ════════════════════════════════════
              SEARCH + FILTER
              // => Changed from div.adm-classes-state to a fragment - that
              //    class is meant only for the small loading/error/empty
              //    state blocks (centered, 64px vertical padding), not the
              //    whole tab. Reusing it here is what centered/narrowed the
              //    search box and created the big blank gap above it.
              => Moved above the Type toggle, matching Batches/Facilities/
                 Trainers layout. Still subtab-specific under the hood,
                 sessionSubTab already holds the current value regardless
                 of where the toggle itself renders below.
              ════════════════════════════════════ */}
          {sessionSubTab === 'facility' ? (
            <>
              <div className="adm-search-wrap">
                <div className="adm-search-row">
                  <input
                    type="text"
                    className="adm-search-input"
                    placeholder="Search by facility or course name…"
                    value={facilitySessionSearchTerm}
                    onChange={e => setFacilitySessionSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="adm-filter-wrap">
                {/* => Session Type toggle (Facility-Based / Mobile & Online) moved
                       up onto this row - used to be its own row below the table */}
                <div className="adm-filter-group">
                  <span className="adm-filter-label">Session Type</span>
                  {[
                    { key: 'facility', label: 'Facility-Based' },
                    { key: 'remote',   label: 'Mobile & Online' },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`adm-filter-btn ${sessionSubTab === t.key ? 'adm-filter-btn--active' : ''}`}
                      onClick={() => setSessionSubTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="adm-filter-group">
                  <span className="adm-filter-label">Course Type</span>
                  {['ALL', 'TESDA', 'SHS'].map(t => (
                    <button
                      key={t}
                      className={`adm-filter-btn ${facilitySessionTypeFilter === t ? 'adm-filter-btn--active' : ''}`}
                      onClick={() => setFacilitySessionTypeFilter(t)}
                    >
                      {t === 'ALL' ? 'All' : t}
                    </button>
                  ))}
                </div>

                <div className="adm-filter-group">
                  <span className="adm-filter-label">Status</span>
                  <select
                    className="adm-filter-select"
                    value={facilitySessionStatusFilter}
                    onChange={e => setFacilitySessionStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="adm-search-wrap">
                <div className="adm-search-row">
                  <input
                    type="text"
                    className="adm-search-input"
                    placeholder="Search by batch or trainer name…"
                    value={remoteSessionSearchTerm}
                    onChange={e => setRemoteSessionSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="adm-filter-wrap">
                {/* => Session Type toggle (Facility-Based / Mobile & Online) moved
                       up onto this row - used to be its own row below the table */}
                <div className="adm-filter-group">
                  <span className="adm-filter-label">Session Type</span>
                  {[
                    { key: 'facility', label: 'Facility-Based' },
                    { key: 'remote',   label: 'Mobile & Online' },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`adm-filter-btn ${sessionSubTab === t.key ? 'adm-filter-btn--active' : ''}`}
                      onClick={() => setSessionSubTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* => Renamed from "Session Type" to "Format" so it doesn't
                       collide with the toggle above - this one filters
                       Mobile vs Online within the remote list specifically */}
                <div className="adm-filter-group">
                  <span className="adm-filter-label">Format</span>
                  {['ALL', 'Mobile', 'Online'].map(t => (
                    <button
                      key={t}
                      className={`adm-filter-btn ${remoteSessionTypeFilter === t ? 'adm-filter-btn--active' : ''}`}
                      onClick={() => setRemoteSessionTypeFilter(t)}
                    >
                      {t === 'ALL' ? 'All' : t}
                    </button>
                  ))}
                </div>

                <div className="adm-filter-group">
                  <span className="adm-filter-label">Date From</span>
                  <input
                    type="date"
                    className="adm-filter-date"
                    value={remoteSessionDateFrom}
                    onChange={e => setRemoteSessionDateFrom(e.target.value)}
                  />
                </div>

                <div className="adm-filter-group">
                  <span className="adm-filter-label">Date To</span>
                  <input
                    type="date"
                    className="adm-filter-date"
                    value={remoteSessionDateTo}
                    onChange={e => setRemoteSessionDateTo(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════
              TABLE CONTENT
              => Loading/error/empty/data states only now, search+filter
                 moved out above
              ════════════════════════════════════ */}
          {sessionSubTab === 'facility' ? (
            sessionFacilitiesLoading ? (
              <p>Loading facilities…</p>
            ) : sessionFacilitiesError ? (
              <p className="adm-form-error">{sessionFacilitiesError}</p>
            ) : sessionFacilities.length === 0 ? (
              <p>No active facilities yet. Add one under the Facilities tab first.</p>
            ) : applyFacilitySessionFilters(sessionFacilities).length === 0 ? (
              // => 3-way empty state, same distinction used on Courses
              <p>No facilities match this filter.</p>
            ) : (
              <div className="adm-table-wrap adm-table-wrap--maroon">
                <table className="adm-table cs-sessions-table">
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th>TESDA Courses</th>
                      <th>SHS Courses</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applyFacilitySessionFilters(sessionFacilities).map((f, idx) => {
                      const tesdaList = [...f.tesda_course_titles].sort((a, b) => a.localeCompare(b));
                      const shsList = [...f.shs_course_titles].sort((a, b) => a.localeCompare(b));
                      return (
                        <tr
                          key={f.public_id}
                          className="adm-table-row"
                          style={{ animationDelay: `${idx * 40}ms`, cursor: 'pointer' }}
                          onClick={() => navigate(`/dashboard/classes/sessions/${f.public_id}`)}
                          title="View / book this facility's schedule"
                        >
                          <td className="adm-td-course">
                            <span className="adm-course-name">{f.name}</span>
                          </td>
                          <td>
                            {f.allows_all_courses ? 'Allows all courses' : tesdaList.length === 0 ? 'None' : (
                              <ul className="cs-course-list">
                                {tesdaList.map(title => <li key={title}>{title}</li>)}
                              </ul>
                            )}
                          </td>
                          <td>
                            {f.allows_all_courses ? 'Allows all courses' : shsList.length === 0 ? 'None' : (
                              <ul className="cs-course-list">
                                {shsList.map(title => <li key={title}>{title}</li>)}
                              </ul>
                            )}
                          </td>
                          <td>
                            <span
                              className="adm-badge"
                              style={
                                f.status?.toLowerCase() === 'active'
                                  ? { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }
                                  : { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }
                              }
                            >
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <>
              {remoteSessionsLoading ? (
                <p>Loading Mobile/Online sessions…</p>
              ) : remoteSessionsError ? (
                <p className="adm-form-error">{remoteSessionsError}</p>
              ) : remoteSessions.length === 0 ? (
                <p>No Mobile or Online sessions scheduled in the next 60 days.</p>
              ) : applyRemoteSessionFilters(remoteSessions).length === 0 ? (
                <p>No sessions match this filter.</p>
              ) : (
                <div className="adm-table-wrap adm-table-wrap--maroon">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th className="adm-th-course">Batch</th>
                        <th>Trainer</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Location / Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applyRemoteSessionFilters(remoteSessions).map((s, idx) => (
                        <tr key={s.public_id} className="adm-table-row" style={{ animationDelay: `${idx * 40}ms` }}>
                          <td>
                            <span className={`adm-type-badge adm-type-badge--${s.session_type === 'Mobile' ? 'mobile' : 'online'}`}>
                              {s.session_type}
                            </span>
                          </td>
                          <td className="adm-td-course"><span className="adm-course-name">{s.batch_label}</span></td>
                          <td>{s.trainer_name ?? '-'}</td>
                          <td className="adm-td-date">{formatDate(s.session_date)}</td>
                          <td>{s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}</td>
                          <td>{s.session_type === 'Mobile' ? (s.mobile_location || '-') : (s.meeting_link || '-')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* => Same FAB pattern as Facilities/Trainers tabs - opens
                     AddSessionModal WITHOUT a facilityPublicId, so it comes
                     up in Mobile/Online mode */}
              <button
                className="adm-fab"
                onClick={() => setShowAddRemoteModal(true)}
                title="Add Mobile/Online session"
                aria-label="Add Mobile/Online session"
              >
                <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {showAddRemoteModal && (
                <AddSessionModal
                  onClose={() => setShowAddRemoteModal(false)}
                  onCreated={handleRemoteSessionCreated}
                />
              )}
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          FACILITIES TAB
          => Local header removed - the shared header above the tab bar
             handles title/subtitle/count for this tab too. Trainers tab
             mirrors this structure exactly.
          ════════════════════════════════════ */}
      {mainTab === 'facilities' && (
        <>
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by facility name…"
                value={facilitySearchTerm}
                onChange={e => setFacilitySearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Restriction</span>
              {['ALL', 'GENERAL', 'RESTRICTED'].map(t => (
                <button
                  key={t}
                  className={`adm-filter-btn ${facilityRestrictionFilter === t ? 'adm-filter-btn--active' : ''}`}
                  onClick={() => setFacilityRestrictionFilter(t)}
                >
                  {t === 'ALL' ? 'All' : t === 'GENERAL' ? 'General' : 'Restricted'}
                </button>
              ))}
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              <select
                className="adm-filter-select"
                value={facilityStatusFilter}
                onChange={e => setFacilityStatusFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {facilitiesLoading && (
            <LoadingState message="Loading facilities…" />
          )}

          {!facilitiesLoading && facilitiesError && (
            <LoadingState variant="error" message={facilitiesError} />
          )}

          {!facilitiesLoading && !facilitiesError && applyFacilityFilters(facilities).length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={emptyClassesIcon} alt="No facilities" /></span>
              <p>
                {facilities.length > 0
                  ? 'No facilities match this filter.'
                  : facilityViewMode === 'deleted'
                  ? 'No deleted facilities.'
                  : 'No facilities yet. Add one using the + button below.'}
              </p>
            </div>
          )}

          {!facilitiesLoading && !facilitiesError && applyFacilityFilters(facilities).length > 0 && (
            <div className="adm-table-wrap adm-table-wrap--maroon">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Facility Name</th>
                    <th>Capacity</th>
                    <th>Restriction</th>
                    <th>{facilityViewMode === 'deleted' ? 'Action' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {applyFacilityFilters(facilities).map((f, idx) => (
                    <tr
                      key={f.public_id}
                      className="adm-table-row"
                      style={{ animationDelay: `${idx * 40}ms`, cursor: facilityViewMode === 'deleted' ? 'default' : 'pointer' }}
                      onClick={facilityViewMode === 'deleted' ? undefined : () => navigate(`/dashboard/classes/facilities/${f.public_id}`)}
                      title={facilityViewMode === 'deleted' ? undefined : 'View / edit facility'}
                    >
                      <td className="adm-td-course">
                        <span className="adm-course-name">{f.name}</span>
                      </td>
                      <td>{f.capacity ?? '-'}</td>
                      <td>{f.allows_all_courses ? 'General (allows all)' : 'Restricted'}</td>
                      <td>
                        {facilityViewMode === 'deleted' ? (
                          <button className="btn-restore" onClick={(e) => { e.stopPropagation(); handleRestoreFacility(f); }}>
                            Restore
                          </button>
                        ) : (
                          <span
                            className="adm-badge"
                            style={
                              f.status?.toLowerCase() === 'active'
                                ? { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }
                                : { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }
                            }
                          >
                            {f.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {facilityViewMode === 'active' && (
          <button
            className="adm-fab"
            onClick={() => setShowAddFacilityModal(true)}
            title="Add new facility"
            aria-label="Add new facility"
          >
            <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          )}

          {showAddFacilityModal && (
            <AddFacilityModal
              onClose={() => setShowAddFacilityModal(false)}
              onCreated={handleFacilityCreated}
            />
          )}
        </>
      )}

      {/* ════════════════════════════════════
          TRAINERS TAB
          => Local header removed - the shared header above the tab bar
             now handles title/subtitle/count for this tab too. Mirrors
             the Facilities tab structure exactly.
          ════════════════════════════════════ */}
      {mainTab === 'trainers' && (
        <>

          {/* ════════════════════════════════════
              SEARCH BAR
              => Client-side only - matches against name, contact number,
                 and email of already-loaded trainers, never triggers
                 a re-fetch. No More Options panel here - Status lives
                 inline in the filter row below instead, since it was the
                 only field in there.
              ════════════════════════════════════ */}
          <div className="adm-search-wrap">
            <div className="adm-search-row">
              <input
                type="text"
                className="adm-search-input"
                placeholder="Search by name, contact number, or email…"
                value={trainerSearchTerm}
                onChange={e => setTrainerSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* ════════════════════════════════════
              FILTER BUTTONS (program type + status)
              => Client-side only, mirrors the Batches Type/Status row -
                 toggling these never re-fetches, they just re-filter
                 whatever's already loaded in `trainers`
              ════════════════════════════════════ */}
          <div className="adm-filter-wrap">
            <div className="adm-filter-group">
              <span className="adm-filter-label">Program Type</span>
              {['ALL', 'TESDA', 'SHS'].map(t => (
                <button
                  key={t}
                  className={`adm-filter-btn ${trainerProgramFilter === t ? 'adm-filter-btn--active' : ''}`}
                  onClick={() => setTrainerProgramFilter(t)}
                >
                  {t === 'ALL' ? 'All' : t}
                </button>
              ))}
            </div>

            <div className="adm-filter-group">
              <span className="adm-filter-label">Status</span>
              <select
                className="adm-filter-select"
                value={trainerStatusFilter}
                onChange={e => setTrainerStatusFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {trainersLoading && (
            <LoadingState message="Loading trainers…" />
          )}

          {!trainersLoading && trainersError && (
            <LoadingState variant="error" message={trainersError} />
          )}

          {!trainersLoading && !trainersError && applyTrainerFilters(trainers).length === 0 && (
            <div className="adm-classes-state">
              <span className="adm-state-icon"><img src={emptyClassesIcon} alt="No trainers" /></span>
              <p>
                {trainers.length > 0
                  ? 'No trainers match this filter.'
                  : trainerViewMode === 'deleted'
                  ? 'No deleted trainers.'
                  : 'No trainers yet. Add one using the + button below.'}
              </p>
            </div>
          )}

          {!trainersLoading && !trainersError && applyTrainerFilters(trainers).length > 0 && (
            <div className="adm-table-wrap adm-table-wrap--maroon">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Contact Number</th>
                    <th>Program Type</th>
                    <th>{trainerViewMode === 'deleted' ? 'Action' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {applyTrainerFilters(trainers).map((i, idx) => (
                    <tr
                      key={i.public_id}
                      className="adm-table-row"
                      style={{ animationDelay: `${idx * 40}ms`, cursor: trainerViewMode === 'deleted' ? 'default' : 'pointer' }}
                      onClick={trainerViewMode === 'deleted' ? undefined : () => navigate(`/dashboard/classes/trainers/${i.public_id}`)}
                      title={trainerViewMode === 'deleted' ? undefined : 'View / edit trainer'}
                    >
                      <td className="adm-td-course">
                        <span className="adm-course-name">{i.trainer_full_name}</span>
                      </td>
                      <td>{i.contact_number}</td>
                      <td>
                        {i.handles_tesda && i.handles_shs
                          ? 'TESDA + SHS'
                          : i.handles_tesda
                          ? 'TESDA'
                          : i.handles_shs
                          ? 'SHS'
                          : '-'}
                      </td>
                      <td>
                        {trainerViewMode === 'deleted' ? (
                          <button className="btn-restore" onClick={(e) => { e.stopPropagation(); handleRestoreTrainer(i); }}>
                            Restore
                          </button>
                        ) : (
                          <span
                            className="adm-badge"
                            style={
                              i.status?.toLowerCase() === 'active'
                                ? { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }
                                : { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }
                            }
                          >
                            {i.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* => Same FAB pattern as the Facilities tab - opens AddTrainerModal
                 instead. Hidden in the Deleted view - you don't "add" a new
                 trainer while browsing the trash. */}
          {trainerViewMode === 'active' && (
          <button
            className="adm-fab"
            onClick={() => setShowAddTrainerModal(true)}
            title="Add new trainer"
            aria-label="Add new trainer"
          >
            <svg className="adm-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          )}

          {showAddTrainerModal && (
            <AddTrainerModal
              onClose={() => setShowAddTrainerModal(false)}
              onCreated={handleTrainerCreated}
            />
          )}
        </>
      )}

      {/* => Shared confirmation dialog - currently only used by Facility
             Restore, but kept generic (message/onConfirm passed in) so any
             future tab (Trainers, etc.) can reuse the same instance */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />

    </div>
  );
}


// ClassTable - reusable table sub-component
// => Course/Sector/Trainer columns are TESDA-only; Cluster fills in for
//    SHS rows (course_name/sector/trainer_name are NULL on the SHS side
//    of the UNION ALL, and vice versa - see adminBatchModel.js)

function ClassTable({ rows, onRowClick }) {
  return (
    // => Added the --batches modifier here - it was missing, so table-layout:
    //    fixed and all the column-width rules below were silently not
    //    applying. That's why Ongoing and Pending rendered as two
    //    independently auto-sized tables instead of lining up.
    <div className="adm-table-wrap adm-table-wrap--batches adm-table-wrap--maroon">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Type</th>
            {/* => className added to match .adm-th-course / .adm-th-sector in
                   the CSS - without these on the <th> itself, table-layout:
                   fixed had no header width to lock onto for these columns */}
            <th className="adm-th-course">Batch Name</th>
            <th className="adm-th-sector">Sector / Cluster</th>
            <th>Trainer</th>
            <th>Start Date</th>
            <th>End Date</th>
            {/* => Header clarified - this column now specifically reflects
                   Approved enrollments against capacity, not total roster */}
            <th>Approved / Max</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isShs = row.program_type === 'SHS';
            return (
              <tr
                key={row.public_id}
                className="adm-table-row"
                style={{ animationDelay: `${idx * 40}ms`, cursor: 'pointer' }}
                onClick={() => onRowClick(row.public_id, row.program_type)}
                title="View batch detail"
              >
                <td>
                  <span className={`adm-type-badge adm-type-badge--${isShs ? 'shs' : 'tesda'}`}>
                    {row.program_type}
                  </span>
                </td>
                <td className="adm-td-course">
                  <span className="adm-course-name">
                    {/* => batch_sequence is the per-course/cluster display number,
                           batch_id is just the raw primary key and skips gaps left
                           by dissolved batches, so it was showing "Batch #6" for
                           what is really only the 2nd batch of that course */}
                    {isShs
                      ? `${row.cluster ?? 'Unnamed Cluster'} (Batch #${row.batch_sequence ?? row.batch_id})`
                      : `${row.course_name ?? 'Unnamed Course'}${row.certification_type ? ` (${row.certification_type})` : ''} (Batch #${row.batch_sequence ?? row.batch_id})`}
                  </span>
                </td>
                {/* => Labeled explicitly as Sector/Cluster in the cell itself,
                       not just the column header - in a mixed TESDA/SHS table,
                       "Electronics" alone doesn't say whether it's a sector or
                       a cluster at a glance */}
                <td>
                  {isShs
                    ? (row.cluster ? `${row.cluster} (Cluster)` : '-')
                    : (row.sector ? `${row.sector} (Sector)` : '-')}
                </td>
                {/* => Back to a plain '-' for consistency with the rest of the
                       table (dates, etc. already fall back to '-') instead of
                       a one-off "Unassigned" label just for this column */}
                <td>{row.trainer_name ?? '-'}</td>
                <td className="adm-td-date">{formatDate(row.start_date)}</td>
                <td className="adm-td-date">{formatDate(row.end_date)}</td>
                <td className="adm-td-slots">
                  {/* => Show enrolled count vs max - highlights if full */}
                  <span className={row.enrolled_count >= row.max_students ? 'adm-slots-full' : ''}>
                    {row.enrolled_count ?? 0}
                  </span>
                  <span className="adm-slots-sep"> / </span>
                  <span>{row.max_students}</span>
                </td>
                <td>
                  <span className={`adm-badge ${statusClass[row.status] || ''}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
