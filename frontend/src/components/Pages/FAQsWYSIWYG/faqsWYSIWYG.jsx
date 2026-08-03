// => components/Pages/FAQsWYSIWYG/faqsWYSIWYG.jsx
// => Sections-based FAQ manager. "+ Add Section" in the header mirrors
//    Courses.jsx's "+ Add Sector" pattern - a section must exist before a
//    FAQ can be filed under it. Each section renders its own table of
//    FAQs with Edit/Delete actions per row.
// => Frontend-only for now - sections/faqs live in local state until the
//    faqs_sections + faqs backend routes exist.

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import toast from 'react-hot-toast';

import axiosAdmin from '../../../utils/axiosAdmin.js';
import AddFAQSectionModal from '../AddFAQSectionModal/addFAQSectionModal.jsx';
import AddFAQModal from '../AddFAQModal/addFAQModal.jsx';
import ConfirmModal from '../../ConfirmModal/ConfirmModal.jsx';
import LoadingState from '../../LoadingState/loadingState.jsx';
import './faqsWYSIWYG.css';

// => forwardRef so pages.jsx's shared header "+ Add Section" button can
//    call openAddSectionModal() directly - the title/subtitle/button that
//    used to live in this component's own header now live in pages.jsx
// => Wired to /api/admin/pages/faqs-sections and /api/admin/pages/faqs -
//    real backend, real Neon rows. Sections and FAQs are keyed by
//    public_id now, not a local counter, since both come from the server.
const FAQsWYSIWYG = forwardRef(function FAQsWYSIWYG(_props, ref) {
  const [sections, setSections] = useState([]); // => [{ public_id, name }]
  const [faqs, setFaqs] = useState([]);         // => [{ public_id, section_id, question, answer }] - section_id IS the section's public_id, see faqModel.js's join
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [sectionModalOpen, setSectionModalOpen] = useState(false);

  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);      // => null = Add mode
  const [addingToSectionId, setAddingToSectionId] = useState(null); // => which section's "+ Add FAQ" was clicked

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });

  // => Exposes openAddSectionModal to pages.jsx's header button via ref
  useImperativeHandle(ref, () => ({
    openAddSectionModal: () => setSectionModalOpen(true),
  }));

  const fetchAll = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const [sectionsRes, faqsRes] = await Promise.all([
        axiosAdmin.get('/api/admin/pages/faqs-sections'),
        axiosAdmin.get('/api/admin/pages/faqs'),
      ]);
      setSections(sectionsRes.data.sections);
      setFaqs(faqsRes.data.faqs);
    } catch (err) {
      console.error('Failed to fetch FAQ sections/FAQs:', err);
      setFetchError('Failed to load FAQs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // ════════════════════════════════════
  // SECTIONS
  // ════════════════════════════════════

  // => AddFAQSectionModal makes the actual POST itself (same pattern as
  //    AddFAQModal/AddAnnouncementModal) - this just receives the
  //    already-created row from the server
  const handleSectionCreated = (section) => {
    setSections((prev) => [...prev, section]);
    setSectionModalOpen(false);
    toast.success('Section added.');
  };

  // => Client-side check here just avoids a round trip for the common
  //    case - the server also enforces this via the FK on
  //    faqs.section_id and returns 409 if it's violated
  const handleDeleteSection = (section) => {
    const hasFaqs = faqs.some((f) => f.section_id === section.public_id);
    if (hasFaqs) {
      toast.error('Move or delete this section\'s FAQs first.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: `Delete the section "${section.name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await axiosAdmin.delete(`/api/admin/pages/faqs-sections/${section.public_id}`);
          setSections((prev) => prev.filter((s) => s.public_id !== section.public_id));
          toast.success('Section deleted.');
        } catch (err) {
          console.error('Failed to delete FAQ section:', err);
          toast.error(err.response?.data?.error || 'Failed to delete section.');
        }
      },
    });
  };

  // ════════════════════════════════════
  // FAQs
  // ════════════════════════════════════

  const openAddFaqModal = (sectionId) => {
    setEditingFaq(null);
    setAddingToSectionId(sectionId);
    setFaqModalOpen(true);
  };

  const openEditFaqModal = (faq) => {
    setEditingFaq(faq);
    setAddingToSectionId(null);
    setFaqModalOpen(true);
  };

  // => AddFAQModal makes the actual POST/PUT itself - this just receives
  //    the already-saved row back
  const handleFaqSaved = (savedFaq) => {
    if (editingFaq) {
      setFaqs((prev) => prev.map((f) => (f.public_id === savedFaq.public_id ? savedFaq : f)));
      toast.success('FAQ updated.');
    } else {
      setFaqs((prev) => [...prev, savedFaq]);
      toast.success('FAQ added.');
    }
    setFaqModalOpen(false);
  };

  const handleDeleteFaq = (faq) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete the FAQ "${faq.question}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await axiosAdmin.delete(`/api/admin/pages/faqs/${faq.public_id}`);
          setFaqs((prev) => prev.filter((f) => f.public_id !== faq.public_id));
          toast.success('FAQ deleted.');
        } catch (err) {
          console.error('Failed to delete FAQ:', err);
          toast.error(err.response?.data?.error || 'Failed to delete FAQ.');
        }
      },
    });
  };

  const closeConfirm = () => setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  const handleConfirmYes = () => {
    const action = confirmModal.onConfirm;
    closeConfirm();
    if (action) action();
  };

  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <div className="faqw-wrap">

      {loading ? (
        <LoadingState message="Loading FAQs…" />
      ) : fetchError ? (
        <LoadingState variant="error" message={fetchError} onRetry={fetchAll} />
      ) : sections.length === 0 ? (
        <div className="faqw-guidelines">
          <p>
            <strong>Getting started:</strong> create a section first (e.g. "Accounts", "Enrollment", "Payments")
            using "+ Add Section" above. Once a section exists, you can add FAQs under it.
          </p>
        </div>
      ) : (
        <div className="faqw-sections">
          {sections.map((section) => {
            const sectionFaqs = faqs.filter((f) => f.section_id === section.public_id);
            return (
              <div key={section.public_id} className="faqw-section-card">
                <div className="faqw-section-header">
                  <h3 className="faqw-section-name">{section.name}</h3>
                  <div className="faqw-section-actions">
                    <button className="faqw-add-faq-btn" onClick={() => openAddFaqModal(section.public_id)}>
                      + Add FAQ
                    </button>
                    <button className="faqw-delete-section-btn" onClick={() => handleDeleteSection(section)}>
                      Delete Section
                    </button>
                  </div>
                </div>

                {sectionFaqs.length === 0 ? (
                  <p className="faqw-section-empty">No FAQs in this section yet.</p>
                ) : (
                  <div className="faqw-table-wrap">
                    <table className="faqw-table">
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Answer</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionFaqs.map((faq) => (
                          <tr key={faq.public_id}>
                            <td className="faqw-td-question">{faq.question}</td>
                            <td className="faqw-td-answer">{stripHtml(faq.answer)}</td>
                            <td>
                              <div className="faqw-row-actions">
                                <button className="faqw-edit-btn" onClick={() => openEditFaqModal(faq)}>Edit</button>
                                <button className="faqw-delete-btn" onClick={() => handleDeleteFaq(faq)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sectionModalOpen && (
        <AddFAQSectionModal
          onClose={() => setSectionModalOpen(false)}
          onCreated={handleSectionCreated}
        />
      )}

      {faqModalOpen && (
        <AddFAQModal
          faq={editingFaq}
          sections={sections}
          defaultSectionId={addingToSectionId}
          onClose={() => setFaqModalOpen(false)}
          onSaved={handleFaqSaved}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleConfirmYes}
        onCancel={closeConfirm}
      />
    </div>
  );
});

export default FAQsWYSIWYG;