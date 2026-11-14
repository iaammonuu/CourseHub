# CourseHub – Course Enrollment and Registration System

**CourseHub** is a university-level full-stack Course Enrollment and Registration System built with **HTML5**, **CSS3**, **Vanilla JavaScript**, **Chart.js**, **jsPDF**, **Node.js**, **Express.js**, **JWT Authentication**, **bcrypt**, and **MongoDB / Mongoose ODM**.

---

## 1. Key Features by Role

### A. Student Module
- **Student Registration & JWT Login** with bcrypt password hashing.
- **Personalized Student Dashboard** with 4 real-time KPI cards: *Total Courses Enrolled*, *Remaining Slots*, *Available Courses*, and *Active Enrollments*.
- **Course Catalog** with search by course code/name, filters by semester and faculty, and color-coded seat indicators:
  - **Green**: Seats Available
  - **Red**: Course Full (with **Join Waitlist** support)
  - **Blue**: Student Already Enrolled
- **Automatic Timetable Clash Detection** preventing overlapping day/time enrollments in the same semester.
- **Atomic Enrollment & Drop Course Workflow** with real-time seat count updates and deadline enforcement.
- **PDF Enrollment Confirmation Receipt** generator powered by `jsPDF`.

### B. Faculty Module
- **Dedicated Faculty Dashboard** with 3 KPI cards: *Assigned Courses*, *Total Enrolled Students*, and *Total Available Seats*.
- **Strict Role Access**: Faculty members only access courses assigned to them.
- **Course Overview & Student Roster** with live search by student name or Student ID (`STU-xxxx`) and **CSV / PDF Roster Export**.

### C. Administrator Module
- **Admin Analytics Dashboard** with 6 MongoDB statistics cards and **5 Chart.js Visualizations**:
  1. Course-wise Enrollment Bar Chart
  2. Seats Filled vs Available Doughnut Chart
  3. Department-wise Enrollment Chart
  4. Active vs Dropped Enrollment Pie Chart
  5. Course Popularity Horizontal Bar Chart
- **Course, Seat, Student, Faculty, & Enrollment Management** (full CRUD + inline faculty assignment & seat limit control).
- **5 Institutional Reports** (*Course-wise*, *Student-wise*, *Seats Used vs Available*, *Active Enrollments*, *Dropped Enrollments*) with **PDF Export**, **CSV Export**, and **MongoDB `REPORTS` Snapshot Archiving**.

---

## 2. Demo Credentials (Seeded Accounts)

| Role | Name | User ID | Email | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | Dr. Marcus Vance | `ADM-001` | `admin@coursehub.edu` | `admin123` |
| **Faculty (CS)** | Dr. Elena Rostova | `FAC-101` | `elena.rostova@university.edu` | `faculty123` |
| **Faculty (Data Science)** | Prof. David Chen | `FAC-102` | `david.chen@university.edu` | `faculty123` |
| **Faculty (EE)** | Dr. Sarah Jenkins | `FAC-103` | `sarah.jenkins@university.edu` | `faculty123` |
| **Student (1 of 10)** | Alex Rivera | `STU-2001` | `alex.rivera@university.edu` | `student123` |
| **Student (2 of 10)** | Priya Patel | `STU-2002` | `priya.patel@university.edu` | `student123` |

*(All 10 student accounts use password `student123` and are accessible via 1-click Demo Login on the Sign-In page).*

---

## 3. Installation & Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. **Start the Full-Stack Server (Port 3000)**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Run Unit Tests**:
   ```bash
   npx --yes tsx --test backend/utils/enrollmentRules.test.ts
   ```

---

## 4. Packaging Source Code as a ZIP Archive

Run the following command in the project root directory:

```bash
zip -r CourseHub_FullStack_Submission.zip frontend/ backend/ src/ server.ts package.json README.md .env.example backend/.env.example -x "*/node_modules/*" "*/dist/*"
```
