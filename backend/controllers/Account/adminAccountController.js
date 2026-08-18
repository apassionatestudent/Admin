// => Handles HTTP request/response for the admin account page
import * as adminAccountService from '../../services/Account/adminAccountService.js';

// => GET current admin's account details
export async function getAccount(req, res) {
    try {
        // => admin_id comes from the verified JWT payload, never from params/body
        const account = await adminAccountService.getAccount(req.admin.admin_id);
        res.status(200).json({ account });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Failed to fetch account' });
    }
}

// => PATCH full_name and email together
export async function updateProfile(req, res) {
    try {
        const { full_name, email } = req.body;
        // => role comes from the verified JWT payload, never from the request body,
        //    so a regular staff account can't spoof super_admin to edit their own name/email
        const account = await adminAccountService.updateProfile(req.admin.admin_id, req.admin.role, full_name, email);
        res.status(200).json({ message: 'Profile updated', account });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Failed to update profile' });
    }
}

// => PATCH is_night_mode only
export async function updateTheme(req, res) {
    try {
        const { is_night_mode } = req.body;
        const account = await adminAccountService.updateTheme(req.admin.admin_id, is_night_mode);
        res.status(200).json({ message: 'Theme preference updated', account });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Failed to update theme' });
    }
}

// => PATCH password, requires current_password + new_password
export async function changePassword(req, res) {
    try {
        const { current_password, new_password } = req.body;
        await adminAccountService.changePassword(req.admin.admin_id, current_password, new_password);
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Failed to update password' });
    }
}

// => GET a page of the current admin's own activity logs
export async function getLogs(req, res) {
  try {
    const page = req.query.page || 1;
    const result = await adminAccountService.getAccountLogs(req.admin.admin_id, page);
    res.status(200).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch logs' });
  }
}