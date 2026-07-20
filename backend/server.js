import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { sql } from './config/db.js';

import adminEnrollmentRouter from './routes/adminEnrollmentRoute.js';
import adminAuthRouter from './routes/adminAuthRoute.js';
// => Location router for resolving PSGC codes to readable names in EnrollmentDetail
import locationRouter, { loadLocationCache } from './routes/locationRoutes.js';
import tesdaCoursesRouter from './routes/tesdaCoursesRoutes.js';
import shsCoursesRouter from './routes/shsCoursesRoutes.js';
import adminClassRouter from './routes/adminClassRoute.js';
import adminStudentRouter from './routes/adminStudentRoute.js';
import nationalityRoutes from './routes/nationalityRoutes.js';
import sectorClusterRoutes from './routes/sectorClusterRoutes.js';


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
app.use(express.json());
app.use(cookieParser());
// => CSRF validation: must come after cookieParser() and express.json()
// => Rejects POST/PATCH/PUT/DELETE without a valid x-csrf-token header
app.use(csrfProtection);

// => Routes
app.use('/api/admin-auth', adminAuthRouter);
app.use('/api/admin/enrollments', adminEnrollmentRouter);

app.use('/api/admin/tesda-courses', tesdaCoursesRouter);
app.use('/api/admin/shs-courses', shsCoursesRouter);

// => Location endpoints - used by EnrollmentDetail to resolve PSGC codes to readable names
app.use('/api/location', locationRouter);

app.use('/api/admin/classes', adminClassRouter);

app.use('/api/admin/students', adminStudentRouter);
app.use('/api/admin', sectorClusterRoutes);

// => nationality routes 
app.use('/api/reference', nationalityRoutes);


// => Initialize DB tables that the admin backend needs
async function initDB() {
    try {

        // => Ensure the admins table exists
        // => role is restricted to 'admin' or 'super_admin' via CHECK constraint
        // => status is restricted to 'active' or 'suspended' via CHECK constraint
        await sql`
            CREATE TABLE IF NOT EXISTS admins (
                admin_id        SERIAL PRIMARY KEY,
                full_name       VARCHAR(150)  NOT NULL,
                email           VARCHAR(255)  NOT NULL UNIQUE,
                password_hash   TEXT          NOT NULL,
                role            VARCHAR(15)   NOT NULL DEFAULT 'admin'
                                CHECK (role IN ('admin', 'super_admin')),
                status          VARCHAR(10)   NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'suspended')),
                created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                last_login_at   TIMESTAMPTZ,
                remarks         TEXT
            )
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

    app.listen(PORT, () => {
        console.log(`Admin server running on port ${PORT}`);
    });
})();