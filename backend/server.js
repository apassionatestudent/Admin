// admin server.js

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { sql } from './config/db.js';

// => Enrollment routes split into shared (combined list/search/doc proxy),
//    tesda-only, and shs-only routers - see routes/Enrollments/
import sharedEnrollmentRouter from './routes/Enrollments/sharedEnrollmentRoute.js';
import tesdaEnrollmentRouter from './routes/Enrollments/tesdaEnrollmentRoute.js';
import shsEnrollmentRouter from './routes/Enrollments/shsEnrollmentRoute.js';
import adminAuthRouter from './routes/adminAuthRoute.js';
// => Self-service account routes for the logged-in admin (profile, theme, password)
import adminAccountRouter from './routes/Account/adminAccountRoutes.js';
// => Staff management (super_admin only) - create/suspend regular admins, assign section permissions
import staffRouter from './routes/Staff/staffRoutes.js';
// => Public invite-completion flow for newly created staff - mounted before csrfProtection below
import staffInviteRouter from './routes/Staff/staffInviteRoutes.js';
// => Location router for resolving PSGC codes to readable names in EnrollmentDetail
import locationRouter, { loadLocationCache } from './routes/locationRoutes.js';
import tesdaCoursesRouter from './routes/Courses/tesdaCoursesRoutes.js';
import shsCoursesRouter from './routes/Courses/shsCoursesRoutes.js';
import adminBatchRouter from './routes/Classes/adminBatchRoutes.js';
import publicSupportTicketRouter from './routes/SupportTickets/publicSupportTicketRoutes.js';
// => Admin-side read + status update for anonymous public support tickets.
// => Separate route/table from the private, student-scoped support_tickets below.
import supportTicketRouter from './routes/SupportTickets/supportTicketRoutes.js';
import adminStudentRouter from './routes/Students/adminStudentRoute.js';
import nationalityRoutes from './routes/nationalityRoutes.js';
import sectorClusterRoutes from './routes/Courses/sectorClusterRoutes.js';

// Page: Classes 
import adminFacilityRouter from './routes/Classes/adminFacilityRoutes.js';
import adminTrainerRouter from './routes/Classes/adminTrainerRoutes.js';
import adminClassSessionRouter from './routes/Classes/adminClassSessionRoutes.js';

// cron jobs => check dates for Pending => Ongoing Classes 
import cron from 'node-cron';
import { runAutoPromoteBatches } from './jobs/batchAutoPromoteJob.js';

// Payments Import
import paymentsRoutes from './routes/Payments/paymentsRoutes.js';
import refundsRoutes from './routes/Payments/refundsRoutes.js';

// Page: Pages (Announcements / Privacy Policy / FAQs)
import announcementRoutes from './routes/Pages/announcementRoutes.js';
import cmsPageRoutes from './routes/Pages/cmsPageRoutes.js';
import termsPageRoutes from './routes/Pages/termsPageRoutes.js';

import faqSectionRoutes from './routes/Pages/faqSectionRoutes.js';
import faqRoutes from './routes/Pages/faqRoutes.js';

// Page: Logs
import logsRoutes from './routes/Logs/logsRoutes.js';

// Page: Chatbots
import chatbotRouter from './routes/Chatbots/chatbotRoutes.js';

// Page: Dashboard
import dashboardRouter from './routes/Dashboard/dashboardRoutes.js';

// Page: Reports
import reportRouter from './routes/Reports/reportRoutes.js';

dotenv.config(); // => moved up - must run before any module reads process.env

// => CSRF validation middleware - token is generated in adminAuthController on login
import { csrfProtection } from './middleware/adminCsrf.js';

const app = express();
const PORT = process.env.PORT || 3000;

// => Middleware
app.use(cors({
    origin: 'http://localhost:3173', // => admin frontend URL, update when deployed
    credentials: true,
}));
app.use(helmet());
app.use(morgan('dev'));
// => Raised from Express's 100kb default - RichTextEditor content can
//    embed multiple base64 images (each up to ~665KB after base64's ~33%
//    inflation on a 500KB source file, per MAX_IMAGE_BYTES in
//    richTextEditor.jsx), so a page with several images needs real headroom
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// => Public invite-completion routes - mounted before csrfProtection because the
// => invited admin has no session yet and cannot obtain a CSRF token pair.
// => Keep this router scoped to only the token-validate and set-password endpoints.
app.use('/api/admin-invite', staffInviteRouter);

// => CSRF validation: must come after cookieParser() and express.json()
// => Rejects POST/PATCH/PUT/DELETE without a valid x-csrf-token header
app.use(csrfProtection);

// => Routes
app.use('/api/admin-auth', adminAuthRouter);
app.use('/api/admin/account', adminAccountRouter);
// => Staff management - super_admin only, enforced in staffRoutes.js via requireSuperAdmin
app.use('/api/admin/admins', staffRouter);
// => Shared router handles GET / (combined list), GET /search (combined
//    search), and GET /docs/:documentKey (generic R2 proxy for both types)
app.use('/api/admin/enrollments', sharedEnrollmentRouter);
// => Type-specific routers mounted under their own path segment - this
//    preserves the exact same final URLs the frontend already calls
//    (e.g. /api/admin/enrollments/tesda/:publicId still resolves the same)
app.use('/api/admin/enrollments/tesda', tesdaEnrollmentRouter);
app.use('/api/admin/enrollments/shs', shsEnrollmentRouter);

app.use('/api/admin/tesda-courses', tesdaCoursesRouter);
app.use('/api/admin/shs-courses', shsCoursesRouter);

// => Location endpoints - used by EnrollmentDetail to resolve PSGC codes to readable names
app.use('/api/location', locationRouter);

app.use('/api/admin/batches', adminBatchRouter);
app.use('/api/admin/public-support-tickets', publicSupportTicketRouter);
// => Private, student-scoped support tickets - separate table (support_tickets),
// => joined to student_profile for display fields
app.use('/api/admin/support-tickets', supportTicketRouter);

app.use('/api/admin/students', adminStudentRouter);
app.use('/api/admin', sectorClusterRoutes);

// => nationality routes 
app.use('/api/reference', nationalityRoutes);

app.use('/api/admin/facilities', adminFacilityRouter);
app.use('/api/admin/trainers', adminTrainerRouter);
app.use('/api/admin/class-sessions', adminClassSessionRouter);

// Payments 
app.use('/api/payments', paymentsRoutes);
app.use('/api/refunds', refundsRoutes);

// Pages
app.use('/api/admin/pages/announcements', announcementRoutes);
app.use('/api/admin/pages/privacy-policy', cmsPageRoutes);
app.use('/api/admin/pages/terms-and-conditions', termsPageRoutes);
app.use('/api/admin/pages/faqs-sections', faqSectionRoutes);
app.use('/api/admin/pages/faqs', faqRoutes);

// Logs
app.use('/api/admin/logs', logsRoutes);

// Chatbots
app.use('/api/admin/chatbots', chatbotRouter);

// Dashboard
app.use('/api/admin/dashboard', dashboardRouter);

// Reports
app.use('/api/admin/reports', reportRouter);


// => Initialize DB tables that the admin backend needs
async function initDB() {
    try {

        // => Ensure the admins table exists
        // => role is restricted to 'staff' or 'super_admin' via CHECK constraint
        // => status is restricted to 'active' or 'suspended' via CHECK constraint
        await sql`
            CREATE TABLE IF NOT EXISTS admins (
                admin_id        SERIAL PRIMARY KEY,
                full_name       VARCHAR(150)  NOT NULL,
                email           VARCHAR(255)  NOT NULL UNIQUE,
                password_hash   TEXT,
                role            VARCHAR(15)   NOT NULL DEFAULT 'staff'
                                CHECK (role IN ('staff', 'super_admin')),
                status          VARCHAR(10)   NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'suspended')),
                is_night_mode   BOOLEAN       NOT NULL DEFAULT false,
                created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                last_login_at   TIMESTAMPTZ,
                remarks         TEXT,
                public_id       UUID          NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                password_set    BOOLEAN       NOT NULL DEFAULT true,
                failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until    TIMESTAMPTZ
            )
        `;

        // => Existing live database migration: add lockout columns if the
        //    admins table already existed before this feature was added
        // => Stricter than the student side: 3 failed attempts locks for 15 minutes
        await sql`
            ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0
        `;
        await sql`
            ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ
        `;

        // => Reuse the same set_updated_at trigger function if it already exists
        // => CREATE OR REPLACE is safe here - won't break existing triggers
        await sql`
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;

        // => Attach updated_at trigger to admins table only if it doesn't exist yet
        await sql`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'admins_set_updated_at'
                ) THEN
                    CREATE TRIGGER admins_set_updated_at
                    BEFORE UPDATE ON admins
                    FOR EACH ROW
                    EXECUTE FUNCTION set_updated_at();
                END IF;
            END $$
        `;

        // => Section-level access control for regular admins. super_admin has no
        // => rows here and is treated as having every section implicitly.
        await sql`
            CREATE TABLE IF NOT EXISTS admin_section_permissions (
                permission_id   SERIAL        PRIMARY KEY,
                admin_id        INTEGER       NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
                section_key     VARCHAR(30)   NOT NULL CHECK (section_key IN (
                                    'enrollments', 'classes', 'support-tickets', 'students',
                                    'reports', 'payments', 'courses', 'pages', 'logs', 'chatbots'
                                )),
                granted_by      INTEGER       REFERENCES admins(admin_id) ON DELETE SET NULL,
                created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                UNIQUE (admin_id, section_key)
            )
        `;

        // => Invite / password-setup tokens for newly created admins.
        // => Mirrors password_setup_tokens (student-scoped) but keyed on admin_id.
        await sql`
            CREATE TABLE IF NOT EXISTS admin_password_setup_tokens (
                token_id     SERIAL        PRIMARY KEY,
                admin_id     INTEGER       NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
                token_hash   TEXT          NOT NULL,
                purpose      VARCHAR(20)   NOT NULL DEFAULT 'invite',
                expires_at   TIMESTAMPTZ   NOT NULL,
                used_at      TIMESTAMPTZ,
                created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
            )
        `;

        // => System-wide activity log table, mirrored here now that the logging
        //    campaign is underway. This table already existed live in Neon with
        //    real data and CHECK constraints applied, but was never mirrored
        //    into server.js until now.
        // => entity_type is intentionally left unconstrained (no CHECK) since it
        //    mirrors table/feature names directly and would need constant upkeep
        //    as new loggable modules get added.
        // => action and actor_type are both CHECK-constrained at the DB level.
        //    action is a generic, reusable taxonomy shared across every entity
        //    type, specifics belong in action_detail, not in action itself.
        await sql`
            CREATE TABLE IF NOT EXISTS activity_logs (
                log_id          SERIAL        PRIMARY KEY,
                entity_type     VARCHAR(30),
                entity_id       INTEGER,
                actor_type      VARCHAR(10)   NOT NULL
                                CHECK (actor_type IN ('Staff', 'Student', 'System')),
                actor_id        INTEGER,
                actor_name      VARCHAR(150)  NOT NULL,
                action          VARCHAR(50)   NOT NULL
                                CHECK (action IN (
                                    'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'SOFT_DELETE',
                                    'RESTORE', 'VOID', 'SUSPEND', 'REACTIVATE', 'INVITE',
                                    'RESET_PASSWORD', 'PASSWORD_CHANGE', 'LOGIN', 'DOCUMENT_ADD',
                                    'DOCUMENT_REPLACE', 'PERMISSION_CHANGE', 'RELEASE'
                                )),
                action_detail   TEXT          NOT NULL,
                created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
            )
        `;

        // => Mirrors the live cms_pages table - already exists in Neon,
        //    never mirrored into server.js until now. Holds Privacy
        //    Policy today, Terms and Conditions later, one row per slug.
        await sql`
            CREATE TABLE IF NOT EXISTS cms_pages (
                page_id      SERIAL PRIMARY KEY,
                slug         VARCHAR(50) UNIQUE NOT NULL,
                content      TEXT NOT NULL DEFAULT '',
                updated_by   INTEGER NOT NULL REFERENCES admins(admin_id),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;

        // => Snapshot of a cms_pages row's content right before every
        //    overwrite - only written for slugs in
        //    cmsPageModel.js's REVISIONED_SLUGS (legal docs), so
        //    Announcements/FAQs never touch this table
        await sql`
            CREATE TABLE IF NOT EXISTS cms_page_revisions (
                revision_id  SERIAL PRIMARY KEY,
                page_id      INTEGER NOT NULL REFERENCES cms_pages(page_id),
                content      TEXT NOT NULL,
                changed_by   INTEGER NOT NULL REFERENCES admins(admin_id),
                changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_cms_page_revisions_page_id
            ON cms_page_revisions (page_id, changed_at DESC)
        `;

        // => Miscellaneous fee line items for a batch (SHS or TESDA).
        // => batch_type + batch_id mirrors class_sessions.batch_type /
        // => payments.enrollment_type - no DB-level FK is possible across
        // => two tables, so batch existence is validated at the service
        // => layer instead. A batch's total misc fee is always the SUM of
        // => its rows here, never a separately-stored total.
        await sql`
            CREATE TABLE IF NOT EXISTS batch_misc_fees (
                fee_id        SERIAL        PRIMARY KEY,
                public_id     UUID          NOT NULL DEFAULT gen_random_uuid() UNIQUE,

                batch_type    VARCHAR(10)   NOT NULL CHECK (batch_type IN ('SHS', 'TESDA')),
                batch_id      INTEGER       NOT NULL,

                fee_label     VARCHAR(150)  NOT NULL,
                fee_amount    NUMERIC(10,2) NOT NULL CHECK (fee_amount > 0),

                created_by    INTEGER       NOT NULL REFERENCES admins(admin_id) ON DELETE SET NULL,
                created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
            )
        `;

        // => Attach the same updated_at trigger function to batch_misc_fees
        await sql`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'batch_misc_fees_set_updated_at'
                ) THEN
                    CREATE TRIGGER batch_misc_fees_set_updated_at
                    BEFORE UPDATE ON batch_misc_fees
                    FOR EACH ROW
                    EXECUTE FUNCTION set_updated_at();
                END IF;
            END $$
        `;

        // => Per-course trainer assignments for SHS batches - replaces the
        //    old single grade11_trainer_id/grade12_trainer_id columns on
        //    shs_batches, which couldn't represent more than one course per
        //    grade level having its own qualified trainer. Mirrored from
        //    the Neon SQL Editor migration already run live.
        await sql`
            CREATE TABLE IF NOT EXISTS shs_batch_course_trainers (
                batch_course_trainer_id SERIAL PRIMARY KEY,
                batch_id    INTEGER NOT NULL REFERENCES shs_batches(batch_id),
                course_id   INTEGER NOT NULL REFERENCES shs_courses(course_id),
                trainer_id  INTEGER REFERENCES trainers(trainer_id),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (batch_id, course_id)
            )
        `;

        // => Chatbot configs. scope_type + course_id decide which page(s)
        // => a bot serves: one for the whole public site (Home + About),
        // => one per individual course, one for the student dashboard.
        // => Uniqueness of "only one active per scope" is enforced by the
        // => three partial indexes below, not application code alone.
        await sql`
            CREATE TABLE IF NOT EXISTS chatbots (
                chatbot_id            SERIAL PRIMARY KEY,
                public_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
                name                   VARCHAR(150) NOT NULL,
                widget_header_title    VARCHAR(150) NOT NULL,
                welcome_message        TEXT NOT NULL,
                instructions           TEXT NOT NULL,
                context                TEXT,
                scope_type              VARCHAR(20) NOT NULL CHECK (scope_type IN ('public_site', 'tesda_course', 'shs_course', 'student_dashboard')),
                course_id               INTEGER,
                status                   VARCHAR(10) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
                created_by               INTEGER REFERENCES admins(admin_id) ON DELETE SET NULL,
                -- => Lightweight attribution only, no activity_logs entry for this table
                updated_by               INTEGER REFERENCES admins(admin_id) ON DELETE SET NULL,
                created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        await sql`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'chatbots_set_updated_at'
                ) THEN
                    CREATE TRIGGER chatbots_set_updated_at
                    BEFORE UPDATE ON chatbots
                    FOR EACH ROW
                    EXECUTE FUNCTION set_updated_at();
                END IF;
            END $$
        `;

        await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS chatbots_one_active_public_site
            ON chatbots (scope_type)
            WHERE status = 'active' AND scope_type = 'public_site'
        `;

        await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS chatbots_one_active_student_dashboard
            ON chatbots (scope_type)
            WHERE status = 'active' AND scope_type = 'student_dashboard'
        `;

                await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS chatbots_one_active_per_course
            ON chatbots (scope_type, course_id)
            WHERE status = 'active' AND scope_type IN ('tesda_course', 'shs_course')
        `;

        // => Per-course enrollment requirements for TESDA courses (NCI, NCII,
        // => NCIII, etc. can each ask for a different set of documents).
        // => document_type is free text on purpose, same as tesda_documents.
        // => document_type - matched by string value, not a hard FK, so an
        // => admin editing/removing a requirement later never rewrites or
        // => blocks what a student already submitted under the old wording.
        // => Mirrored from the Neon SQL Editor migration already run live.
        await sql`
            CREATE TABLE IF NOT EXISTS tesda_course_requirements (
                requirement_id  SERIAL       PRIMARY KEY,
                course_id       INTEGER      NOT NULL REFERENCES tesda_courses(course_id),
                document_type   VARCHAR(150) NOT NULL,
                is_required     BOOLEAN      NOT NULL DEFAULT true,
                max_files       INTEGER      NOT NULL DEFAULT 1 CHECK (max_files >= 1) -- => e.g. TOR/NBI clearance spanning multiple pages/files
            )
        `;

        console.log('Admin database initialized successfully');

    } catch (error) {
        console.error('Error initializing admin database:', error);
        process.exit(1); // => Stop the server if DB init fails; no point running without a DB
    }
}

(async () => {
    await initDB();

    // => Pre-load regions into memory before accepting requests
    // => Without this, /api/location/regions returns [] and all code-to-name resolution fails
    await loadLocationCache();

    // => Auto-promotes eligible Pending batches to Ongoing once a day at
    //    1:00 AM. Also runs once immediately on startup so a restart doesn't
    //    leave a 24-hour gap before the first check.
    cron.schedule('0 1 * * *', () => {
    runAutoPromoteBatches().catch(err => console.error('[autoPromoteBatches] cron run failed:', err));
    });
    runAutoPromoteBatches().catch(err => console.error('[autoPromoteBatches] initial run failed:', err));

    app.listen(PORT, () => {
        console.log(`Admin server running on port ${PORT}`);
    });
})();