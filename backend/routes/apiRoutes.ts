import { Router } from 'express';
import {
  getCurrentUser,
  getDemoAccounts,
  loginUser,
  registerUser,
  updateProfile,
} from '../controllers/authController';
import {
  assignFacultyToCourse,
  createCourse,
  deleteCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  updateCourseSeats,
} from '../controllers/courseController';
import {
  dropCourseEnrollment,
  enrollInCourse,
  getAllEnrollments,
  getCourseEnrollments,
  getStudentEnrollments,
  joinWaitlist,
  leaveWaitlist,
} from '../controllers/enrollmentController';
import {
  createFacultyByAdmin,
  createStudentByAdmin,
  deleteStudentByAdmin,
  getAllFaculty,
  getAllStudents,
  getFacultyDashboard,
  updateFacultyByAdmin,
  updateStudentByAdmin,
} from '../controllers/userController';
import {
  generateSnapshotReport,
  getCoursesReport,
  getEnrollmentsReport,
  getStudentsReport,
  getSystemSettings,
  resetDemoDatabase,
  updateSystemSettings,
} from '../controllers/reportController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const apiRouter = Router();

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
apiRouter.post('/auth/register', registerUser);
apiRouter.post('/auth/login', loginUser);
apiRouter.get('/auth/demo-accounts', getDemoAccounts);
apiRouter.get('/auth/me', authenticateToken, getCurrentUser);
apiRouter.put('/auth/profile', authenticateToken, updateProfile);

// ==========================================
// COURSES & SEAT MANAGEMENT ROUTES
// ==========================================
apiRouter.get('/courses', getAllCourses);
apiRouter.get('/courses/:id', getCourseById);
apiRouter.post('/courses', authenticateToken, authorizeRoles('admin'), createCourse);
apiRouter.put('/courses/:id', authenticateToken, authorizeRoles('admin'), updateCourse);
apiRouter.delete('/courses/:id', authenticateToken, authorizeRoles('admin'), deleteCourse);
apiRouter.put(
  '/courses/:id/assign',
  authenticateToken,
  authorizeRoles('admin'),
  assignFacultyToCourse
);
apiRouter.put(
  '/courses/:id/seats',
  authenticateToken,
  authorizeRoles('admin'),
  updateCourseSeats
);

// ==========================================
// ENROLLMENTS & WAITLIST ROUTES
// ==========================================
apiRouter.post(
  '/enrollments',
  authenticateToken,
  authorizeRoles('student', 'admin'),
  enrollInCourse
);
apiRouter.delete(
  '/enrollments/:id',
  authenticateToken,
  authorizeRoles('student', 'admin'),
  dropCourseEnrollment
);
apiRouter.get(
  '/enrollments/student/:id',
  authenticateToken,
  getStudentEnrollments
);
apiRouter.get(
  '/enrollments/course/:id',
  authenticateToken,
  authorizeRoles('faculty', 'admin'),
  getCourseEnrollments
);
apiRouter.get(
  '/enrollments',
  authenticateToken,
  authorizeRoles('admin'),
  getAllEnrollments
);
apiRouter.post(
  '/waitlist',
  authenticateToken,
  authorizeRoles('student', 'admin'),
  joinWaitlist
);
apiRouter.delete(
  '/waitlist/:id',
  authenticateToken,
  authorizeRoles('student', 'admin'),
  leaveWaitlist
);

// ==========================================
// FACULTY & ADMIN USER MANAGEMENT ROUTES
// ==========================================
apiRouter.get(
  '/faculty/dashboard',
  authenticateToken,
  authorizeRoles('faculty', 'admin'),
  getFacultyDashboard
);
apiRouter.get(
  '/users/students',
  authenticateToken,
  authorizeRoles('admin', 'faculty'),
  getAllStudents
);
apiRouter.post(
  '/users/students',
  authenticateToken,
  authorizeRoles('admin'),
  createStudentByAdmin
);
apiRouter.put(
  '/users/students/:id',
  authenticateToken,
  authorizeRoles('admin'),
  updateStudentByAdmin
);
apiRouter.delete(
  '/users/students/:id',
  authenticateToken,
  authorizeRoles('admin'),
  deleteStudentByAdmin
);
apiRouter.get(
  '/users/faculty',
  authenticateToken,
  authorizeRoles('admin', 'student', 'faculty'),
  getAllFaculty
);
apiRouter.post(
  '/users/faculty',
  authenticateToken,
  authorizeRoles('admin'),
  createFacultyByAdmin
);
apiRouter.put(
  '/users/faculty/:id',
  authenticateToken,
  authorizeRoles('admin'),
  updateFacultyByAdmin
);

// ==========================================
// REPORTS & SYSTEM SETTINGS ROUTES
// ==========================================
apiRouter.get(
  '/reports/enrollments',
  authenticateToken,
  authorizeRoles('admin'),
  getEnrollmentsReport
);
apiRouter.get(
  '/reports/courses',
  authenticateToken,
  authorizeRoles('admin'),
  getCoursesReport
);
apiRouter.get(
  '/reports/students',
  authenticateToken,
  authorizeRoles('admin'),
  getStudentsReport
);
apiRouter.post(
  '/reports/generate',
  authenticateToken,
  authorizeRoles('admin'),
  generateSnapshotReport
);
apiRouter.get('/settings', getSystemSettings);
apiRouter.put(
  '/settings',
  authenticateToken,
  authorizeRoles('admin'),
  updateSystemSettings
);
apiRouter.post(
  '/settings/reset-demo',
  authenticateToken,
  authorizeRoles('admin'),
  resetDemoDatabase
);

export default apiRouter;
