// => components/Classes/FacilitySessionCalendar/facilitySessionCalendar.jsx
// => Dedicated calendar page for one facility, reached from the Class
//    Sessions tab's facility picker. Lives under the Classes tab, not the
//    Facilities tab - Facilities stays pure CRUD, this is where actual
//    scheduling happens. Route: classes/sessions/:facilityPublicId

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar, Views, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import axiosAdmin from '../../../utils/axiosAdmin.js'; 
import BackButton from '../../BackButton/BackButton.jsx';
import AddSessionModal from '../AddSessionModal/addSessionModal.jsx';
import warningIcon from '../../../assets/icons/warning.png'; 
import calendarIcon from '../../../assets/icons/calendar.png'; 
import './facilitySessionCalendar.css';

// => FIX: the previous localizer wrapped startOfWeek in `() => startOfWeek(new
//    Date(), {...})`, which ignores the (date, culture) arguments RBC
//    actually calls it with. That silently broke month-grid math and
//    Back/Next/Month navigation. Fix is to pass date-fns's startOfWeek
//    directly (unwrapped), and set the Monday-start via the locale object
//    instead, which is the pattern RBC's dateFnsLocalizer actually expects.
const locales = {
  'en-US': {
    ...enUS,
    options: {
      ...enUS.options,
      weekStartsOn: 1, // => Monday, matches your Mon-Fri work week
    },
  },
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek, // => raw function reference, NOT wrapped
  getDay,
  locales,
});

// => Booking window shown on the grid - mirrors BOOKING_START_TIME /
//    BOOKING_END_TIME in adminClassSessionService.js. If those ever change,
//    change these two to match.
const GRID_MIN_TIME = new Date(0, 0, 0, 8, 0, 0);
const GRID_MAX_TIME = new Date(0, 0, 0, 17, 0, 0);

// => FIX: this MUST be a stable reference. It was previously an inline
//    array literal in the JSX (`views={[Views.WORK_WEEK, Views.MONTH]}`),
//    which creates a NEW array on every render. react-big-calendar watches
//    the `views` prop reference internally, and a new reference every
//    render was resetting its internal navigation state right after every
//    Next/Back click, which is what caused the infinite fetch loop.
const CALENDAR_VIEWS = [Views.WORK_WEEK, Views.MONTH];

export default function FacilitySessionCalendar() {
  const { facilityPublicId } = useParams();

  const [facility, setFacility] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [slotPrefill, setSlotPrefill] = useState(null);

  // => Controlled date/view - previously relied on RBC's uncontrolled
  //    defaultView, switching to controlled removes any ambiguity about
  //    who owns navigation state, and is the standard fix for this bug.
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(Views.WORK_WEEK);

  const [visibleRange, setVisibleRange] = useState(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(end.getDate() + 4);
    return { start, end };
  });

  // => PH public holidays - keyed by 'YYYY-MM-DD' -> holiday name. Fetched
  //    from Nager.Date's free public API (no key required), per year, and
  //    only re-fetched for years not already cached. Shown as a shaded date
  //    on the grid, does NOT block booking - just a visual heads-up.
  const [holidays, setHolidays] = useState({});
  const fetchedYearsRef = useRef(new Set());

  useEffect(() => {
    const years = new Set([visibleRange.start.getFullYear(), visibleRange.end.getFullYear()]);
    const yearsToFetch = [...years].filter(y => !fetchedYearsRef.current.has(y));
    if (yearsToFetch.length === 0) return;
    yearsToFetch.forEach(y => fetchedYearsRef.current.add(y));

    Promise.all(
      yearsToFetch.map(y =>
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/PH`)
          .then(r => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    ).then(results => {
      setHolidays(prev => {
        const next = { ...prev };
        results.flat().forEach(h => { next[h.date] = h.localName; });
        return next;
      });
    });
  }, [visibleRange]);

  const fetchSessions = useCallback(async (range) => {
    setLoading(true);
    setError(null);
    try {
      const from = format(range.start, 'yyyy-MM-dd');
      const to = format(range.end, 'yyyy-MM-dd');
      const res = await axiosAdmin.get(`/api/admin/class-sessions/facilities/${facilityPublicId}?from=${from}&to=${to}`);
      setFacility(res.data.facility);
      setEvents(res.data.sessions.map(sessionToEvent));
    } catch (err) {
      console.error('Failed to load facility sessions:', err);
      setError('Could not load this facility\'s sessions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [facilityPublicId]);

  useEffect(() => {
    fetchSessions(visibleRange);
  }, [fetchSessions, visibleRange]);

  const handleRangeChange = (range) => {
    if (Array.isArray(range)) {
      setVisibleRange({ start: range[0], end: range[range.length - 1] });
    } else {
      setVisibleRange({ start: range.start, end: range.end });
    }
  };

  const handleSelectSlot = ({ start, end }) => {
    setSlotPrefill({
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
    });
    setShowAddModal(true);
  };

  const handleSelectEvent = (event) => {
    const s = event.resource;
    toast(
      `${event.title}\n${format(event.start, 'h:mm a')} - ${format(event.end, 'h:mm a')}` +
      (s.trainer_name ? `\nTrainer: ${s.trainer_name}` : ''),
      { icon: null }
    );
  };

  const handleSessionCreated = () => {
    setShowAddModal(false);
    setSlotPrefill(null);
    fetchSessions(visibleRange);
    toast.success('Class session created.');
  };

  const eventPropGetter = (event) => ({
    style: {
      backgroundColor: event.resource.batch_type === 'shs' ? '#1a56db' : '#8a0d17',
      borderRadius: '6px',
      border: 'none',
    },
  });

  // => NEW - shades a date cell if it's a PH holiday, purely visual
  const dayPropGetter = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (holidays[dateStr]) {
      return { style: { backgroundColor: 'rgba(245, 158, 11, 0.14)' }, title: holidays[dateStr] };
    }
    return {};
  };

  // => appends the holiday name next to the date in Week/Work Week/Day
  //    view headers (e.g. "24 Fri · Ninoy Aquino Day Commemoration")
  const HolidayHeader = ({ date, label }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const holidayName = holidays[dateStr];
    return (
      <span>
        {label}
        {holidayName && <span className="fsc-holiday-tag"> · {holidayName}</span>}
      </span>
    );
  };

  // => Month view's day-number cell. drilldownView/onDrillDown are
  //    what RBC uses to make the date number clickable (switches to Day
  //    view on click) - re-wiring them onto our own <a> preserves that
  //    behavior instead of silently losing it by replacing the cell content.
  const MonthDateHeader = ({ date, label, drilldownView, onDrillDown }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const holidayName = holidays[dateStr];
    return (
      <div className="fsc-month-date-header">
        {drilldownView ? (
          <a href="#" className="rbc-button-link" onClick={onDrillDown}>{label}</a>
        ) : (
          <span>{label}</span>
        )}
        {holidayName && (
          <span className="fsc-month-holiday-tag" title={holidayName}>
            {holidayName}
          </span>
        )}
      </div>
    );
  };

  // => Replaces RBC's own event markup entirely instead of fighting its
  //    internal flex rules with CSS overrides - RBC's default event splits
  //    the time label and title into two separate divs with their own
  //    conflicting flex behavior, and !important overrides on those weren't
  //    reliably winning. This renders both as one plain block we fully
  //    control, so centering just works.
  const CustomEvent = ({ event }) => (
    <div className="fsc-event-inner">
      <span className="fsc-event-time">{format(event.start, 'h:mm a')} – {format(event.end, 'h:mm a')}</span>
      <span className="fsc-event-title">{event.title}</span>
    </div>
  );

  if (loading && !facility) {
    return (
      <div className="fsc-state">
        <div className="fsc-spinner" />
        <p>Loading facility calendar…</p>
      </div>
    );
  }

  if (error && !facility) {
    return (
      <div className="fsc-state fsc-state--error">
        <img className="fsc-inline-icon" src={warningIcon} alt="" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="fsc-page">
      <BackButton />

      <div className="fsc-header">
        <img className="fsc-header-icon" src={calendarIcon} alt="" />
        <div>
          <h1 className="fsc-title">{facility?.name}</h1>
          <p className="fsc-subtitle">
            {facility?.allows_all_courses
              ? 'Allows all courses'
              : 'Restricted facility - only eligible batches can be booked here'}
          </p>
        </div>
      </div>

      <div className="fsc-calendar-wrap">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          date={currentDate}
          view={currentView}
          onNavigate={setCurrentDate}
          onView={setCurrentView}
          views={CALENDAR_VIEWS}
          min={GRID_MIN_TIME}
          max={GRID_MAX_TIME}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onRangeChange={handleRangeChange}
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          components={{ header: HolidayHeader, month: { dateHeader: MonthDateHeader }, event: CustomEvent }}
          style={{ height: 700 }}
        />
      </div>

      <p className="fsc-legend"><span className="fsc-legend-swatch" /> Philippine holiday</p>

      {showAddModal && (
        <AddSessionModal
          facilityPublicId={facilityPublicId}
          prefill={slotPrefill}
          onClose={() => { setShowAddModal(false); setSlotPrefill(null); }}
          onCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}

function sessionToEvent(session) {
  // => Neon can return DATE columns as full ISO timestamps
  //    ('2026-07-24T00:00:00.000Z') rather than plain 'YYYY-MM-DD'. Slicing
  //    to the first 10 chars normalizes either shape before concatenating
  //    the time - same fix Classes.jsx's formatDate() already applies for
  //    the same reason. Without this, the concatenated string is invalid
  //    and the event silently fails to render with no console error.
  const datePart = String(session.session_date).slice(0, 10);
  const start = new Date(`${datePart}T${session.start_time}`);
  const end = new Date(`${datePart}T${session.end_time}`);
  return {
    title: session.batch_label,
    start,
    end,
    resource: session,
  };
}