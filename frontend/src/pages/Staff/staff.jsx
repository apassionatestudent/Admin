import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import axiosAdmin from '../../utils/axiosAdmin.js';
import AddStaffModal from '../../components/Staff/AddStaffModal/addStaffModal.jsx';
import LoadingState from '../../components/LoadingState/loadingState.jsx';
import './staff.css';

// => Icon imports - matches Classes.jsx's convention (magnifying-glass.png for search)
import SearchIcon from '../../assets/icons/magnifying-glass.png';

export default function Staff() {
    const navigate = useNavigate();
    const { admin } = useOutletContext();

    const [staffList, setStaffList] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // => Belt-and-suspenders redirect - the backend already blocks this with
    // => requireSuperAdmin, but a regular admin shouldn't even see the page render
    useEffect(() => {
        if (admin && admin.role !== 'super_admin') {
            navigate('/dashboard');
        }
    }, [admin, navigate]);

    // => Endpoint and URL path stay /api/admin/admins and /dashboard/admins on
    // => purpose - this is a display-only rename, backend routes and DB schema
    // => are untouched
    const fetchStaff = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await axiosAdmin.get('/api/admin/admins', {
                params: { page, search },
            });
            setStaffList(res.data.admins);
            setTotalPages(res.data.totalPages);
        } catch {
            toast.error('Failed to load staff');
        } finally {
            setIsLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchStaff();
    }, [fetchStaff]);

    const handleCreated = () => {
        setIsModalOpen(false);
        toast.success('Staff created - invite email sent');
        setPage(1);
        fetchStaff();
    };

    return (
        <main className="adm-admins-page">
            <div className="adm-admins-header">
                <div>
                    <h2>Staff</h2>
                    <p className="adm-admins-subtitle">
                        Showing <strong>{staffList.length}</strong> staff member{staffList.length !== 1 ? 's' : ''}.
                    </p>
                </div>
            </div>

            <div className="adm-admins-toolbar">
                <div className="adm-admins-search">
                    <img src={SearchIcon} alt="Search icon" />
                    <input
                        type="text"
                        placeholder="Search by name or email"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
            </div>

            <div className="adm-admins-table-wrap">
                <table className="adm-admins-table">
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Sections</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                <td colSpan={5} className="adm-admins-table-empty">
                                    <LoadingState message="Loading staff..." />
                                </td>
                            </tr>
                        )}
                        {!isLoading && staffList.length === 0 && (
                            <tr><td colSpan={5} className="adm-admins-table-empty">No staff found. Click the + button to invite one.</td></tr>
                        )}
                        {!isLoading && staffList.map((row) => (
                            <tr
                                key={row.public_id}
                                onClick={() => navigate(`/dashboard/staff/${row.public_id}`)}
                            >
                                <td>{row.full_name}</td>
                                <td>{row.email}</td>
                                <td>{row.role === 'super_admin' ? 'Super Admin' : 'Staff'}</td>
                                <td>
                                    <span className={`adm-admins-status adm-admins-status--${row.status}`}>
                                        {row.status}
                                    </span>
                                </td>
                                <td>{row.role === 'super_admin' ? 'All' : row.sections.length}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="adm-admins-pagination">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                    <span>Page {page} of {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
            )}

            {/* => Plain '+' text on the green FAB - opens AddStaffModal.
                   Same pattern as Classes.jsx's Trainers tab FAB */}
            <button
                className="adm-fab"
                onClick={() => setIsModalOpen(true)}
                title="Add new staff"
                aria-label="Add new staff"
            >
                <span className="adm-fab-icon">+</span>
            </button>

            {isModalOpen && (
                <AddStaffModal
                    onClose={() => setIsModalOpen(false)}
                    onCreated={handleCreated}
                />
            )}
        </main>
    );
}