export const PROJECT_DELIVERABLES_DATA = {
  zipInstructions: [
    '1. Open a terminal in the root CourseHub directory.',
    '2. Run the following command to package the complete source code (excluding node_modules and dist):',
    '   zip -r CourseHub_FullStack_Submission.zip frontend/ backend/ src/ server.ts package.json README.md .env.example backend/.env.example -x "*/node_modules/*" "*/dist/*"',
    '3. To restore and run on any machine: unzip CourseHub_FullStack_Submission.zip && npm install && npm run dev',
  ],
  pptOutline: [
    {
      slide: 'Slide 1',
      title: 'CourseHub – University Course Enrollment & Registration System',
      bullets: [
        'Full-Stack Academic Registration, Dynamic Seat Tracking, & Analytics Platform',
        'Built with HTML5, CSS3, Vanilla JavaScript, Chart.js, jsPDF, Node.js, Express.js, and MongoDB/Mongoose',
        'Role-Based Access Control (RBAC) for Students, Faculty, and University Administrators',
      ],
    },
    {
      slide: 'Slide 2',
      title: 'Problem Statement & Project Objectives',
      bullets: [
        'Eliminate manual spreadsheet registration bottlenecks, over-enrollment conflicts, and duplicate course signups',
        'Provide real-time seat availability tracking and automatic timetable clash detection for students',
        'Empower faculty with live course rosters and give administrators real-time institutional analytics',
      ],
    },
    {
      slide: 'Slide 3',
      title: 'System Architecture & Technology Stack',
      bullets: [
        'Frontend Layer: Semantic HTML5, Custom CSS3 Design System, Vanilla JS ES Modules, Chart.js, jsPDF',
        'Backend API Layer: Node.js + Express REST API with JWT Authentication & bcrypt Password Hashing',
        'Database Layer: MongoDB & Mongoose ODM with Compound Unique Indexes and Atomic Seat Operations',
      ],
    },
    {
      slide: 'Slide 4',
      title: 'Database Schema & MongoDB Collections',
      bullets: [
        'USERS Collection: userId, name, role (student/faculty/admin), email, hashed password, department',
        'COURSES Collection: courseId, courseCode, title, facultyId, totalSeats, availableSeats, semester, schedule',
        'ENROLLMENTS Collection: enrollmentId, studentId, courseId, status (Active/Dropped), enrolledAt + Unique Compound Index',
        'REPORTS Collection: reportId, totalCourses, totalStudents, totalEnrollments, generatedAt',
      ],
    },
    {
      slide: 'Slide 5',
      title: 'Atomic Course Enrollment Workflow (Steps 1–9)',
      bullets: [
        'Student selects course -> Backend verifies JWT auth & registration deadline',
        'Checks duplicate active enrollment via compound key (studentId + courseId) and verifies no timetable clash',
        'Verifies availableSeats > 0, atomically creates Enrollment record, and decrements availableSeats by 1',
        'Returns confirmation receipt and updates Student Dashboard & Seat Indicators in real time',
      ],
    },
    {
      slide: 'Slide 6',
      title: 'Drop Course & Waitlist Management Workflow',
      bullets: [
        'Student clicks Drop Course -> Backend verifies ownership, Active status, and Drop Deadline compliance',
        'Transitions status to Dropped (preventing duplicate drops) and increments availableSeats by 1',
        'Full courses (availableSeats = 0) allow students to join a prioritized Course Waitlist',
      ],
    },
    {
      slide: 'Slide 7',
      title: 'Role-Based Dashboards & Reporting Analytics',
      bullets: [
        'Student Portal: Course Catalog with Green/Red/Blue seat indicators, My Courses, PDF Receipt generator',
        'Faculty Portal: Assigned courses only, searchable student rosters, CSV/PDF roster export',
        'Admin Portal: 6 live KPI cards, 5 Chart.js charts, Course/Seat/User management, PDF & CSV report exports',
      ],
    },
  ],
  demoVideoScript: [
    {
      segment: '00:00 – 00:45 | Introduction & Landing Page',
      script:
        'Welcome to the demonstration of CourseHub, a full-stack university Course Enrollment and Registration System built with HTML5, CSS3, Vanilla JavaScript, Node.js, Express, and MongoDB. On the landing page, we can preview live university metrics and access the role-based login portal.',
    },
    {
      segment: '00:45 – 02:15 | Student Module: Catalog, Clash Detection, Enroll, PDF Receipt, & Drop',
      script:
        'Signing in as Student Alex Rivera (STU-2001), we see the personalized Student Dashboard showing Total Courses Enrolled, Remaining Slots, Available Courses, and Active Enrollments. Opening the Course Catalog, courses display color-coded seat indicators: Blue for already enrolled (CS301), Red for full courses (CS405 with Waitlist option), and Green for available courses.Notice EE210 flags a timetable clash with CS301 (Mon/Wed 09:00-10:30). Clicking Enroll on CS302 immediately decrements available seats by 1 and displays "Congratulations! You have successfully enrolled in this course." In My Courses, we click Download PDF Receipt to generate a jsPDF confirmation, and then demonstrate dropping a course, which restores the available seat count by 1.',
    },
    {
      segment: '02:15 – 03:15 | Faculty Module: Assigned Courses & Roster Export',
      script:
        'Signing in as Faculty member Dr. Elena Rostova (FAC-101), the Faculty Dashboard displays only the courses assigned to her, total enrolled students, and remaining seats. Opening CS301 Course Overview, we search enrolled students by name or ID and export the official class roster to CSV and PDF.',
    },
    {
      segment: '03:15 – 04:45 | Administrator Module: CRUD, Seat Management, Chart.js & Reports',
      script:
        'Signing in as Administrator Dr. Marcus Vance (ADM-001), the Admin Dashboard renders 6 live MongoDB statistics cards and 5 interactive Chart.js visualizations: Course-wise Enrollment, Seats Filled vs Available, Department-wise Enrollment, Active vs Dropped Enrollments, and Course Popularity. In Course Management, we create a new course, assign a faculty member, and update seat capacity. Finally, in Enrollment Reports, we generate and export Course-wise, Student-wise, Active, and Dropped reports to PDF and CSV.',
    },
  ],
};
