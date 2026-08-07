// controllers/Staff/staffController.js

import * as staffService from '../../services/Staff/staffService.js';

export async function listAdmins(req, res) {
    try {
        const { page, search } = req.query;
        const result = await staffService.listAdmins({ page, search });
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to load staff' });
    }
}

export async function getAdmin(req, res) {
    try {
        const admin = await staffService.getAdminDetail(req.params.publicId);
        res.json(admin);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to load staff member' });
    }
}

export async function createAdmin(req, res) {
    try {
        const { fullName, email, sections } = req.body;
        const created = await staffService.createAdmin({ fullName, email, sections }, req.admin);
        res.status(201).json(created);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to create staff account' });
    }
}

export async function updateStatus(req, res) {
    try {
        const { status } = req.body;
        const updated = await staffService.updateAdminStatus(req.params.publicId, status, req.admin);
        res.json(updated);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update status' });
    }
}

export async function updatePermissions(req, res) {
    try {
        const { sections } = req.body;
        const updated = await staffService.updateAdminPermissions(req.params.publicId, sections || [], req.admin);
        res.json(updated);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update permissions' });
    }
}

export async function resendInvite(req, res) {
    try {
        const result = await staffService.resendInvite(req.params.publicId, req.admin);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to resend invite' });
    }
}

export async function resetPassword(req, res) {
    try {
        const result = await staffService.resetAdminPassword(req.params.publicId, req.admin);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to reset password' });
    }
}

export async function getLogs(req, res) {
    try {
        const { page } = req.query;
        const result = await staffService.getAdminLogs(req.params.publicId, page);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to load activity logs' });
    }
}