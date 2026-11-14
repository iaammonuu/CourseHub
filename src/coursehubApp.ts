import {
  downloadCsvFile,
  downloadEnrollmentReceiptPdf,
  downloadFullSchedulePdf,
  downloadTabularReportPdf,
} from './utils/exportUtils';
import {
  renderAdminAnalyticsCharts,
  type AdminChartsPayload,
} from './utils/chartUtils';
import { PROJECT_DELIVERABLES_DATA } from './utils/projectDeliverables';

interface UserProfile {
  userId: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  email: string;
  department: string;
  semester?: string;
  phone?: string;
  title?: string;
}

interface CourseItem {
  courseId: string;
  courseCode: string;
  title: string;
  description: string;
  department: string;
  credits: number;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
  totalSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  fillPercentage: number;
  semester: string;
  schedule: string;
  room: string;
  waitlistCount: number;
  isEnrolled: boolean;
  studentEnrollmentId: string | null;
  isWaitlisted: boolean;
  studentWaitlistId: string | null;
  scheduleClashWith: string | null;
  seatStatus: 'Available' | 'Full' | 'Enrolled';
}

interface EnrollmentItem {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentDepartment: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseDescription: string;
  courseDepartment: string;
  credits: number;
  semester: string;
  schedule: string;
  room: string;
  totalSeats: number;
  availableSeats: number;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
  status: 'Active' | 'Dropped';
  enrolledAt: string;
  droppedAt?: string | null;
}

interface DemoAccountItem {
  userId: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  email: string;
  department: string;
  semester: string;
  title: string;
  demoPassword: string;
}

const STORAGE_TOKEN_KEY = 'coursehub_jwt_token';
const STORAGE_USER_KEY = 'coursehub_user_profile';

class CourseHubClientApp {
  private rootEl: HTMLElement;
  private token: string | null = null;
  private currentUser: UserProfile | null = null;
  private currentView: string = 'landing';

  // Cached Data
  private courses: CourseItem[] = [];
  private semesters: string[] = ['Fall 2026', 'Spring 2027', 'Summer 2027'];
  private departments: string[] = [
    'Computer Science',
    'Data Science & AI',
    'Electrical Engineering',
    'Software Engineering',
    'Cybersecurity',
  ];
  private faculties: Array<{ userId: string; name: string; department: string; email: string }> =
    [];
  private demoAccounts: DemoAccountItem[] = [];
  private settings: Record<string, any> = {};

  // Student State
  private studentStats = {
    totalCoursesEnrolled: 0,
    remainingSlots: 6,
    maxSlots: 6,
    availableCourses: 0,
    activeEnrollments: 0,
    droppedEnrollments: 0,
    totalCredits: 0,
  };
  private studentEnrollments: EnrollmentItem[] = [];
  private studentWaitlists: Array<Record<string, any>> = [];

  // Catalog Filters
  private catalogSearch = '';
  private catalogSemester = 'all';
  private catalogFaculty = 'all';
  private catalogStatus = 'all';

  // Faculty State
  private facultyStats = {
    assignedCourses: 0,
    totalEnrolledStudents: 0,
    totalAvailableSeats: 0,
    totalCapacitySeats: 0,
  };
  private facultyAssignedCourses: Array<Record<string, any>> = [];
  private selectedFacultyCourseId: string = '';
  private facultyStudentSearch: string = '';

  // Admin State
  private adminSummaryCards = {
    totalCourses: 0,
    totalStudents: 0,
    totalFaculty: 0,
    totalActiveEnrollments: 0,
    totalDroppedEnrollments: 0,
    totalSeatsCapacity: 0,
    availableSeats: 0,
    occupiedSeats: 0,
    fullyOccupiedCourses: 0,
  };
  private adminChartsData: AdminChartsPayload | null = null;
  private adminStudents: Array<Record<string, any>> = [];
  private adminFaculty: Array<Record<string, any>> = [];
  private adminEnrollments: EnrollmentItem[] = [];
  private adminCoursesReport: Array<Record<string, any>> = [];
  private adminStudentsReport: Array<Record<string, any>> = [];
  private adminSavedReports: Array<Record<string, any>> = [];

  // Admin Filters
  private adminStudentSearch = '';
  private adminFacultySearch = '';
  private adminEnrollmentCourseFilter = 'all';
  private adminEnrollmentStudentFilter = 'all';
  private adminEnrollmentSemesterFilter = 'all';
  private adminEnrollmentStatusFilter = 'all';
  private activeReportTab:
    | 'courses'
    | 'students'
    | 'seats'
    | 'active'
    | 'dropped' = 'courses';

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    this.restoreSession();
  }

  private restoreSession(): void {
    try {
      const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const savedUser = localStorage.getItem(STORAGE_USER_KEY);
      if (savedToken && savedUser) {
        this.token = savedToken;
        this.currentUser = JSON.parse(savedUser) as UserProfile;
      }
    } catch {
      this.token = null;
      this.currentUser = null;
    }

    // Check URL or body dataset for initial page routing
    const params = new URLSearchParams(window.location.search);
    const pageParam =
      params.get('page') || document.body.dataset.initialPage || '';

    if (this.currentUser) {
      if (pageParam && this.isViewAllowedForRole(pageParam, this.currentUser.role)) {
        this.currentView = pageParam;
      } else {
        this.currentView = this.getDefaultViewForRole(this.currentUser.role);
      }
    } else {
      if (pageParam === 'login' || window.location.pathname.endsWith('login.html')) {
        this.currentView = 'login';
      } else if (
        pageParam === 'register' ||
        window.location.pathname.endsWith('register.html')
      ) {
        this.currentView = 'register';
      } else {
        this.currentView = 'landing';
      }
    }
  }

  private getDefaultViewForRole(role: 'student' | 'faculty' | 'admin'): string {
    if (role === 'admin') return 'admin-dashboard';
    if (role === 'faculty') return 'faculty-dashboard';
    return 'student-dashboard';
  }

  private isViewAllowedForRole(
    view: string,
    role: 'student' | 'faculty' | 'admin'
  ): boolean {
    if (view === 'profile' || view === 'deliverables') return true;
    if (role === 'student') return view.startsWith('student-');
    if (role === 'faculty') return view.startsWith('faculty-');
    if (role === 'admin') return view.startsWith('admin-');
    return false;
  }

  public async init(): Promise<void> {
    this.ensureToastContainer();
    await this.loadInitialPublicData();
    if (this.currentUser && this.token) {
      await this.refreshRoleData();
    }
    this.render();
  }

  private async apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Request failed with status ${res.status}`);
    }
    return data as T;
  }

  private async loadInitialPublicData(): Promise<void> {
    try {
      const [coursesRes, demoRes] = await Promise.all([
        this.apiRequest('/api/courses'),
        this.apiRequest('/api/auth/demo-accounts'),
      ]);
      this.courses = coursesRes.courses || [];
      if (coursesRes.filters) {
        this.semesters = coursesRes.filters.semesters || this.semesters;
        this.departments = coursesRes.filters.departments || this.departments;
        this.faculties = coursesRes.filters.faculties || [];
      }
      this.settings = coursesRes.settings || {};
      this.demoAccounts = demoRes.accounts || [];
    } catch (err) {
      console.error('Failed to load initial catalog data:', err);
    }
  }

  private async refreshRoleData(): Promise<void> {
    if (!this.currentUser) return;
    try {
      const coursesRes = await this.apiRequest('/api/courses');
      this.courses = coursesRes.courses || [];
      if (coursesRes.filters) {
        this.semesters = coursesRes.filters.semesters || this.semesters;
        this.departments = coursesRes.filters.departments || this.departments;
        this.faculties = coursesRes.filters.faculties || [];
      }
      this.settings = coursesRes.settings || {};

      if (this.currentUser.role === 'student') {
        const stuRes = await this.apiRequest(
          `/api/enrollments/student/${this.currentUser.userId}`
        );
        this.studentStats = stuRes.stats || this.studentStats;
        this.studentEnrollments = stuRes.enrollments || [];
        this.studentWaitlists = stuRes.waitlists || [];
      } else if (this.currentUser.role === 'faculty') {
        const facRes = await this.apiRequest('/api/faculty/dashboard');
        this.facultyStats = facRes.stats || this.facultyStats;
        this.facultyAssignedCourses = facRes.courses || [];
        if (
          !this.selectedFacultyCourseId &&
          this.facultyAssignedCourses.length > 0
        ) {
          this.selectedFacultyCourseId =
            this.facultyAssignedCourses[0].courseId;
        }
      } else if (this.currentUser.role === 'admin') {
        const [repEnr, repCourses, repStudents, stuList, facList, allEnr] =
          await Promise.all([
            this.apiRequest('/api/reports/enrollments'),
            this.apiRequest('/api/reports/courses'),
            this.apiRequest('/api/reports/students'),
            this.apiRequest('/api/users/students'),
            this.apiRequest('/api/users/faculty'),
            this.apiRequest('/api/enrollments'),
          ]);

        this.adminSummaryCards = repEnr.summaryCards || this.adminSummaryCards;
        this.adminChartsData = repEnr.charts || null;
        this.adminSavedReports = repEnr.savedReports || [];
        this.adminCoursesReport = repCourses.coursesReport || [];
        this.adminStudentsReport = repStudents.studentsReport || [];
        this.adminStudents = stuList.students || [];
        this.adminFaculty = facList.faculty || [];
        this.adminEnrollments = allEnr.enrollments || [];
      }
    } catch (err) {
      console.error('Error refreshing role data:', err);
    }
  }

  private ensureToastContainer(): HTMLElement {
    let container = document.getElementById('ch-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ch-toast-container';
      container.className = 'ch-toast-stack';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  public showToast(
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ): void {
    const container = this.ensureToastContainer();
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `ch-toast ch-toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <div class="flex-1 pr-2 font-medium">${this.escapeHtml(message)}</div>
      <button type="button" aria-label="Dismiss notification" class="text-white/80 hover:text-white text-xs font-bold px-1">✕</button>
    `;
    const closeBtn = toast.querySelector('button');
    closeBtn?.addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 2800);
  }

  private escapeHtml(str: unknown): string {
    const s = str === null || str === undefined ? '' : String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatDate(iso: string | undefined | null): string {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private async signInWithCredentials(
    email: string,
    password: string,
    role?: string
  ): Promise<void> {
    try {
      const res = await this.apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role }),
      });
      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem(STORAGE_TOKEN_KEY, res.token);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(res.user));

      this.currentView = this.getDefaultViewForRole(res.user.role);
      await this.refreshRoleData();
      this.render();
      this.showToast(res.message || `Signed in as ${res.user.name}`, 'success');
    } catch (err) {
      this.showToast(
        err instanceof Error ? err.message : 'Login failed.',
        'error'
      );
    }
  }

  private signOut(): void {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    this.currentView = 'landing';
    this.loadInitialPublicData().then(() => {
      this.render();
      this.showToast('You have been signed out of CourseHub.', 'info');
    });
  }

  public navigate(view: string): void {
    this.currentView = view;
    this.render();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  public render(): void {
    if (!this.currentUser) {
      if (this.currentView === 'login') {
        this.rootEl.innerHTML = this.renderLoginView();
        this.bindLoginEvents();
      } else if (this.currentView === 'register') {
        this.rootEl.innerHTML = this.renderRegisterView();
        this.bindRegisterEvents();
      } else {
        this.rootEl.innerHTML = this.renderLandingView();
        this.bindLandingEvents();
      }
      return;
    }

    this.rootEl.innerHTML = this.renderWorkspaceShell();
    this.bindWorkspaceEvents();

    if (
      this.currentUser.role === 'admin' &&
      this.currentView === 'admin-dashboard' &&
      this.adminChartsData
    ) {
      requestAnimationFrame(() => {
        if (this.adminChartsData) {
          renderAdminAnalyticsCharts(this.adminChartsData);
        }
      });
    }
  }

  // =========================================================================
  // PUBLIC VIEWS: LANDING, LOGIN, REGISTER
  // =========================================================================

  private renderLandingView(): string {
    const totalCourses = this.courses.length;
    const totalCapacity = this.courses.reduce((s, c) => s + c.totalSeats, 0);
    const totalAvailable = this.courses.reduce(
      (s, c) => s + c.availableSeats,
      0
    );
    const totalOccupied = totalCapacity - totalAvailable;

    return `
      <div class="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
        <!-- Top Bar Contract: 3 Zones separated by gap-8 -->
        <header class="flex items-center justify-between gap-8 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-30">
          <a href="#top" data-action="go-landing" class="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            CourseHub
          </a>

          <nav class="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600" aria-label="Primary Navigation">
            <a href="#catalog-preview" class="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0">Live Catalog</a>
            <a href="#role-portals" class="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0">Role Portals</a>
            <a href="#workflow-architecture" class="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0">Enrollment Engine</a>
            <button type="button" data-action="go-register" class="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 bg-transparent border-0 cursor-pointer font-medium text-slate-600">Student Registration</button>
          </nav>

          <div class="flex items-center gap-3 shrink-0">
            <button type="button" data-action="go-login" class="ch-btn ch-btn-primary">
              Sign In to Portal
            </button>
          </div>
        </header>

        <main class="flex-1">
          <!-- Hero Section -->
          <section class="max-w-[1360px] mx-auto px-8 pt-14 pb-12">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div class="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-8 lg:p-10">
                <div>
                  <p class="text-xs font-semibold text-blue-600 tracking-wide mb-3">
                    ${this.escapeHtml(this.settings.universityName || 'Westbridge Institute of Technology')} · Academic Year ${this.escapeHtml(this.settings.academicYear || '2026–2027')}
                  </p>
                  <h1 class="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-slate-900 leading-[1.15] mb-4" style="text-wrap: balance;">
                    University Course Enrollment &amp; Registration System
                  </h1>
                  <p class="text-slate-600 text-base leading-relaxed max-w-2xl mb-8">
                    Browse semester offerings, verify real-time seat availability, detect schedule clashes automatically, and generate instant PDF registration confirmations—backed by role-based portals for Students, Faculty, and the University Registrar.
                  </p>
                </div>

                <div>
                  <div class="flex flex-wrap items-center gap-3 mb-6">
                    <button type="button" data-action="go-login" class="ch-btn ch-btn-primary px-5 py-2.5 text-sm">
                      Access Role Portal
                    </button>
                    <button type="button" data-action="go-register" class="ch-btn ch-btn-secondary px-5 py-2.5 text-sm">
                      Register New Student Account
                    </button>
                  </div>

                  <div class="pt-5 border-t border-slate-200">
                    <p class="text-xs font-semibold text-slate-500 mb-2.5">
                      Instant Evaluator Demo Access (1-Click Role Sign-In):
                    </p>
                    <div class="flex flex-wrap gap-2.5">
                      <button type="button" data-demo-login="alex.rivera@university.edu|student123|student" class="ch-btn ch-btn-secondary text-xs">
                        Demo Student (Alex Rivera)
                      </button>
                      <button type="button" data-demo-login="elena.rostova@university.edu|faculty123|faculty" class="ch-btn ch-btn-secondary text-xs">
                        Demo Faculty (Dr. Elena Rostova)
                      </button>
                      <button type="button" data-demo-login="admin@coursehub.edu|admin123|admin" class="ch-btn ch-btn-secondary text-xs">
                        Demo Administrator (Dr. Marcus Vance)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right Column: Live MongoDB System Snapshot -->
              <div class="lg:col-span-5 bg-[#1E293B] text-white rounded-xl p-8 flex flex-col justify-between border border-slate-800">
                <div>
                  <div class="flex items-center justify-between border-b border-slate-700 pb-4 mb-6">
                    <div>
                      <h2 class="text-lg font-bold text-white">Live Registration Snapshot</h2>
                      <p class="text-xs text-slate-300 mt-0.5">Real-time seat &amp; course metrics from MongoDB</p>
                    </div>
                    <span class="font-mono-tabular text-xs text-blue-300">${this.escapeHtml(this.settings.currentSemester || 'Fall 2026')}</span>
                  </div>

                  <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="bg-slate-800/90 border border-slate-700 rounded-lg p-4">
                      <div class="text-xs text-slate-300">Active Courses</div>
                      <div class="text-2xl font-bold font-mono-tabular mt-1">${totalCourses}</div>
                      <div class="text-xs text-slate-400 mt-1">Across 5 Departments</div>
                    </div>
                    <div class="bg-slate-800/90 border border-slate-700 rounded-lg p-4">
                      <div class="text-xs text-slate-300">Available Seats</div>
                      <div class="text-2xl font-bold font-mono-tabular text-emerald-400 mt-1">${totalAvailable}</div>
                      <div class="text-xs text-slate-400 mt-1">Of ${totalCapacity} total capacity</div>
                    </div>
                    <div class="bg-slate-800/90 border border-slate-700 rounded-lg p-4">
                      <div class="text-xs text-slate-300">Occupied Seats</div>
                      <div class="text-2xl font-bold font-mono-tabular text-blue-400 mt-1">${totalOccupied}</div>
                      <div class="text-xs text-slate-400 mt-1">Confirmed enrollments</div>
                    </div>
                    <div class="bg-slate-800/90 border border-slate-700 rounded-lg p-4">
                      <div class="text-xs text-slate-300">Drop Deadline</div>
                      <div class="text-lg font-bold font-mono-tabular text-amber-300 mt-1">${this.formatDate(this.settings.dropDeadline)}</div>
                      <div class="text-xs text-slate-400 mt-1">Self-service window</div>
                    </div>
                  </div>
                </div>

                <div class="border-t border-slate-700 pt-4 text-xs text-slate-300 space-y-1.5">
                  <div><strong class="text-white">Atomic Seat Protection:</strong> Zero over-enrollment &amp; compound index duplicate prevention.</div>
                  <div><strong class="text-white">Timetable Clash Engine:</strong> Automatic day/time conflict verification before seat lock.</div>
                </div>
              </div>
            </div>
          </section>

          <!-- Role Portals Overview -->
          <section id="role-portals" class="max-w-[1360px] mx-auto px-8 py-8">
            <div class="mb-6">
              <h2 class="text-2xl font-bold text-slate-900">Three Dedicated Role Modules</h2>
              <p class="text-sm text-slate-600 mt-1">Strict JWT &amp; role-based access control tailored to each university stakeholder.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="ch-card flex flex-col justify-between">
                <div>
                  <div class="text-xs font-semibold text-blue-600 mb-1">01. Student Module</div>
                  <h3 class="text-lg font-bold text-slate-900 mb-2">Student Enrollment Portal</h3>
                  <p class="text-sm text-slate-600 mb-4">
                    Search courses by code or title, filter by semester and faculty, inspect live Green/Red/Blue seat indicators, check timetable clashes, enroll or drop courses, and download jsPDF enrollment receipts.
                  </p>
                </div>
                <button type="button" data-demo-login="alex.rivera@university.edu|student123|student" class="ch-btn ch-btn-primary w-full">
                  Enter Student Dashboard
                </button>
              </div>

              <div class="ch-card flex flex-col justify-between">
                <div>
                  <div class="text-xs font-semibold text-emerald-700 mb-1">02. Faculty Module</div>
                  <h3 class="text-lg font-bold text-slate-900 mb-2">Faculty Roster &amp; Course Portal</h3>
                  <p class="text-sm text-slate-600 mb-4">
                    View strictly assigned courses, monitor occupied and remaining course seats, inspect registered student rosters, search by student name or ID, and export class lists to CSV or PDF.
                  </p>
                </div>
                <button type="button" data-demo-login="elena.rostova@university.edu|faculty123|faculty" class="ch-btn ch-btn-secondary w-full">
                  Enter Faculty Dashboard
                </button>
              </div>

              <div class="ch-card flex flex-col justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-700 mb-1">03. Administrator Module</div>
                  <h3 class="text-lg font-bold text-slate-900 mb-2">Registrar &amp; Analytics Console</h3>
                  <p class="text-sm text-slate-600 mb-4">
                    Create and edit courses, assign faculty, adjust seat capacities, manage student &amp; faculty accounts, visualize 5 live Chart.js analytics charts, and export comprehensive PDF &amp; CSV reports.
                  </p>
                </div>
                <button type="button" data-demo-login="admin@coursehub.edu|admin123|admin" class="ch-btn ch-btn-secondary w-full">
                  Enter Admin Dashboard
                </button>
              </div>
            </div>
          </section>

          <!-- Live Course Catalog Preview -->
          <section id="catalog-preview" class="max-w-[1360px] mx-auto px-8 py-8">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div>
                <h2 class="text-2xl font-bold text-slate-900">Live University Course Catalog</h2>
                <p class="text-sm text-slate-600 mt-0.5">Real-time seat availability loaded directly from the CourseHub database.</p>
              </div>
              <button type="button" data-action="go-login" class="ch-btn ch-btn-primary">
                Sign In to Enroll in Courses
              </button>
            </div>

            <div class="ch-table-wrap">
              <table class="ch-table">
                <thead>
                  <tr>
                    <th>Course Code</th>
                    <th>Course Name</th>
                    <th>Department</th>
                    <th>Faculty Name</th>
                    <th>Semester &amp; Schedule</th>
                    <th>Total Seats</th>
                    <th>Available Seats</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.courses
                    .map((c) => {
                      const isFull = c.availableSeats <= 0;
                      return `
                        <tr>
                          <td class="font-mono-tabular font-semibold text-slate-900">${this.escapeHtml(c.courseCode)}</td>
                          <td>
                            <div class="font-semibold text-slate-900">${this.escapeHtml(c.title)}</div>
                            <div class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(c.description.slice(0, 80))}...</div>
                          </td>
                          <td class="text-slate-600 text-xs">${this.escapeHtml(c.department)}</td>
                          <td class="text-slate-700 font-medium">${this.escapeHtml(c.facultyName)}</td>
                          <td class="text-xs text-slate-600">
                            <div>${this.escapeHtml(c.semester)}</div>
                            <div class="font-mono-tabular text-slate-500">${this.escapeHtml(c.schedule)}</div>
                          </td>
                          <td class="font-mono-tabular">${c.totalSeats}</td>
                          <td class="font-mono-tabular font-semibold ${isFull ? 'seat-indicator-full' : 'seat-indicator-available'}">${c.availableSeats}</td>
                          <td>
                            <span class="text-xs ${isFull ? 'seat-indicator-full' : 'seat-indicator-available'}">
                              ${isFull ? 'Course Full (Red)' : 'Seats Available (Green)'}
                            </span>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Workflow Architecture Section -->
          <section id="workflow-architecture" class="max-w-[1360px] mx-auto px-8 py-8 pb-16">
            <div class="ch-card">
              <h2 class="text-xl font-bold text-slate-900 mb-2">Atomic 9-Step Enrollment &amp; Seat Verification Workflow</h2>
              <p class="text-sm text-slate-600 mb-6">
                Every registration request passes through strict server-side validation before modifying seat counts:
              </p>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <div class="font-bold text-slate-900 mb-1">01. Authentication &amp; Duplicate Guard</div>
                  <p class="text-slate-600 text-xs leading-relaxed">
                    Verifies JWT Bearer token, checks semester registration deadlines, and enforces a unique compound index on <code>(studentId, courseId, status: Active)</code>.
                  </p>
                </div>
                <div>
                  <div class="font-bold text-slate-900 mb-1">02. Timetable Clash &amp; Capacity Check</div>
                  <p class="text-slate-600 text-xs leading-relaxed">
                    Parses day/time intervals to prevent overlapping class schedules and confirms <code>availableSeats &gt; 0</code> so seat counts never become negative.
                  </p>
                </div>
                <div>
                  <div class="font-bold text-slate-900 mb-1">03. Atomic Seat Lock &amp; Receipt</div>
                  <p class="text-slate-600 text-xs leading-relaxed">
                    Atomically creates the enrollment record, decrements <code>availableSeats</code> by 1, updates dashboard statistics, and enables instant jsPDF receipt generation.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer class="bg-white border-t border-slate-200 px-8 py-5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
          <div>CourseHub – Course Enrollment and Registration System · Full-Stack University Project</div>
          <div class="flex items-center gap-4">
            <a href="/login.html" data-action="go-login" class="hover:text-slate-900">Login Portal</a>
            <span>·</span>
            <a href="/register.html" data-action="go-register" class="hover:text-slate-900">Student Registration</a>
          </div>
        </footer>
      </div>
    `;
  }

  private renderLoginView(): string {
    const adminDemos = this.demoAccounts.filter((a) => a.role === 'admin');
    const facultyDemos = this.demoAccounts.filter((a) => a.role === 'faculty');
    const studentDemos = this.demoAccounts.filter((a) => a.role === 'student');

    return `
      <div class="min-h-screen bg-[#F8FAFC] flex flex-col">
        <header class="flex items-center justify-between gap-8 px-8 py-4 bg-white border-b border-slate-200">
          <a href="#top" data-action="go-landing" class="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            CourseHub
          </a>
          <div class="flex items-center gap-3">
            <button type="button" data-action="go-landing" class="ch-btn ch-btn-secondary">Back to Home</button>
            <button type="button" data-action="go-register" class="ch-btn ch-btn-primary">Register Student Account</button>
          </div>
        </header>

        <main class="flex-1 max-w-[1240px] w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <!-- Sign In Form -->
          <div class="lg:col-span-5 ch-card p-7">
            <h1 class="text-2xl font-bold text-slate-900 mb-1">Sign In to CourseHub</h1>
            <p class="text-sm text-slate-600 mb-6">Enter your university email or User ID and password.</p>

            <form id="ch-login-form" class="space-y-4">
              <div>
                <label for="login-role" class="block text-xs font-semibold text-slate-700 mb-1">Portal Role</label>
                <select id="login-role" name="role" class="ch-select">
                  <option value="all">Auto-Detect Role from Account</option>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div>
                <label for="login-email" class="block text-xs font-semibold text-slate-700 mb-1">University Email or User ID</label>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  required
                  placeholder="e.g. alex.rivera@university.edu or STU-2001"
                  class="ch-input"
                  value="alex.rivera@university.edu"
                />
              </div>

              <div>
                <label for="login-password" class="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  placeholder="Enter password"
                  class="ch-input"
                  value="student123"
                />
              </div>

              <button type="submit" class="ch-btn ch-btn-primary w-full py-2.5 text-sm">
                Sign In to Dashboard
              </button>
            </form>

            <div class="mt-6 pt-5 border-t border-slate-200 text-center text-xs text-slate-600">
              New student at the university?
              <button type="button" data-action="go-register" class="text-blue-600 font-semibold hover:underline bg-transparent border-0 cursor-pointer ml-1">
                Create a Student Account
              </button>
            </div>
          </div>

          <!-- Demo Credentials Directory (1 Admin, 3 Faculty, 10 Students) -->
          <div class="lg:col-span-7 ch-card p-7">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-200">
              <div>
                <h2 class="text-lg font-bold text-slate-900">Seeded University Demo Accounts</h2>
                <p class="text-xs text-slate-600 mt-0.5">
                  Click any account below to auto-fill credentials and sign in immediately.
                </p>
              </div>
              <span class="text-xs font-mono-tabular text-slate-500">1 Admin · 3 Faculty · 10 Students</span>
            </div>

            <div class="space-y-5">
              <div>
                <h3 class="text-xs font-bold text-slate-700 mb-2">Administrator Account (Password: <code class="font-mono-tabular">admin123</code>)</h3>
                <div class="grid grid-cols-1 gap-2">
                  ${adminDemos
                    .map(
                      (a) => `
                    <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                      <div>
                        <div class="font-semibold text-sm text-slate-900">${this.escapeHtml(a.name)} <span class="font-mono-tabular text-xs text-slate-500">(${this.escapeHtml(a.userId)})</span></div>
                        <div class="text-xs text-slate-600 font-mono-tabular">${this.escapeHtml(a.email)} · ${this.escapeHtml(a.department)}</div>
                      </div>
                      <button type="button" data-demo-login="${this.escapeHtml(a.email)}|${this.escapeHtml(a.demoPassword)}|admin" class="ch-btn ch-btn-primary text-xs py-1.5 px-3">
                        Sign In as Admin
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div>
                <h3 class="text-xs font-bold text-slate-700 mb-2">Faculty Accounts (Password: <code class="font-mono-tabular">faculty123</code>)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  ${facultyDemos
                    .map(
                      (f) => `
                    <div class="p-3 rounded-lg border border-slate-200 bg-white flex flex-col justify-between gap-2">
                      <div>
                        <div class="font-semibold text-xs text-slate-900">${this.escapeHtml(f.name)}</div>
                        <div class="text-[11px] text-slate-500 font-mono-tabular">${this.escapeHtml(f.userId)} · ${this.escapeHtml(f.department)}</div>
                        <div class="text-[11px] text-slate-600 truncate mt-0.5">${this.escapeHtml(f.email)}</div>
                      </div>
                      <button type="button" data-demo-login="${this.escapeHtml(f.email)}|${this.escapeHtml(f.demoPassword)}|faculty" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5 w-full">
                        Sign In Faculty
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div>
                <h3 class="text-xs font-bold text-slate-700 mb-2">Student Accounts (Password: <code class="font-mono-tabular">student123</code>)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  ${studentDemos
                    .map(
                      (s) => `
                    <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-white">
                      <div class="min-w-0">
                        <div class="font-semibold text-xs text-slate-900 truncate">${this.escapeHtml(s.name)} <span class="font-mono-tabular text-[11px] text-slate-500">(${this.escapeHtml(s.userId)})</span></div>
                        <div class="text-[11px] text-slate-500 truncate">${this.escapeHtml(s.department)} · ${this.escapeHtml(s.semester)}</div>
                      </div>
                      <button type="button" data-demo-login="${this.escapeHtml(s.email)}|${this.escapeHtml(s.demoPassword)}|student" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                        Sign In
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  private renderRegisterView(): string {
    return `
      <div class="min-h-screen bg-[#F8FAFC] flex flex-col">
        <header class="flex items-center justify-between gap-8 px-8 py-4 bg-white border-b border-slate-200">
          <a href="#top" data-action="go-landing" class="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            CourseHub
          </a>
          <div class="flex items-center gap-3">
            <button type="button" data-action="go-landing" class="ch-btn ch-btn-secondary">Back to Home</button>
            <button type="button" data-action="go-login" class="ch-btn ch-btn-primary">Sign In</button>
          </div>
        </header>

        <main class="flex-1 max-w-xl w-full mx-auto px-6 py-10">
          <div class="ch-card p-8">
            <h1 class="text-2xl font-bold text-slate-900 mb-1">Student Account Registration</h1>
            <p class="text-sm text-slate-600 mb-6">
              Register for a new university student account to browse and enroll in semester courses.
            </p>

            <form id="ch-register-form" class="space-y-4">
              <div>
                <label for="reg-name" class="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
                <input id="reg-name" name="name" type="text" required placeholder="e.g. Jordan Taylor" class="ch-input" />
              </div>

              <div>
                <label for="reg-email" class="block text-xs font-semibold text-slate-700 mb-1">University Email Address</label>
                <input id="reg-email" name="email" type="email" required placeholder="e.g. jordan.taylor@university.edu" class="ch-input" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="reg-department" class="block text-xs font-semibold text-slate-700 mb-1">Academic Department</label>
                  <select id="reg-department" name="department" class="ch-select">
                    <option value="Computer Science">Computer Science</option>
                    <option value="Data Science & AI">Data Science &amp; AI</option>
                    <option value="Electrical Engineering">Electrical Engineering</option>
                    <option value="Software Engineering">Software Engineering</option>
                    <option value="Cybersecurity">Cybersecurity</option>
                  </select>
                </div>
                <div>
                  <label for="reg-semester" class="block text-xs font-semibold text-slate-700 mb-1">Entry Semester</label>
                  <select id="reg-semester" name="semester" class="ch-select">
                    <option value="Fall 2026">Fall 2026</option>
                    <option value="Spring 2027">Spring 2027</option>
                    <option value="Summer 2027">Summer 2027</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="reg-password" class="block text-xs font-semibold text-slate-700 mb-1">Password (min 6 chars)</label>
                  <input id="reg-password" name="password" type="password" required minlength="6" placeholder="Create password" class="ch-input" />
                </div>
                <div>
                  <label for="reg-phone" class="block text-xs font-semibold text-slate-700 mb-1">Phone Number (optional)</label>
                  <input id="reg-phone" name="phone" type="text" placeholder="+1 (555) 000-0000" class="ch-input" />
                </div>
              </div>

              <button type="submit" class="ch-btn ch-btn-primary w-full py-2.5 text-sm mt-2">
                Complete Student Registration
              </button>
            </form>
          </div>
        </main>
      </div>
    `;
  }

  // =========================================================================
  // AUTHENTICATED WORKSPACE SHELL & ROLE SIDEBARS
  // =========================================================================

  private getSidebarMenuForRole(
    role: 'student' | 'faculty' | 'admin'
  ): Array<{ id: string; label: string }> {
    if (role === 'student') {
      return [
        { id: 'student-dashboard', label: 'Student Dashboard' },
        { id: 'student-catalog', label: 'Course Catalog' },
        { id: 'student-my-courses', label: 'My Enrolled Courses' },
        { id: 'student-history', label: 'Enrollment History' },
        { id: 'profile', label: 'Student Profile' },
      ];
    }
    if (role === 'faculty') {
      return [
        { id: 'faculty-dashboard', label: 'Faculty Dashboard' },
        { id: 'faculty-courses', label: 'My Assigned Courses' },
        { id: 'faculty-roster', label: 'Course Roster & Export' },
        { id: 'profile', label: 'Faculty Profile' },
      ];
    }
    return [
      { id: 'admin-dashboard', label: 'Analytics Dashboard' },
      { id: 'admin-courses', label: 'Course Management' },
      { id: 'admin-seats', label: 'Seat Capacity Control' },
      { id: 'admin-students', label: 'Student Management' },
      { id: 'admin-faculty', label: 'Faculty Management' },
      { id: 'admin-enrollments', label: 'Enrollment Management' },
      { id: 'admin-reports', label: 'Reports & Exports' },
      { id: 'admin-settings', label: 'Deadlines & Deliverables' },
      { id: 'profile', label: 'Administrator Profile' },
    ];
  }

  private renderWorkspaceShell(): string {
    const user = this.currentUser!;
    const menuItems = this.getSidebarMenuForRole(user.role);
    const activeMenu = menuItems.find((m) => m.id === this.currentView);
    const roleLabel =
      user.role === 'admin'
        ? 'Administrator Portal'
        : user.role === 'faculty'
          ? 'Faculty Portal'
          : 'Student Portal';

    return `
      <div class="ch-shell">
        <!-- Role-Specific Left Sidebar -->
        <aside class="ch-sidebar" aria-label="${roleLabel} Navigation">
          <div class="px-6 py-5 border-b border-slate-800">
            <div class="text-lg font-extrabold tracking-tight text-white font-display">CourseHub</div>
            <div class="text-xs text-slate-400 mt-0.5">${roleLabel} · <span class="font-mono-tabular">${this.escapeHtml(user.userId)}</span></div>
          </div>

          <nav class="flex-1 px-3 py-4 space-y-1">
            ${menuItems
              .map(
                (item) => `
              <button
                type="button"
                data-nav-view="${item.id}"
                class="ch-nav-btn ${this.currentView === item.id ? 'active' : ''}"
              >
                <span>${this.escapeHtml(item.label)}</span>
              </button>
            `
              )
              .join('')}
          </nav>

          <!-- Quick Role Switcher for Evaluators -->
          <div class="px-4 py-3 border-t border-slate-800 bg-slate-900/50">
            <div class="text-[11px] font-semibold text-slate-400 mb-2">Quick Evaluator Role Switch</div>
            <div class="grid grid-cols-3 gap-1.5">
              <button type="button" data-demo-login="alex.rivera@university.edu|student123|student" class="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer ${user.role === 'student' ? 'border-blue-500 text-white font-semibold' : ''}">
                Student
              </button>
              <button type="button" data-demo-login="elena.rostova@university.edu|faculty123|faculty" class="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer ${user.role === 'faculty' ? 'border-blue-500 text-white font-semibold' : ''}">
                Faculty
              </button>
              <button type="button" data-demo-login="admin@coursehub.edu|admin123|admin" class="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer ${user.role === 'admin' ? 'border-blue-500 text-white font-semibold' : ''}">
                Admin
              </button>
            </div>
          </div>

          <div class="p-4 border-t border-slate-800">
            <div class="text-xs font-semibold text-white truncate">${this.escapeHtml(user.name)}</div>
            <div class="text-[11px] text-slate-400 truncate mb-3">${this.escapeHtml(user.email)}</div>
            <button type="button" data-action="sign-out" class="ch-btn ch-btn-secondary w-full text-xs py-1.5">
              Sign Out
            </button>
          </div>
        </aside>

        <!-- Main Viewport -->
        <div class="ch-main-area">
          <!-- Contextual Top Bar -->
          <header class="ch-topbar">
            <div class="flex items-center gap-2 text-sm text-slate-600 truncate">
              <span class="font-medium text-slate-500">${roleLabel}</span>
              <span>/</span>
              <span class="font-bold text-slate-900">${this.escapeHtml(activeMenu ? activeMenu.label : 'Dashboard')}</span>
            </div>

            <div class="flex items-center gap-4 shrink-0">
              <div class="hidden sm:block text-right text-xs">
                <span class="font-semibold text-slate-900">${this.escapeHtml(user.name)}</span>
                <span class="text-slate-400 mx-1">·</span>
                <span class="text-slate-600">${this.escapeHtml(user.department)}</span>
              </div>
              <button type="button" data-action="refresh-data" class="ch-btn ch-btn-secondary text-xs py-1.5 px-3">
                Sync Data
              </button>
            </div>
          </header>

          <main class="ch-content">
            ${this.renderActiveRoleContent()}
          </main>
        </div>
      </div>
      <div id="ch-modal-root"></div>
    `;
  }

  private renderActiveRoleContent(): string {
    switch (this.currentView) {
      // Student Views
      case 'student-dashboard':
        return this.renderStudentDashboardView();
      case 'student-catalog':
        return this.renderStudentCatalogView();
      case 'student-my-courses':
        return this.renderStudentMyCoursesView();
      case 'student-history':
        return this.renderStudentHistoryView();

      // Faculty Views
      case 'faculty-dashboard':
        return this.renderFacultyDashboardView();
      case 'faculty-courses':
        return this.renderFacultyCoursesView();
      case 'faculty-roster':
        return this.renderFacultyRosterView();

      // Admin Views
      case 'admin-dashboard':
        return this.renderAdminDashboardView();
      case 'admin-courses':
        return this.renderAdminCoursesView();
      case 'admin-seats':
        return this.renderAdminSeatsView();
      case 'admin-students':
        return this.renderAdminStudentsView();
      case 'admin-faculty':
        return this.renderAdminFacultyView();
      case 'admin-enrollments':
        return this.renderAdminEnrollmentsView();
      case 'admin-reports':
        return this.renderAdminReportsView();
      case 'admin-settings':
        return this.renderAdminSettingsView();

      // Shared Profile View
      case 'profile':
        return this.renderProfileView();

      default:
        return this.renderStudentDashboardView();
    }
  }

  // =========================================================================
  // STUDENT MODULE VIEWS
  // =========================================================================

  private renderStudentDashboardView(): string {
    const user = this.currentUser!;
    const activeList = this.studentEnrollments.filter(
      (e) => e.status === 'Active'
    );
    const availableCoursesPreview = this.courses
      .filter((c) => !c.isEnrolled && c.availableSeats > 0)
      .slice(0, 4);

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Welcome, ${this.escapeHtml(user.name)}</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Student ID: <span class="font-mono-tabular font-semibold text-slate-800">${this.escapeHtml(user.userId)}</span>
              · Department: ${this.escapeHtml(user.department)}
              · Drop Deadline: <span class="font-mono-tabular font-medium">${this.formatDate(this.settings.dropDeadline)}</span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button type="button" data-nav-view="student-catalog" class="ch-btn ch-btn-primary">
              Browse Course Catalog
            </button>
            <button type="button" data-action="download-full-schedule-pdf" class="ch-btn ch-btn-secondary">
              Download Schedule PDF
            </button>
          </div>
        </div>

        <!-- 4 Required Student Dashboard Cards -->
        <div class="ch-stat-grid">
          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Total Courses Enrolled</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-blue-600 mt-1.5" data-testid="stat-student-enrolled">${this.studentStats.totalCoursesEnrolled}</div>
            <div class="text-xs text-slate-500 mt-1">${this.studentStats.totalCredits} Academic Credits</div>
          </div>

          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Remaining Slots</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-slate-900 mt-1.5" data-testid="stat-student-remaining">${this.studentStats.remainingSlots}</div>
            <div class="text-xs text-slate-500 mt-1">Out of ${this.studentStats.maxSlots} semester max</div>
          </div>

          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Available Courses</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-emerald-600 mt-1.5" data-testid="stat-student-available">${this.studentStats.availableCourses}</div>
            <div class="text-xs text-slate-500 mt-1">Courses with open seats</div>
          </div>

          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Active Enrollments</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-blue-600 mt-1.5" data-testid="stat-student-active">${this.studentStats.activeEnrollments}</div>
            <div class="text-xs text-slate-500 mt-1">${this.studentStats.droppedEnrollments} dropped historically</div>
          </div>
        </div>

        <!-- Active Courses Table -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-slate-900">Current Registered Courses</h2>
            <button type="button" data-nav-view="student-my-courses" class="text-xs font-semibold text-blue-600 hover:underline bg-transparent border-0 cursor-pointer">
              Manage All My Courses →
            </button>
          </div>

          ${
            activeList.length === 0
              ? `
            <div class="ch-card text-center py-10">
              <div class="text-base font-bold text-slate-800 mb-1">No Active Course Enrollments Yet</div>
              <p class="text-sm text-slate-600 mb-4">Browse the university course catalog to register for your semester classes.</p>
              <button type="button" data-nav-view="student-catalog" class="ch-btn ch-btn-primary">
                Open Course Catalog
              </button>
            </div>
          `
              : `
            <div class="ch-table-wrap">
              <table class="ch-table">
                <thead>
                  <tr>
                    <th>Course Code</th>
                    <th>Course Title</th>
                    <th>Faculty</th>
                    <th>Semester &amp; Schedule</th>
                    <th>Enrolled Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeList
                    .map(
                      (enr) => `
                    <tr>
                      <td class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(enr.courseCode)}</td>
                      <td>
                        <div class="font-semibold text-slate-900">${this.escapeHtml(enr.courseTitle)}</div>
                        <div class="text-xs text-slate-500">${this.escapeHtml(enr.room)} · ${enr.credits} Credits</div>
                      </td>
                      <td class="text-slate-700">${this.escapeHtml(enr.facultyName)}</td>
                      <td class="text-xs">
                        <div class="font-medium text-slate-800">${this.escapeHtml(enr.semester)}</div>
                        <div class="font-mono-tabular text-slate-500">${this.escapeHtml(enr.schedule)}</div>
                      </td>
                      <td class="font-mono-tabular text-xs text-slate-600">${this.formatDate(enr.enrolledAt)}</td>
                      <td>
                        <div class="flex items-center gap-2">
                          <button type="button" data-download-receipt="${enr.enrollmentId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                            PDF Receipt
                          </button>
                          <button type="button" data-drop-enrollment="${enr.enrollmentId}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5">
                            Drop Course
                          </button>
                        </div>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>

        <!-- Recommended Open Courses -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-slate-900">Recommended Courses with Open Seats</h2>
            <button type="button" data-nav-view="student-catalog" class="text-xs font-semibold text-blue-600 hover:underline bg-transparent border-0 cursor-pointer">
              View Full Catalog (${this.courses.length} Courses) →
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${availableCoursesPreview
              .map(
                (c) => `
              <div class="ch-card flex flex-col justify-between gap-4">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-mono-tabular text-xs font-bold text-blue-600">${this.escapeHtml(c.courseCode)} · ${this.escapeHtml(c.semester)}</span>
                    <span class="text-xs seat-indicator-available font-mono-tabular">${c.availableSeats} / ${c.totalSeats} seats available</span>
                  </div>
                  <h3 class="text-base font-bold text-slate-900">${this.escapeHtml(c.title)}</h3>
                  <p class="text-xs text-slate-600 mt-1">${this.escapeHtml(c.description)}</p>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <div class="text-slate-600">
                    <strong>${this.escapeHtml(c.facultyName)}</strong> · <span class="font-mono-tabular">${this.escapeHtml(c.schedule)}</span>
                  </div>
                  <button type="button" data-enroll-course="${c.courseId}" class="ch-btn ch-btn-primary text-xs py-1.5 px-3">
                    Enroll Now
                  </button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  private getFilteredCatalogCourses(): CourseItem[] {
    return this.courses.filter((c) => {
      if (this.catalogSearch.trim()) {
        const q = this.catalogSearch.trim().toLowerCase();
        const matches =
          c.courseCode.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.facultyName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (
        this.catalogSemester !== 'all' &&
        c.semester !== this.catalogSemester
      ) {
        return false;
      }
      if (
        this.catalogFaculty !== 'all' &&
        c.facultyId !== this.catalogFaculty
      ) {
        return false;
      }
      if (this.catalogStatus !== 'all') {
        if (this.catalogStatus === 'available' && c.availableSeats <= 0)
          return false;
        if (this.catalogStatus === 'full' && c.availableSeats > 0)
          return false;
        if (this.catalogStatus === 'enrolled' && !c.isEnrolled) return false;
      }
      return true;
    });
  }

  private renderStudentCatalogView(): string {
    const filtered = this.getFilteredCatalogCourses();

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">University Course Catalog</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Search and filter available semester offerings. Seat indicators:
              <span class="seat-indicator-available">Green (Seats Available)</span> ·
              <span class="seat-indicator-full">Red (Course Full)</span> ·
              <span class="seat-indicator-enrolled">Blue (Already Enrolled)</span>
            </p>
          </div>
        </div>

        <!-- Search and Filter Controls -->
        <div class="ch-card">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div class="md:col-span-4">
              <label for="catalog-search-input" class="block text-xs font-semibold text-slate-700 mb-1">Search by Course Name or Code</label>
              <input
                id="catalog-search-input"
                type="search"
                placeholder="Search e.g. CS301, Algorithms, Machine Learning..."
                value="${this.escapeHtml(this.catalogSearch)}"
                class="ch-input"
              />
            </div>

            <div class="md:col-span-3">
              <label for="catalog-semester-filter" class="block text-xs font-semibold text-slate-700 mb-1">Filter by Semester</label>
              <select id="catalog-semester-filter" class="ch-select">
                <option value="all" ${this.catalogSemester === 'all' ? 'selected' : ''}>All Semesters</option>
                ${this.semesters
                  .map(
                    (s) =>
                      `<option value="${this.escapeHtml(s)}" ${this.catalogSemester === s ? 'selected' : ''}>${this.escapeHtml(s)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div class="md:col-span-3">
              <label for="catalog-faculty-filter" class="block text-xs font-semibold text-slate-700 mb-1">Filter by Faculty</label>
              <select id="catalog-faculty-filter" class="ch-select">
                <option value="all" ${this.catalogFaculty === 'all' ? 'selected' : ''}>All Faculty Members</option>
                ${this.faculties
                  .map(
                    (f) =>
                      `<option value="${this.escapeHtml(f.userId)}" ${this.catalogFaculty === f.userId ? 'selected' : ''}>${this.escapeHtml(f.name)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div class="md:col-span-2">
              <label for="catalog-status-filter" class="block text-xs font-semibold text-slate-700 mb-1">Seat Status</label>
              <select id="catalog-status-filter" class="ch-select">
                <option value="all" ${this.catalogStatus === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="available" ${this.catalogStatus === 'available' ? 'selected' : ''}>Seats Available</option>
                <option value="full" ${this.catalogStatus === 'full' ? 'selected' : ''}>Course Full</option>
                <option value="enrolled" ${this.catalogStatus === 'enrolled' ? 'selected' : ''}>Already Enrolled</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Course Catalog Table (9 Required Columns) -->
        <div class="ch-table-wrap">
          <table class="ch-table" data-testid="student-catalog-table">
            <thead>
              <tr>
                <th>Course Code</th>
                <th class="min-w-[200px]">Course Name</th>
                <th class="min-w-[230px]">Description</th>
                <th>Faculty Name</th>
                <th>Semester</th>
                <th class="text-right">Total Seats</th>
                <th class="text-right">Available Seats</th>
                <th>Enrollment Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length === 0
                  ? `
                <tr>
                  <td colspan="9" class="text-center py-8 text-slate-500">
                    No courses match your current search and filter criteria.
                  </td>
                </tr>
              `
                  : filtered
                      .map((course) => {
                        let statusClass = 'seat-indicator-available';
                        let statusLabel = 'Seats Available';
                        let barColor = '#16A34A';

                        if (course.isEnrolled) {
                          statusClass = 'seat-indicator-enrolled';
                          statusLabel = 'Already Enrolled';
                          barColor = '#3B82F6';
                        } else if (course.availableSeats <= 0) {
                          statusClass = 'seat-indicator-full';
                          statusLabel = 'Course Full';
                          barColor = '#DC2626';
                        }

                        return `
                          <tr data-course-row="${course.courseCode}">
                            <td class="font-mono-tabular font-bold text-slate-900">
                              <button type="button" data-view-course="${course.courseId}" class="text-blue-600 hover:underline font-mono-tabular font-bold bg-transparent border-0 cursor-pointer p-0">
                                ${this.escapeHtml(course.courseCode)}
                              </button>
                            </td>
                            <td class="min-w-[200px]">
                              <div class="font-semibold text-slate-900">${this.escapeHtml(course.title)}</div>
                              <div class="text-xs text-slate-500 font-mono-tabular mt-0.5">${this.escapeHtml(course.schedule)} · ${this.escapeHtml(course.room)}</div>
                            </td>
                            <td class="min-w-[230px] max-w-xs">
                              <div class="text-xs text-slate-600 line-clamp-2">${this.escapeHtml(course.description)}</div>
                              <button type="button" data-view-course="${course.courseId}" class="text-[11px] font-semibold text-blue-600 hover:underline bg-transparent border-0 cursor-pointer p-0 mt-1">
                                View Full Details
                              </button>
                            </td>
                            <td class="font-medium text-slate-800 whitespace-nowrap">${this.escapeHtml(course.facultyName)}</td>
                            <td class="text-xs font-medium text-slate-700 whitespace-nowrap">${this.escapeHtml(course.semester)}</td>
                            <td class="font-mono-tabular text-right">${course.totalSeats}</td>
                            <td class="font-mono-tabular text-right">
                              <span class="${statusClass}">${course.availableSeats}</span>
                              <div class="seat-bar-track">
                                <div class="seat-bar-fill" style="width: ${course.fillPercentage}%; background-color: ${barColor};"></div>
                              </div>
                            </td>
                            <td>
                              <div class="text-xs ${statusClass}">${statusLabel}</div>
                              ${
                                course.scheduleClashWith
                                  ? `<div class="text-[11px] text-amber-700 mt-0.5">Clash: ${this.escapeHtml(course.scheduleClashWith)}</div>`
                                  : ''
                              }
                            </td>
                            <td>
                              ${
                                course.isEnrolled
                                  ? `
                                <div class="flex items-center gap-1.5">
                                  <button type="button" disabled class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                                    Enrolled
                                  </button>
                                  <button type="button" data-drop-enrollment="${course.studentEnrollmentId}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5">
                                    Drop
                                  </button>
                                </div>
                              `
                                  : course.availableSeats <= 0
                                    ? `
                                <div class="flex items-center gap-1.5">
                                  <button type="button" data-enroll-course="${course.courseId}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5" title="Course is full">
                                    Full
                                  </button>
                                  ${
                                    course.isWaitlisted
                                      ? `<button type="button" data-leave-waitlist="${course.studentWaitlistId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">Waitlisted (Leave)</button>`
                                      : `<button type="button" data-join-waitlist="${course.courseId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">Join Waitlist</button>`
                                  }
                                </div>
                              `
                                    : `
                                <button type="button" data-enroll-course="${course.courseId}" class="ch-btn ch-btn-primary text-xs py-1.5 px-3">
                                  Enroll
                                </button>
                              `
                              }
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderStudentMyCoursesView(): string {
    const activeList = this.studentEnrollments.filter(
      (e) => e.status === 'Active'
    );

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">My Enrolled Courses</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Review your active course registrations, download official PDF enrollment receipts, or drop a course before ${this.formatDate(this.settings.dropDeadline)}.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button type="button" data-action="download-full-schedule-pdf" class="ch-btn ch-btn-secondary">
              Download Full Schedule PDF
            </button>
            <button type="button" data-nav-view="student-catalog" class="ch-btn ch-btn-primary">
              Enroll in Another Course
            </button>
          </div>
        </div>

        ${
          activeList.length === 0
            ? `
          <div class="ch-card text-center py-12">
            <h2 class="text-lg font-bold text-slate-900 mb-1">You have no active course enrollments</h2>
            <p class="text-sm text-slate-600 mb-4">Visit the Course Catalog to browse available classes and register.</p>
            <button type="button" data-nav-view="student-catalog" class="ch-btn ch-btn-primary">
              Browse Course Catalog
            </button>
          </div>
        `
            : `
          <div class="grid grid-cols-1 gap-4">
            ${activeList
              .map(
                (enr) => `
              <div class="ch-card flex flex-col lg:flex-row lg:items-center justify-between gap-5" data-my-course-card="${this.escapeHtml(enr.courseCode)}">
                <div class="space-y-1.5 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(enr.courseCode)}</span>
                    <span>·</span>
                    <span class="font-medium text-slate-700">${this.escapeHtml(enr.semester)}</span>
                    <span>·</span>
                    <span class="font-mono-tabular text-slate-500">Enrollment ID: ${this.escapeHtml(enr.enrollmentId)}</span>
                    <span>·</span>
                    <span class="seat-indicator-enrolled">Active Registration</span>
                  </div>
                  <h2 class="text-lg font-bold text-slate-900">${this.escapeHtml(enr.courseTitle)}</h2>
                  <p class="text-sm text-slate-600">${this.escapeHtml(enr.courseDescription)}</p>
                  <div class="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-600">
                    <div><strong>Course Faculty:</strong> ${this.escapeHtml(enr.facultyName)}</div>
                    <div><strong>Schedule:</strong> <span class="font-mono-tabular">${this.escapeHtml(enr.schedule)}</span> (${this.escapeHtml(enr.room)})</div>
                    <div><strong>Enrollment Date:</strong> <span class="font-mono-tabular">${this.formatDate(enr.enrolledAt)}</span></div>
                    <div><strong>Credits:</strong> <span class="font-mono-tabular">${enr.credits}</span></div>
                  </div>
                </div>

                <div class="flex sm:flex-row lg:flex-col gap-2.5 shrink-0">
                  <button type="button" data-download-receipt="${enr.enrollmentId}" class="ch-btn ch-btn-primary text-xs">
                    Download PDF Confirmation
                  </button>
                  <button type="button" data-drop-enrollment="${enr.enrollmentId}" class="ch-btn ch-btn-danger text-xs">
                    Drop Course
                  </button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
        }

        ${
          this.studentWaitlists.length > 0
            ? `
          <div class="space-y-3 pt-4">
            <h2 class="text-lg font-bold text-slate-900">My Course Waitlist Requests</h2>
            <div class="ch-table-wrap">
              <table class="ch-table">
                <thead>
                  <tr>
                    <th>Waitlist ID</th>
                    <th>Course</th>
                    <th>Faculty</th>
                    <th>Semester</th>
                    <th>Queue Position</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.studentWaitlists
                    .map(
                      (w) => `
                    <tr>
                      <td class="font-mono-tabular text-xs">${this.escapeHtml(w.waitlistId)}</td>
                      <td class="font-semibold">${this.escapeHtml(w.courseCode)} — ${this.escapeHtml(w.courseTitle)}</td>
                      <td>${this.escapeHtml(w.facultyName)}</td>
                      <td>${this.escapeHtml(w.semester)}</td>
                      <td class="font-mono-tabular font-bold text-amber-700">#${w.position}</td>
                      <td>
                        <button type="button" data-leave-waitlist="${w.waitlistId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                          Leave Waitlist
                        </button>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private renderStudentHistoryView(): string {
    return `
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Complete Enrollment History</h1>
          <p class="text-sm text-slate-600 mt-0.5">
            Audit log of all active and dropped course registrations for your student account.
          </p>
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Enrollment ID</th>
                <th>Course Code</th>
                <th>Course Name</th>
                <th>Faculty</th>
                <th>Semester</th>
                <th>Enrolled Date</th>
                <th>Dropped Date</th>
                <th>Status</th>
                <th>Confirmation</th>
              </tr>
            </thead>
            <tbody>
              ${
                this.studentEnrollments.length === 0
                  ? `<tr><td colspan="9" class="text-center py-8 text-slate-500">No enrollment history found.</td></tr>`
                  : this.studentEnrollments
                      .map(
                        (e) => `
                    <tr>
                      <td class="font-mono-tabular text-xs font-semibold">${this.escapeHtml(e.enrollmentId)}</td>
                      <td class="font-mono-tabular font-bold text-slate-900">${this.escapeHtml(e.courseCode)}</td>
                      <td class="font-medium text-slate-900">${this.escapeHtml(e.courseTitle)}</td>
                      <td class="text-slate-600">${this.escapeHtml(e.facultyName)}</td>
                      <td class="text-xs">${this.escapeHtml(e.semester)}</td>
                      <td class="font-mono-tabular text-xs">${this.formatDate(e.enrolledAt)}</td>
                      <td class="font-mono-tabular text-xs text-slate-500">${e.droppedAt ? this.formatDate(e.droppedAt) : '—'}</td>
                      <td>
                        <span class="text-xs font-semibold ${e.status === 'Active' ? 'seat-indicator-available' : 'seat-indicator-full'}">
                          ${this.escapeHtml(e.status)}
                        </span>
                      </td>
                      <td>
                        ${
                          e.status === 'Active'
                            ? `<button type="button" data-download-receipt="${e.enrollmentId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">PDF Receipt</button>`
                            : `<span class="text-xs text-slate-400">Dropped</span>`
                        }
                      </td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // FACULTY MODULE VIEWS
  // =========================================================================

  private renderFacultyDashboardView(): string {
    const user = this.currentUser!;

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Faculty Dashboard — ${this.escapeHtml(user.name)}</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Faculty ID: <span class="font-mono-tabular font-semibold">${this.escapeHtml(user.userId)}</span> · Department: ${this.escapeHtml(user.department)}
            </p>
          </div>
          <button type="button" data-nav-view="faculty-roster" class="ch-btn ch-btn-primary">
            Open Student Roster &amp; Export
          </button>
        </div>

        <!-- 3 Required Faculty Dashboard Cards -->
        <div class="ch-stat-grid">
          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Assigned Courses</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-blue-600 mt-1.5" data-testid="stat-faculty-courses">${this.facultyStats.assignedCourses}</div>
            <div class="text-xs text-slate-500 mt-1">Courses taught by you</div>
          </div>

          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Total Enrolled Students</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-slate-900 mt-1.5" data-testid="stat-faculty-students">${this.facultyStats.totalEnrolledStudents}</div>
            <div class="text-xs text-slate-500 mt-1">Across your assigned courses</div>
          </div>

          <div class="ch-card">
            <div class="text-xs font-semibold text-slate-500">Total Available Seats</div>
            <div class="text-3xl font-extrabold font-mono-tabular text-emerald-600 mt-1.5" data-testid="stat-faculty-seats">${this.facultyStats.totalAvailableSeats}</div>
            <div class="text-xs text-slate-500 mt-1">Of ${this.facultyStats.totalCapacitySeats} total capacity</div>
          </div>
        </div>

        <!-- Assigned Courses Overview Table -->
        <div class="space-y-3">
          <h2 class="text-lg font-bold text-slate-900">Courses Assigned to You</h2>
          <div class="ch-table-wrap">
            <table class="ch-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Semester &amp; Schedule</th>
                  <th>Total Seats</th>
                  <th>Enrolled Students</th>
                  <th>Remaining Seats</th>
                  <th>Utilization</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.facultyAssignedCourses
                  .map(
                    (c) => `
                  <tr>
                    <td class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(c.courseCode)}</td>
                    <td>
                      <div class="font-semibold text-slate-900">${this.escapeHtml(c.title)}</div>
                      <div class="text-xs text-slate-500">${this.escapeHtml(c.room)} · ${c.credits} Credits</div>
                    </td>
                    <td class="text-xs">
                      <div class="font-medium">${this.escapeHtml(c.semester)}</div>
                      <div class="font-mono-tabular text-slate-500">${this.escapeHtml(c.schedule)}</div>
                    </td>
                    <td class="font-mono-tabular">${c.totalSeats}</td>
                    <td class="font-mono-tabular font-semibold text-blue-600">${c.occupiedSeats}</td>
                    <td class="font-mono-tabular font-semibold ${c.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">${c.availableSeats}</td>
                    <td class="font-mono-tabular text-xs">${c.fillPercentage}%</td>
                    <td>
                      <button type="button" data-open-faculty-course="${c.courseId}" class="ch-btn ch-btn-primary text-xs py-1.5 px-3">
                        View Enrolled Students (${c.occupiedSeats})
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderFacultyCoursesView(): string {
    return `
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">My Assigned Courses</h1>
          <p class="text-sm text-slate-600 mt-0.5">
            Detailed syllabus, schedule, and enrollment metrics for courses assigned to your faculty profile.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          ${this.facultyAssignedCourses
            .map(
              (c) => `
            <div class="ch-card flex flex-col justify-between gap-4">
              <div>
                <div class="flex items-center justify-between text-xs mb-1.5">
                  <span class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(c.courseCode)} · ${this.escapeHtml(c.semester)}</span>
                  <span class="font-mono-tabular ${c.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">
                    ${c.occupiedSeats} Enrolled / ${c.availableSeats} Remaining
                  </span>
                </div>
                <h2 class="text-lg font-bold text-slate-900">${this.escapeHtml(c.title)}</h2>
                <p class="text-sm text-slate-600 mt-1">${this.escapeHtml(c.description)}</p>
                <div class="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                  <div><strong>Schedule:</strong> <span class="font-mono-tabular">${this.escapeHtml(c.schedule)}</span></div>
                  <div><strong>Lecture Hall:</strong> ${this.escapeHtml(c.room)} · <strong>Credits:</strong> ${c.credits}</div>
                </div>
              </div>

              <div class="flex items-center gap-2.5 pt-2">
                <button type="button" data-open-faculty-course="${c.courseId}" class="ch-btn ch-btn-primary text-xs flex-1">
                  Open Course Overview &amp; Student List
                </button>
                <button type="button" data-export-faculty-csv="${c.courseId}" class="ch-btn ch-btn-secondary text-xs">
                  Export CSV
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private renderFacultyRosterView(): string {
    const selectedCourse =
      this.facultyAssignedCourses.find(
        (c) => c.courseId === this.selectedFacultyCourseId
      ) || this.facultyAssignedCourses[0];

    const rawStudents: Array<Record<string, any>> = selectedCourse
      ? selectedCourse.students || []
      : [];

    const filteredStudents = rawStudents.filter((s) => {
      if (!this.facultyStudentSearch.trim()) return true;
      const q = this.facultyStudentSearch.trim().toLowerCase();
      return (
        String(s.name).toLowerCase().includes(q) ||
        String(s.studentId).toLowerCase().includes(q) ||
        String(s.email).toLowerCase().includes(q) ||
        String(s.department).toLowerCase().includes(q)
      );
    });

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Course Overview &amp; Enrolled Student Roster</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Search registered students by name or Student ID and export the official class enrollment list.
            </p>
          </div>
          ${
            selectedCourse
              ? `
            <div class="flex items-center gap-2.5">
              <button type="button" data-export-faculty-csv="${selectedCourse.courseId}" class="ch-btn ch-btn-secondary">
                Export Roster CSV
              </button>
              <button type="button" data-export-faculty-pdf="${selectedCourse.courseId}" class="ch-btn ch-btn-primary">
                Export Roster PDF
              </button>
            </div>
          `
              : ''
          }
        </div>

        <div class="ch-card">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div class="md:col-span-5">
              <label for="faculty-course-select" class="block text-xs font-semibold text-slate-700 mb-1">Select Assigned Course</label>
              <select id="faculty-course-select" class="ch-select">
                ${this.facultyAssignedCourses
                  .map(
                    (c) => `
                  <option value="${this.escapeHtml(c.courseId)}" ${selectedCourse && selectedCourse.courseId === c.courseId ? 'selected' : ''}>
                    ${this.escapeHtml(c.courseCode)} — ${this.escapeHtml(c.title)} (${c.occupiedSeats}/${c.totalSeats} seats)
                  </option>
                `
                  )
                  .join('')}
              </select>
            </div>

            <div class="md:col-span-7">
              <label for="faculty-student-search" class="block text-xs font-semibold text-slate-700 mb-1">Search Enrolled Students by Name or Student ID</label>
              <input
                id="faculty-student-search"
                type="search"
                placeholder="Search e.g. Alex Rivera, STU-2001, Computer Science..."
                value="${this.escapeHtml(this.facultyStudentSearch)}"
                class="ch-input"
              />
            </div>
          </div>

          ${
            selectedCourse
              ? `
            <div class="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
              <div>
                <strong>Course:</strong> ${this.escapeHtml(selectedCourse.courseCode)} (${this.escapeHtml(selectedCourse.title)})
                · <strong>Schedule:</strong> <span class="font-mono-tabular">${this.escapeHtml(selectedCourse.schedule)}</span>
                · <strong>Room:</strong> ${this.escapeHtml(selectedCourse.room)}
              </div>
              <div class="font-mono-tabular">
                <strong>Enrolled:</strong> ${selectedCourse.occupiedSeats} · <strong>Remaining Seats:</strong> ${selectedCourse.availableSeats} · <strong>Total Capacity:</strong> ${selectedCourse.totalSeats}
              </div>
            </div>
          `
              : ''
          }
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>University Email</th>
                <th>Department</th>
                <th>Semester</th>
                <th>Enrollment Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredStudents.length === 0
                  ? `<tr><td colspan="7" class="text-center py-8 text-slate-500">No enrolled students match your search query.</td></tr>`
                  : filteredStudents
                      .map(
                        (s) => `
                    <tr>
                      <td class="font-mono-tabular font-bold text-slate-900">${this.escapeHtml(s.studentId)}</td>
                      <td class="font-semibold text-slate-900">${this.escapeHtml(s.name)}</td>
                      <td class="font-mono-tabular text-xs text-slate-600">${this.escapeHtml(s.email)}</td>
                      <td>${this.escapeHtml(s.department)}</td>
                      <td class="text-xs">${this.escapeHtml(s.semester)}</td>
                      <td class="font-mono-tabular text-xs">${this.formatDate(s.enrolledAt)}</td>
                      <td>
                        <button type="button" data-view-student-modal="${this.escapeHtml(s.studentId)}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                          View Student
                        </button>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // ADMINISTRATOR MODULE VIEWS
  // =========================================================================

  private renderAdminDashboardView(): string {
    const cards = this.adminSummaryCards;

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">University Administration &amp; Analytics Dashboard</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Live institutional metrics and Chart.js visualizations computed directly from MongoDB collections.
            </p>
          </div>
          <div class="flex items-center gap-2.5">
            <button type="button" data-nav-view="admin-courses" class="ch-btn ch-btn-primary">
              + Manage Courses
            </button>
            <button type="button" data-nav-view="admin-reports" class="ch-btn ch-btn-secondary">
              Export Reports
            </button>
          </div>
        </div>

        <!-- 6 Required Admin Statistics Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Total Courses</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-slate-900 mt-1" data-testid="admin-stat-courses">${cards.totalCourses}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Active offerings</div>
          </div>

          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Total Students</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-blue-600 mt-1" data-testid="admin-stat-students">${cards.totalStudents}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Registered accounts</div>
          </div>

          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Total Faculty</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-slate-900 mt-1" data-testid="admin-stat-faculty">${cards.totalFaculty}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Assigned instructors</div>
          </div>

          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Active Enrollments</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-blue-600 mt-1" data-testid="admin-stat-enrollments">${cards.totalActiveEnrollments}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">${cards.totalDroppedEnrollments} dropped records</div>
          </div>

          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Available Seats</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-emerald-600 mt-1" data-testid="admin-stat-avail-seats">${cards.availableSeats}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Of ${cards.totalSeatsCapacity} total seats</div>
          </div>

          <div class="ch-card p-4">
            <div class="text-xs font-semibold text-slate-500">Full Courses</div>
            <div class="text-2xl font-extrabold font-mono-tabular text-red-600 mt-1" data-testid="admin-stat-full-courses">${cards.fullyOccupiedCourses}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Zero seats remaining</div>
          </div>
        </div>

        <!-- 5 Required Chart.js Analytics Visualizations -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div class="lg:col-span-8 ch-card">
            <div class="flex items-center justify-between mb-3">
              <div>
                <h2 class="text-base font-bold text-slate-900">1. Course-Wise Enrollment vs Available Seats</h2>
                <p class="text-xs text-slate-500">Occupied and remaining seat counts across all university courses</p>
              </div>
            </div>
            <div class="h-72 relative">
              <canvas id="chart-course-enrollment" aria-label="Course-wise enrollment bar chart"></canvas>
            </div>
          </div>

          <div class="lg:col-span-4 ch-card">
            <div class="mb-3">
              <h2 class="text-base font-bold text-slate-900">2. Seats Filled vs Available</h2>
              <p class="text-xs text-slate-500">University-wide seat capacity utilization</p>
            </div>
            <div class="h-72 relative">
              <canvas id="chart-seats-ratio" aria-label="Seats filled vs available chart"></canvas>
            </div>
          </div>

          <div class="lg:col-span-4 ch-card">
            <div class="mb-3">
              <h2 class="text-base font-bold text-slate-900">3. Department-Wise Enrollment</h2>
              <p class="text-xs text-slate-500">Enrollments and students by academic department</p>
            </div>
            <div class="h-64 relative">
              <canvas id="chart-department-enrollment" aria-label="Department-wise enrollment chart"></canvas>
            </div>
          </div>

          <div class="lg:col-span-4 ch-card">
            <div class="mb-3">
              <h2 class="text-base font-bold text-slate-900">4. Active vs Dropped Enrollments</h2>
              <p class="text-xs text-slate-500">Retention and waitlist distribution</p>
            </div>
            <div class="h-64 relative">
              <canvas id="chart-active-dropped" aria-label="Active vs dropped enrollment chart"></canvas>
            </div>
          </div>

          <div class="lg:col-span-4 ch-card">
            <div class="mb-3">
              <h2 class="text-base font-bold text-slate-900">5. Course Popularity Ranking</h2>
              <p class="text-xs text-slate-500">Seat fill percentage by course offering</p>
            </div>
            <div class="h-64 relative">
              <canvas id="chart-course-popularity" aria-label="Course popularity chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderAdminCoursesView(): string {
    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Course Offerings Management</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Create new courses, edit descriptions and schedules, assign faculty members, and manage seat capacities.
            </p>
          </div>
          <button type="button" data-action="open-add-course-modal" class="ch-btn ch-btn-primary">
            + Add New Course
          </button>
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Course Title &amp; Department</th>
                <th>Assigned Faculty</th>
                <th>Semester &amp; Schedule</th>
                <th>Total Seats</th>
                <th>Occupied</th>
                <th>Available</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.courses
                .map(
                  (c) => `
                <tr>
                  <td class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(c.courseCode)}</td>
                  <td>
                    <div class="font-semibold text-slate-900">${this.escapeHtml(c.title)}</div>
                    <div class="text-xs text-slate-500">${this.escapeHtml(c.department)} · ${c.credits} Credits</div>
                  </td>
                  <td>
                    <select data-assign-faculty-course="${c.courseId}" aria-label="Assign faculty for ${this.escapeHtml(c.courseCode)}" class="ch-select text-xs py-1 px-2 max-w-[200px]">
                      ${this.faculties
                        .map(
                          (f) =>
                            `<option value="${this.escapeHtml(f.userId)}" ${c.facultyId === f.userId ? 'selected' : ''}>${this.escapeHtml(f.name)}</option>`
                        )
                        .join('')}
                    </select>
                  </td>
                  <td class="text-xs">
                    <div class="font-medium text-slate-800">${this.escapeHtml(c.semester)}</div>
                    <div class="font-mono-tabular text-slate-500">${this.escapeHtml(c.schedule)}</div>
                  </td>
                  <td class="font-mono-tabular">${c.totalSeats}</td>
                  <td class="font-mono-tabular text-blue-600 font-semibold">${c.occupiedSeats}</td>
                  <td class="font-mono-tabular font-semibold ${c.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">${c.availableSeats}</td>
                  <td>
                    <span class="text-xs ${c.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">
                      ${c.availableSeats === 0 ? 'Full' : 'Available'}
                    </span>
                  </td>
                  <td>
                    <div class="flex items-center gap-1.5">
                      <button type="button" data-edit-course="${c.courseId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                        Edit
                      </button>
                      <button type="button" data-delete-course="${c.courseId}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderAdminSeatsView(): string {
    const fullCoursesCount = this.courses.filter(
      (c) => c.availableSeats === 0
    ).length;

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Seat Capacity &amp; Utilization Management</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Set maximum course seat limits, track occupied vs available seats, and monitor full courses (${fullCoursesCount} currently full).
            </p>
          </div>
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Course Name</th>
                <th>Faculty</th>
                <th>Occupied Seats</th>
                <th>Available Seats</th>
                <th>Utilization %</th>
                <th>Adjust Total Seat Limit</th>
              </tr>
            </thead>
            <tbody>
              ${this.courses
                .map(
                  (c) => `
                <tr>
                  <td class="font-mono-tabular font-bold text-slate-900">${this.escapeHtml(c.courseCode)}</td>
                  <td>
                    <div class="font-semibold text-slate-900">${this.escapeHtml(c.title)}</div>
                    <div class="text-xs text-slate-500">${this.escapeHtml(c.semester)}</div>
                  </td>
                  <td class="text-sm text-slate-700">${this.escapeHtml(c.facultyName)}</td>
                  <td class="font-mono-tabular font-bold text-blue-600">${c.occupiedSeats}</td>
                  <td class="font-mono-tabular font-bold ${c.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">
                    ${c.availableSeats} ${c.availableSeats === 0 ? '(FULL)' : ''}
                  </td>
                  <td class="w-40">
                    <div class="font-mono-tabular text-xs font-semibold">${c.fillPercentage}%</div>
                    <div class="seat-bar-track">
                      <div class="seat-bar-fill" style="width: ${c.fillPercentage}%; background-color: ${c.availableSeats === 0 ? '#DC2626' : '#2563EB'};"></div>
                    </div>
                  </td>
                  <td>
                    <div class="flex items-center gap-2 max-w-[210px]">
                      <input
                        type="number"
                        min="${Math.max(1, c.occupiedSeats)}"
                        value="${c.totalSeats}"
                        id="seat-input-${c.courseId}"
                        aria-label="Total seats for ${this.escapeHtml(c.courseCode)}"
                        class="ch-input font-mono-tabular text-xs py-1 px-2 w-20"
                      />
                      <button type="button" data-update-seats="${c.courseId}" class="ch-btn ch-btn-primary text-xs py-1 px-2.5">
                        Update Seats
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderAdminStudentsView(): string {
    const filtered = this.adminStudents.filter((s) => {
      if (!this.adminStudentSearch.trim()) return true;
      const q = this.adminStudentSearch.trim().toLowerCase();
      return (
        String(s.name).toLowerCase().includes(q) ||
        String(s.userId).toLowerCase().includes(q) ||
        String(s.email).toLowerCase().includes(q) ||
        String(s.department).toLowerCase().includes(q)
      );
    });

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Student Directory &amp; Account Management</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Search registered students, inspect individual course enrollments, and manage student accounts.
            </p>
          </div>
          <button type="button" data-action="open-add-student-modal" class="ch-btn ch-btn-primary">
            + Register New Student
          </button>
        </div>

        <div class="ch-card">
          <label for="admin-student-search" class="block text-xs font-semibold text-slate-700 mb-1">Search Students by Name, Student ID, Email, or Department</label>
          <input
            id="admin-student-search"
            type="search"
            placeholder="Search e.g. Alex Rivera, STU-2001, Data Science..."
            value="${this.escapeHtml(this.adminStudentSearch)}"
            class="ch-input"
          />
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Semester</th>
                <th>Active Courses</th>
                <th>Credits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered
                .map(
                  (s) => `
                <tr>
                  <td class="font-mono-tabular font-bold text-slate-900">${this.escapeHtml(s.userId)}</td>
                  <td class="font-semibold text-slate-900">${this.escapeHtml(s.name)}</td>
                  <td class="font-mono-tabular text-xs text-slate-600">${this.escapeHtml(s.email)}</td>
                  <td>${this.escapeHtml(s.department)}</td>
                  <td class="text-xs">${this.escapeHtml(s.semester || 'Fall 2026')}</td>
                  <td class="font-mono-tabular font-bold text-blue-600">${s.activeEnrollmentsCount}</td>
                  <td class="font-mono-tabular">${s.totalCredits}</td>
                  <td>
                    <div class="flex items-center gap-1.5">
                      <button type="button" data-view-student-modal="${this.escapeHtml(s.userId)}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                        Enrollments
                      </button>
                      <button type="button" data-delete-student="${this.escapeHtml(s.userId)}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5">
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderAdminFacultyView(): string {
    const filtered = this.adminFaculty.filter((f) => {
      if (!this.adminFacultySearch.trim()) return true;
      const q = this.adminFacultySearch.trim().toLowerCase();
      return (
        String(f.name).toLowerCase().includes(q) ||
        String(f.userId).toLowerCase().includes(q) ||
        String(f.email).toLowerCase().includes(q) ||
        String(f.department).toLowerCase().includes(q)
      );
    });

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Faculty Directory &amp; Course Assignments</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Add faculty members, update academic titles, and review courses assigned to each instructor.
            </p>
          </div>
          <button type="button" data-action="open-add-faculty-modal" class="ch-btn ch-btn-primary">
            + Add Faculty Member
          </button>
        </div>

        <div class="ch-card">
          <label for="admin-faculty-search" class="block text-xs font-semibold text-slate-700 mb-1">Search Faculty by Name, ID, or Department</label>
          <input
            id="admin-faculty-search"
            type="search"
            placeholder="Search e.g. Dr. Elena Rostova, FAC-101, Computer Science..."
            value="${this.escapeHtml(this.adminFacultySearch)}"
            class="ch-input"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          ${filtered
            .map(
              (f) => `
            <div class="ch-card flex flex-col justify-between gap-4">
              <div>
                <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(f.userId)}</span>
                  <span>${this.escapeHtml(f.department)}</span>
                </div>
                <h2 class="text-lg font-bold text-slate-900">${this.escapeHtml(f.name)}</h2>
                <div class="text-xs text-slate-600">${this.escapeHtml(f.title || 'Faculty Member')}</div>
                <div class="text-xs font-mono-tabular text-slate-500 mt-1">${this.escapeHtml(f.email)}</div>

                <div class="mt-4 pt-3 border-t border-slate-100">
                  <div class="text-xs font-semibold text-slate-700 mb-2">
                    Assigned Courses (${f.assignedCoursesCount}) · Total Students: <span class="font-mono-tabular">${f.totalStudentsTaught}</span>
                  </div>
                  <div class="space-y-1.5">
                    ${
                      (f.assignedCourses || []).length === 0
                        ? `<div class="text-xs text-slate-400">No courses currently assigned</div>`
                        : (f.assignedCourses || [])
                            .map(
                              (c: Record<string, any>) => `
                          <div class="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                            <span class="font-mono-tabular font-semibold text-slate-800">${this.escapeHtml(c.courseCode)}</span>
                            <span class="truncate mx-2 text-slate-600 flex-1">${this.escapeHtml(c.title)}</span>
                            <span class="font-mono-tabular text-blue-600">${c.enrolledCount}/${c.totalSeats}</span>
                          </div>
                        `
                            )
                            .join('')
                    }
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button type="button" data-edit-faculty="${this.escapeHtml(f.userId)}" class="ch-btn ch-btn-secondary text-xs w-full">
                  Edit Faculty Details
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private renderAdminEnrollmentsView(): string {
    const filtered = this.adminEnrollments.filter((e) => {
      if (
        this.adminEnrollmentCourseFilter !== 'all' &&
        e.courseId !== this.adminEnrollmentCourseFilter
      ) {
        return false;
      }
      if (
        this.adminEnrollmentStudentFilter !== 'all' &&
        e.studentId !== this.adminEnrollmentStudentFilter
      ) {
        return false;
      }
      if (
        this.adminEnrollmentSemesterFilter !== 'all' &&
        e.semester !== this.adminEnrollmentSemesterFilter
      ) {
        return false;
      }
      if (
        this.adminEnrollmentStatusFilter !== 'all' &&
        e.status.toLowerCase() !==
          this.adminEnrollmentStatusFilter.toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Enrollment Records Management</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Filter all university course registrations by course, student, semester, and Active/Dropped status.
            </p>
          </div>
          <button type="button" data-action="open-admin-enroll-modal" class="ch-btn ch-btn-primary">
            + Enroll Student in Course
          </button>
        </div>

        <div class="ch-card">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label for="admin-enr-course" class="block text-xs font-semibold text-slate-700 mb-1">Filter by Course</label>
              <select id="admin-enr-course" class="ch-select">
                <option value="all">All Courses</option>
                ${this.courses
                  .map(
                    (c) =>
                      `<option value="${this.escapeHtml(c.courseId)}" ${this.adminEnrollmentCourseFilter === c.courseId ? 'selected' : ''}>${this.escapeHtml(c.courseCode)} — ${this.escapeHtml(c.title)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div>
              <label for="admin-enr-student" class="block text-xs font-semibold text-slate-700 mb-1">Filter by Student</label>
              <select id="admin-enr-student" class="ch-select">
                <option value="all">All Students</option>
                ${this.adminStudents
                  .map(
                    (s) =>
                      `<option value="${this.escapeHtml(s.userId)}" ${this.adminEnrollmentStudentFilter === s.userId ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.userId)})</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div>
              <label for="admin-enr-semester" class="block text-xs font-semibold text-slate-700 mb-1">Filter by Semester</label>
              <select id="admin-enr-semester" class="ch-select">
                <option value="all">All Semesters</option>
                ${this.semesters
                  .map(
                    (sem) =>
                      `<option value="${this.escapeHtml(sem)}" ${this.adminEnrollmentSemesterFilter === sem ? 'selected' : ''}>${this.escapeHtml(sem)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div>
              <label for="admin-enr-status" class="block text-xs font-semibold text-slate-700 mb-1">Enrollment Status</label>
              <select id="admin-enr-status" class="ch-select">
                <option value="all" ${this.adminEnrollmentStatusFilter === 'all' ? 'selected' : ''}>All (Active &amp; Dropped)</option>
                <option value="Active" ${this.adminEnrollmentStatusFilter === 'Active' ? 'selected' : ''}>Active Only</option>
                <option value="Dropped" ${this.adminEnrollmentStatusFilter === 'Dropped' ? 'selected' : ''}>Dropped Only</option>
              </select>
            </div>
          </div>
        </div>

        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Enrollment ID</th>
                <th>Student</th>
                <th>Course</th>
                <th>Faculty</th>
                <th>Semester</th>
                <th>Enrolled Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length === 0
                  ? `<tr><td colspan="8" class="text-center py-8 text-slate-500">No enrollment records match the selected filters.</td></tr>`
                  : filtered
                      .map(
                        (e) => `
                    <tr>
                      <td class="font-mono-tabular text-xs font-semibold">${this.escapeHtml(e.enrollmentId)}</td>
                      <td>
                        <div class="font-semibold text-slate-900">${this.escapeHtml(e.studentName)}</div>
                        <div class="font-mono-tabular text-xs text-slate-500">${this.escapeHtml(e.studentId)} · ${this.escapeHtml(e.studentDepartment)}</div>
                      </td>
                      <td>
                        <div class="font-semibold text-slate-900"><span class="font-mono-tabular text-blue-600">${this.escapeHtml(e.courseCode)}</span> — ${this.escapeHtml(e.courseTitle)}</div>
                      </td>
                      <td class="text-xs text-slate-700">${this.escapeHtml(e.facultyName)}</td>
                      <td class="text-xs">${this.escapeHtml(e.semester)}</td>
                      <td class="font-mono-tabular text-xs">${this.formatDate(e.enrolledAt)}</td>
                      <td>
                        <span class="text-xs font-semibold ${e.status === 'Active' ? 'seat-indicator-available' : 'seat-indicator-full'}">
                          ${this.escapeHtml(e.status)}
                        </span>
                      </td>
                      <td>
                        <div class="flex items-center gap-1.5">
                          <button type="button" data-download-receipt="${e.enrollmentId}" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">
                            PDF
                          </button>
                          ${
                            e.status === 'Active'
                              ? `<button type="button" data-drop-enrollment="${e.enrollmentId}" class="ch-btn ch-btn-danger text-xs py-1 px-2.5">Drop</button>`
                              : ''
                          }
                        </div>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderAdminReportsView(): string {
    const generatedTimestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const activeEnrollments = this.adminEnrollments.filter(
      (e) => e.status === 'Active'
    );
    const droppedEnrollments = this.adminEnrollments.filter(
      (e) => e.status === 'Dropped'
    );

    let reportTableHtml = '';
    if (this.activeReportTab === 'courses') {
      reportTableHtml = `
        <table class="ch-table">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Course Name</th>
              <th>Department</th>
              <th>Faculty</th>
              <th>Semester</th>
              <th>Total Seats</th>
              <th>Enrolled Students</th>
              <th>Available Seats</th>
            </tr>
          </thead>
          <tbody>
            ${this.adminCoursesReport
              .map(
                (r) => `
              <tr>
                <td class="font-mono-tabular font-bold">${this.escapeHtml(r.courseCode)}</td>
                <td class="font-semibold">${this.escapeHtml(r.title)}</td>
                <td>${this.escapeHtml(r.department)}</td>
                <td>${this.escapeHtml(r.facultyName)}</td>
                <td>${this.escapeHtml(r.semester)}</td>
                <td class="font-mono-tabular">${r.totalSeats}</td>
                <td class="font-mono-tabular font-bold text-blue-600">${r.occupiedSeats}</td>
                <td class="font-mono-tabular font-bold ${r.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">${r.availableSeats}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else if (this.activeReportTab === 'students') {
      reportTableHtml = `
        <table class="ch-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Active Courses</th>
              <th>Dropped</th>
              <th>Total Credits</th>
              <th>Enrolled Course Codes</th>
            </tr>
          </thead>
          <tbody>
            ${this.adminStudentsReport
              .map(
                (s) => `
              <tr>
                <td class="font-mono-tabular font-bold">${this.escapeHtml(s.userId)}</td>
                <td class="font-semibold">${this.escapeHtml(s.name)}</td>
                <td class="font-mono-tabular text-xs">${this.escapeHtml(s.email)}</td>
                <td>${this.escapeHtml(s.department)}</td>
                <td class="font-mono-tabular font-bold text-blue-600">${s.activeCoursesCount}</td>
                <td class="font-mono-tabular">${s.droppedCoursesCount}</td>
                <td class="font-mono-tabular">${s.totalCredits}</td>
                <td class="font-mono-tabular text-xs">${this.escapeHtml(s.activeCourseCodes)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else if (this.activeReportTab === 'seats') {
      reportTableHtml = `
        <table class="ch-table">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Course Title</th>
              <th>Total Seat Capacity</th>
              <th>Seats Used (Occupied)</th>
              <th>Seats Available</th>
              <th>Utilization %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${this.adminCoursesReport
              .map(
                (r) => `
              <tr>
                <td class="font-mono-tabular font-bold">${this.escapeHtml(r.courseCode)}</td>
                <td class="font-semibold">${this.escapeHtml(r.title)}</td>
                <td class="font-mono-tabular">${r.totalSeats}</td>
                <td class="font-mono-tabular font-bold text-blue-600">${r.occupiedSeats}</td>
                <td class="font-mono-tabular font-bold ${r.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">${r.availableSeats}</td>
                <td class="font-mono-tabular">${r.utilizationPercent}%</td>
                <td class="text-xs font-semibold ${r.availableSeats === 0 ? 'seat-indicator-full' : 'seat-indicator-available'}">${this.escapeHtml(r.status)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else if (this.activeReportTab === 'active') {
      reportTableHtml = `
        <table class="ch-table">
          <thead>
            <tr>
              <th>Enrollment ID</th>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Course Code</th>
              <th>Course Name</th>
              <th>Faculty</th>
              <th>Semester</th>
              <th>Enrollment Date</th>
            </tr>
          </thead>
          <tbody>
            ${activeEnrollments
              .map(
                (e) => `
              <tr>
                <td class="font-mono-tabular text-xs font-bold">${this.escapeHtml(e.enrollmentId)}</td>
                <td class="font-mono-tabular">${this.escapeHtml(e.studentId)}</td>
                <td class="font-semibold">${this.escapeHtml(e.studentName)}</td>
                <td class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(e.courseCode)}</td>
                <td>${this.escapeHtml(e.courseTitle)}</td>
                <td>${this.escapeHtml(e.facultyName)}</td>
                <td>${this.escapeHtml(e.semester)}</td>
                <td class="font-mono-tabular text-xs">${this.formatDate(e.enrolledAt)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else {
      reportTableHtml = `
        <table class="ch-table">
          <thead>
            <tr>
              <th>Enrollment ID</th>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Course Code</th>
              <th>Course Name</th>
              <th>Enrolled Date</th>
              <th>Dropped Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${droppedEnrollments
              .map(
                (e) => `
              <tr>
                <td class="font-mono-tabular text-xs font-bold">${this.escapeHtml(e.enrollmentId)}</td>
                <td class="font-mono-tabular">${this.escapeHtml(e.studentId)}</td>
                <td class="font-semibold">${this.escapeHtml(e.studentName)}</td>
                <td class="font-mono-tabular font-bold">${this.escapeHtml(e.courseCode)}</td>
                <td>${this.escapeHtml(e.courseTitle)}</td>
                <td class="font-mono-tabular text-xs">${this.formatDate(e.enrolledAt)}</td>
                <td class="font-mono-tabular text-xs">${this.formatDate(e.droppedAt)}</td>
                <td class="seat-indicator-full text-xs">Dropped</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    return `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Institutional Enrollment Reports &amp; Exports</h1>
            <p class="text-sm text-slate-600 mt-0.5">
              Report Generation Date: <span class="font-mono-tabular font-semibold text-slate-800">${generatedTimestamp}</span>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <button type="button" data-action="save-report-snapshot" class="ch-btn ch-btn-secondary">
              Archive Snapshot to MongoDB
            </button>
            <button type="button" data-action="export-active-report-csv" class="ch-btn ch-btn-secondary">
              Export CSV Report
            </button>
            <button type="button" data-action="export-active-report-pdf" class="ch-btn ch-btn-primary">
              Export PDF Report
            </button>
          </div>
        </div>

        <!-- 5 Report Selector Tabs -->
        <div class="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/80 rounded-lg">
          <button type="button" data-report-tab="courses" class="ch-btn text-xs py-1.5 px-3 ${this.activeReportTab === 'courses' ? 'bg-white text-slate-900 shadow-xs' : 'bg-transparent text-slate-600'}">
            1. Course-Wise Student Count
          </button>
          <button type="button" data-report-tab="students" class="ch-btn text-xs py-1.5 px-3 ${this.activeReportTab === 'students' ? 'bg-white text-slate-900 shadow-xs' : 'bg-transparent text-slate-600'}">
            2. Student-Wise Enrollment List
          </button>
          <button type="button" data-report-tab="seats" class="ch-btn text-xs py-1.5 px-3 ${this.activeReportTab === 'seats' ? 'bg-white text-slate-900 shadow-xs' : 'bg-transparent text-slate-600'}">
            3. Seats Used vs Available
          </button>
          <button type="button" data-report-tab="active" class="ch-btn text-xs py-1.5 px-3 ${this.activeReportTab === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'bg-transparent text-slate-600'}">
            4. Active Enrollment Report (${activeEnrollments.length})
          </button>
          <button type="button" data-report-tab="dropped" class="ch-btn text-xs py-1.5 px-3 ${this.activeReportTab === 'dropped' ? 'bg-white text-slate-900 shadow-xs' : 'bg-transparent text-slate-600'}">
            5. Dropped Enrollment Report (${droppedEnrollments.length})
          </button>
        </div>

        <div class="ch-table-wrap">
          ${reportTableHtml}
        </div>

        <!-- Archived Reports Collection (COLLECTION 4: REPORTS) -->
        <div class="space-y-3 pt-4">
          <h2 class="text-lg font-bold text-slate-900">Archived Snapshots in MongoDB REPORTS Collection</h2>
          <div class="ch-table-wrap">
            <table class="ch-table">
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Report Title</th>
                  <th>Total Courses</th>
                  <th>Total Students</th>
                  <th>Total Active Enrollments</th>
                  <th>Generated By</th>
                  <th>Generated At</th>
                </tr>
              </thead>
              <tbody>
                ${this.adminSavedReports
                  .map(
                    (rep) => `
                  <tr>
                    <td class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(rep.reportId)}</td>
                    <td class="font-semibold text-slate-900">${this.escapeHtml(rep.title || rep.reportType)}</td>
                    <td class="font-mono-tabular">${rep.totalCourses}</td>
                    <td class="font-mono-tabular">${rep.totalStudents}</td>
                    <td class="font-mono-tabular font-bold text-emerald-600">${rep.totalEnrollments}</td>
                    <td class="text-xs text-slate-600">${this.escapeHtml(rep.generatedBy || 'Administrator')}</td>
                    <td class="font-mono-tabular text-xs">${this.formatDate(rep.generatedAt)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderAdminSettingsView(): string {
    const regDateVal = this.settings.registrationDeadline
      ? String(this.settings.registrationDeadline).slice(0, 10)
      : '2027-05-15';
    const dropDateVal = this.settings.dropDeadline
      ? String(this.settings.dropDeadline).slice(0, 10)
      : '2027-04-30';

    return `
      <div class="space-y-8">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Registration Deadlines &amp; University Deliverables</h1>
          <p class="text-sm text-slate-600 mt-0.5">
            Configure academic registration &amp; drop deadlines, timetable clash enforcement, and review project evaluation deliverables.
          </p>
        </div>

        <!-- Settings Form -->
        <div class="ch-card">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-200">
            <div>
              <h2 class="text-lg font-bold text-slate-900">Academic Registration &amp; Drop Deadlines</h2>
              <p class="text-xs text-slate-500">Enforced automatically on all student enrollment and course drop requests.</p>
            </div>
            <button type="button" data-action="reset-demo-db" class="ch-btn ch-btn-danger text-xs">
              Reset Database to Initial Seed Data
            </button>
          </div>

          <form id="ch-settings-form" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="set-semester" class="block text-xs font-semibold text-slate-700 mb-1">Active Term / Semester</label>
              <input id="set-semester" name="currentSemester" type="text" value="${this.escapeHtml(this.settings.currentSemester || 'Fall 2026')}" class="ch-input" />
            </div>

            <div>
              <label for="set-reg-deadline" class="block text-xs font-semibold text-slate-700 mb-1">Registration Deadline</label>
              <input id="set-reg-deadline" name="registrationDeadline" type="date" value="${regDateVal}" class="ch-input font-mono-tabular" />
            </div>

            <div>
              <label for="set-drop-deadline" class="block text-xs font-semibold text-slate-700 mb-1">Course Drop Deadline</label>
              <input id="set-drop-deadline" name="dropDeadline" type="date" value="${dropDateVal}" class="ch-input font-mono-tabular" />
            </div>

            <div>
              <label for="set-max-courses" class="block text-xs font-semibold text-slate-700 mb-1">Max Courses Per Student</label>
              <input id="set-max-courses" name="maxCoursesPerSemester" type="number" min="1" max="12" value="${this.settings.maxCoursesPerSemester || 6}" class="ch-input font-mono-tabular" />
            </div>

            <div class="flex items-center gap-2.5 pt-5">
              <input id="set-clash" name="enforceScheduleClash" type="checkbox" ${this.settings.enforceScheduleClash !== false ? 'checked' : ''} class="w-4 h-4" />
              <label for="set-clash" class="text-xs font-semibold text-slate-800">Enforce Timetable Clash Detection</label>
            </div>

            <div class="flex items-center justify-end pt-4">
              <button type="submit" class="ch-btn ch-btn-primary">
                Save University Settings
              </button>
            </div>
          </form>
        </div>

        <!-- Project Deliverables: ZIP Instructions, PPT Outline, & Demo Script -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-5 ch-card space-y-4">
            <h2 class="text-lg font-bold text-slate-900">Source Code ZIP Packaging Guide</h2>
            <div class="space-y-2 text-xs text-slate-700 font-mono-tabular bg-slate-50 p-4 rounded-lg border border-slate-200">
              ${PROJECT_DELIVERABLES_DATA.zipInstructions
                .map((line) => `<div>${this.escapeHtml(line)}</div>`)
                .join('')}
            </div>

            <h3 class="text-base font-bold text-slate-900 pt-2">Demo Video Recording Script</h3>
            <div class="space-y-3">
              ${PROJECT_DELIVERABLES_DATA.demoVideoScript
                .map(
                  (seg) => `
                <div class="p-3 rounded-lg border border-slate-200 bg-white">
                  <div class="text-xs font-bold text-blue-600 mb-1">${this.escapeHtml(seg.segment)}</div>
                  <p class="text-xs text-slate-600 leading-relaxed">${this.escapeHtml(seg.script)}</p>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="lg:col-span-7 ch-card space-y-4">
            <h2 class="text-lg font-bold text-slate-900">PowerPoint Presentation Outline (7 Slides)</h2>
            <div class="space-y-3">
              ${PROJECT_DELIVERABLES_DATA.pptOutline
                .map(
                  (s) => `
                <div class="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div class="text-xs font-bold text-blue-600">${this.escapeHtml(s.slide)} — ${this.escapeHtml(s.title)}</div>
                  <ul class="mt-1.5 space-y-1 text-xs text-slate-700 list-disc pl-5">
                    ${s.bullets.map((b) => `<li>${this.escapeHtml(b)}</li>`).join('')}
                  </ul>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderProfileView(): string {
    const u = this.currentUser!;
    return `
      <div class="max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Account Profile &amp; Security</h1>
          <p class="text-sm text-slate-600 mt-0.5">
            Update your personal details, department affiliation, or password.
          </p>
        </div>

        <div class="ch-card p-7">
          <form id="ch-profile-form" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">University ID</label>
                <input type="text" disabled value="${this.escapeHtml(u.userId)}" class="ch-input bg-slate-100 font-mono-tabular" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">System Role</label>
                <input type="text" disabled value="${this.escapeHtml(u.role.toUpperCase())}" class="ch-input bg-slate-100 font-mono-tabular" />
              </div>
            </div>

            <div>
              <label for="prof-name" class="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input id="prof-name" name="name" type="text" required value="${this.escapeHtml(u.name)}" class="ch-input" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="prof-dept" class="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input id="prof-dept" name="department" type="text" required value="${this.escapeHtml(u.department)}" class="ch-input" />
              </div>
              <div>
                <label for="prof-phone" class="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input id="prof-phone" name="phone" type="text" value="${this.escapeHtml(u.phone || '')}" class="ch-input" />
              </div>
            </div>

            <div>
              <label for="prof-password" class="block text-xs font-semibold text-slate-700 mb-1">New Password (leave blank to keep current)</label>
              <input id="prof-password" name="newPassword" type="password" minlength="6" placeholder="Optional new password" class="ch-input" />
            </div>

            <button type="submit" class="ch-btn ch-btn-primary">
              Save Profile Changes
            </button>
          </form>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // EVENT BINDINGS & MODAL HANDLERS
  // =========================================================================

  private bindLandingEvents(): void {
    this.rootEl.querySelectorAll('[data-action="go-login"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate('login');
      });
    });

    this.rootEl
      .querySelectorAll('[data-action="go-register"]')
      .forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigate('register');
        });
      });

    this.bindDemoLoginButtons();
  }

  private bindLoginEvents(): void {
    this.bindLandingEvents();

    this.rootEl.querySelectorAll('[data-action="go-landing"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate('landing');
      });
    });

    const form = document.getElementById(
      'ch-login-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      const role = String(formData.get('role') || 'all');
      await this.signInWithCredentials(email, password, role);
    });
  }

  private bindRegisterEvents(): void {
    this.bindLandingEvents();

    this.rootEl.querySelectorAll('[data-action="go-landing"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate('landing');
      });
    });

    const form = document.getElementById(
      'ch-register-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        department: String(formData.get('department') || 'Computer Science'),
        semester: String(formData.get('semester') || 'Fall 2026'),
        password: String(formData.get('password') || ''),
        phone: String(formData.get('phone') || '').trim(),
      };

      try {
        const res = await this.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        this.token = res.token;
        this.currentUser = res.user;
        localStorage.setItem(STORAGE_TOKEN_KEY, res.token);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(res.user));
        this.currentView = 'student-dashboard';
        await this.refreshRoleData();
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Registration failed.',
          'error'
        );
      }
    });
  }

  private bindDemoLoginButtons(): void {
    this.rootEl.querySelectorAll('[data-demo-login]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const raw = (btn as HTMLElement).dataset.demoLogin || '';
        const [email, password, role] = raw.split('|');
        if (email && password) {
          await this.signInWithCredentials(email, password, role);
        }
      });
    });
  }

  private bindWorkspaceEvents(): void {
    this.bindDemoLoginButtons();

    // Sidebar navigation
    this.rootEl.querySelectorAll('[data-nav-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = (btn as HTMLElement).dataset.navView;
        if (target) this.navigate(target);
      });
    });

    // Sign out
    this.rootEl
      .querySelector('[data-action="sign-out"]')
      ?.addEventListener('click', () => this.signOut());

    // Sync Data
    this.rootEl
      .querySelector('[data-action="refresh-data"]')
      ?.addEventListener('click', async () => {
        await this.refreshRoleData();
        this.render();
        this.showToast('Synchronized live data from MongoDB.', 'info');
      });

    // Student Catalog Search & Filters
    const searchInput = document.getElementById(
      'catalog-search-input'
    ) as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      this.catalogSearch = searchInput.value;
      const pos = searchInput.selectionStart || 0;
      this.render();
      const nextInput = document.getElementById(
        'catalog-search-input'
      ) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    });

    document
      .getElementById('catalog-semester-filter')
      ?.addEventListener('change', (e) => {
        this.catalogSemester = (e.target as HTMLSelectElement).value;
        this.render();
      });

    document
      .getElementById('catalog-faculty-filter')
      ?.addEventListener('change', (e) => {
        this.catalogFaculty = (e.target as HTMLSelectElement).value;
        this.render();
      });

    document
      .getElementById('catalog-status-filter')
      ?.addEventListener('change', (e) => {
        this.catalogStatus = (e.target as HTMLSelectElement).value;
        this.render();
      });

    // Enroll in Course Buttons
    this.rootEl.querySelectorAll('[data-enroll-course]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const courseId = (btn as HTMLElement).dataset.enrollCourse;
        if (!courseId) return;
        try {
          const res = await this.apiRequest('/api/enrollments', {
            method: 'POST',
            body: JSON.stringify({ courseId }),
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(
            res.message ||
              'Congratulations! You have successfully enrolled in this course.',
            'success'
          );
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Enrollment failed.',
            'error'
          );
        }
      });
    });

    // Drop Course Buttons (with confirmation modal)
    this.rootEl.querySelectorAll('[data-drop-enrollment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const enrollmentId = (btn as HTMLElement).dataset.dropEnrollment;
        if (enrollmentId) this.openDropConfirmationModal(enrollmentId);
      });
    });

    // Join Waitlist Buttons
    this.rootEl.querySelectorAll('[data-join-waitlist]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const courseId = (btn as HTMLElement).dataset.joinWaitlist;
        if (!courseId) return;
        try {
          const res = await this.apiRequest('/api/waitlist', {
            method: 'POST',
            body: JSON.stringify({ courseId }),
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Could not join waitlist.',
            'error'
          );
        }
      });
    });

    // Leave Waitlist Buttons
    this.rootEl.querySelectorAll('[data-leave-waitlist]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const waitlistId = (btn as HTMLElement).dataset.leaveWaitlist;
        if (!waitlistId) return;
        try {
          const res = await this.apiRequest(`/api/waitlist/${waitlistId}`, {
            method: 'DELETE',
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Failed to leave waitlist.',
            'error'
          );
        }
      });
    });

    // View Course Details Modal
    this.rootEl.querySelectorAll('[data-view-course]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const courseId = (btn as HTMLElement).dataset.viewCourse;
        if (courseId) this.openCourseDetailsModal(courseId);
      });
    });

    // Download Single Enrollment Receipt PDF
    this.rootEl.querySelectorAll('[data-download-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const enrollmentId = (btn as HTMLElement).dataset.downloadReceipt;
        const sourceList =
          this.currentUser?.role === 'admin'
            ? this.adminEnrollments
            : this.studentEnrollments;
        const match = sourceList.find((e) => e.enrollmentId === enrollmentId);
        if (match) {
          downloadEnrollmentReceiptPdf({
            enrollmentId: match.enrollmentId,
            studentName: match.studentName,
            studentId: match.studentId,
            studentEmail: match.studentEmail,
            studentDepartment: match.studentDepartment,
            courseCode: match.courseCode,
            courseTitle: match.courseTitle,
            facultyName: match.facultyName,
            semester: match.semester,
            schedule: match.schedule,
            room: match.room,
            credits: match.credits,
            enrolledAt: match.enrolledAt,
            universityName: this.settings.universityName,
          });
          this.showToast(
            `Downloaded PDF confirmation receipt for ${match.courseCode}.`,
            'success'
          );
        }
      });
    });

    // Download Full Schedule PDF
    this.rootEl
      .querySelectorAll('[data-action="download-full-schedule-pdf"]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!this.currentUser) return;
          const active = this.studentEnrollments.filter(
            (e) => e.status === 'Active'
          );
          downloadFullSchedulePdf(this.currentUser, active);
          this.showToast(
            'Downloaded complete semester schedule PDF.',
            'success'
          );
        });
      });

    // Faculty Course Selection & Search
    this.rootEl
      .querySelectorAll('[data-open-faculty-course]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = (btn as HTMLElement).dataset.openFacultyCourse;
          if (cid) {
            this.selectedFacultyCourseId = cid;
            this.navigate('faculty-roster');
          }
        });
      });

    document
      .getElementById('faculty-course-select')
      ?.addEventListener('change', (e) => {
        this.selectedFacultyCourseId = (e.target as HTMLSelectElement).value;
        this.render();
      });

    const facSearch = document.getElementById(
      'faculty-student-search'
    ) as HTMLInputElement | null;
    facSearch?.addEventListener('input', () => {
      this.facultyStudentSearch = facSearch.value;
      const pos = facSearch.selectionStart || 0;
      this.render();
      const next = document.getElementById(
        'faculty-student-search'
      ) as HTMLInputElement | null;
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });

    // Faculty Roster CSV & PDF Export
    this.rootEl.querySelectorAll('[data-export-faculty-csv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.exportFacultyCsv;
        const course = this.facultyAssignedCourses.find(
          (c) => c.courseId === cid
        );
        if (!course) return;
        const students: Array<Record<string, any>> = course.students || [];
        downloadCsvFile(
          `CourseHub_Roster_${course.courseCode}.csv`,
          [
            'Enrollment ID',
            'Student ID',
            'Student Name',
            'Email',
            'Department',
            'Semester',
            'Enrolled At',
          ],
          students.map((s) => [
            s.enrollmentId,
            s.studentId,
            s.name,
            s.email,
            s.department,
            s.semester,
            this.formatDate(s.enrolledAt),
          ])
        );
        this.showToast(
          `Exported ${course.courseCode} student roster to CSV.`,
          'success'
        );
      });
    });

    this.rootEl.querySelectorAll('[data-export-faculty-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.exportFacultyPdf;
        const course = this.facultyAssignedCourses.find(
          (c) => c.courseId === cid
        );
        if (!course) return;
        const students: Array<Record<string, any>> = course.students || [];
        downloadTabularReportPdf({
          title: `${course.courseCode} — ${course.title} Student Roster`,
          subtitle: `Instructor: ${this.currentUser?.name} | Semester: ${course.semester} | Enrolled: ${students.length}/${course.totalSeats}`,
          headers: [
            'Student ID',
            'Student Name',
            'Email',
            'Department',
            'Semester',
            'Enrolled Date',
          ],
          rows: students.map((s) => [
            String(s.studentId),
            String(s.name),
            String(s.email),
            String(s.department),
            String(s.semester),
            this.formatDate(s.enrolledAt),
          ]),
          filename: `CourseHub_Roster_${course.courseCode}.pdf`,
        });
        this.showToast(
          `Exported ${course.courseCode} student roster to PDF.`,
          'success'
        );
      });
    });

    // View Student Details Modal (Faculty & Admin)
    this.rootEl.querySelectorAll('[data-view-student-modal]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const studentId = (btn as HTMLElement).dataset.viewStudentModal;
        if (studentId) await this.openStudentDetailsModal(studentId);
      });
    });

    // Admin Course CRUD & Inline Faculty Assignment
    this.rootEl
      .querySelector('[data-action="open-add-course-modal"]')
      ?.addEventListener('click', () => this.openCourseFormModal());

    this.rootEl.querySelectorAll('[data-edit-course]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.editCourse;
        const course = this.courses.find((c) => c.courseId === cid);
        if (course) this.openCourseFormModal(course);
      });
    });

    this.rootEl.querySelectorAll('[data-delete-course]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.deleteCourse;
        const course = this.courses.find((c) => c.courseId === cid);
        if (course) this.openDeleteCourseModal(course);
      });
    });

    this.rootEl
      .querySelectorAll('[data-assign-faculty-course]')
      .forEach((sel) => {
        sel.addEventListener('change', async (e) => {
          const courseId = (sel as HTMLElement).dataset.assignFacultyCourse;
          const facultyId = (e.target as HTMLSelectElement).value;
          if (!courseId || !facultyId) return;
          try {
            const res = await this.apiRequest(
              `/api/courses/${courseId}/assign`,
              {
                method: 'PUT',
                body: JSON.stringify({ facultyId }),
              }
            );
            await this.refreshRoleData();
            this.render();
            this.showToast(res.message, 'success');
          } catch (err) {
            this.showToast(
              err instanceof Error
                ? err.message
                : 'Failed to assign faculty.',
              'error'
            );
          }
        });
      });

    // Admin Seat Capacity Updates
    this.rootEl.querySelectorAll('[data-update-seats]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const courseId = (btn as HTMLElement).dataset.updateSeats;
        const input = document.getElementById(
          `seat-input-${courseId}`
        ) as HTMLInputElement | null;
        if (!courseId || !input) return;
        try {
          const res = await this.apiRequest(`/api/courses/${courseId}/seats`, {
            method: 'PUT',
            body: JSON.stringify({ totalSeats: Number(input.value) }),
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'success');
        } catch (err) {
          this.showToast(
            err instanceof Error
              ? err.message
              : 'Failed to update seat capacity.',
            'error'
          );
        }
      });
    });

    // Admin Student Search & Actions
    const adminStuSearch = document.getElementById(
      'admin-student-search'
    ) as HTMLInputElement | null;
    adminStuSearch?.addEventListener('input', () => {
      this.adminStudentSearch = adminStuSearch.value;
      const pos = adminStuSearch.selectionStart || 0;
      this.render();
      const next = document.getElementById(
        'admin-student-search'
      ) as HTMLInputElement | null;
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });

    this.rootEl
      .querySelector('[data-action="open-add-student-modal"]')
      ?.addEventListener('click', () => this.openAddStudentModal());

    this.rootEl.querySelectorAll('[data-delete-student]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sid = (btn as HTMLElement).dataset.deleteStudent;
        if (!sid) return;
        try {
          const res = await this.apiRequest(`/api/users/students/${sid}`, {
            method: 'DELETE',
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Failed to remove student.',
            'error'
          );
        }
      });
    });

    // Admin Faculty Search & Actions
    const adminFacSearch = document.getElementById(
      'admin-faculty-search'
    ) as HTMLInputElement | null;
    adminFacSearch?.addEventListener('input', () => {
      this.adminFacultySearch = adminFacSearch.value;
      const pos = adminFacSearch.selectionStart || 0;
      this.render();
      const next = document.getElementById(
        'admin-faculty-search'
      ) as HTMLInputElement | null;
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });

    this.rootEl
      .querySelector('[data-action="open-add-faculty-modal"]')
      ?.addEventListener('click', () => this.openFacultyFormModal());

    this.rootEl.querySelectorAll('[data-edit-faculty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fid = (btn as HTMLElement).dataset.editFaculty;
        const fac = this.adminFaculty.find((f) => f.userId === fid);
        if (fac) this.openFacultyFormModal(fac);
      });
    });

    // Admin Enrollment Filters & Manual Enroll Modal
    document
      .getElementById('admin-enr-course')
      ?.addEventListener('change', (e) => {
        this.adminEnrollmentCourseFilter = (
          e.target as HTMLSelectElement
        ).value;
        this.render();
      });

    document
      .getElementById('admin-enr-student')
      ?.addEventListener('change', (e) => {
        this.adminEnrollmentStudentFilter = (
          e.target as HTMLSelectElement
        ).value;
        this.render();
      });

    document
      .getElementById('admin-enr-semester')
      ?.addEventListener('change', (e) => {
        this.adminEnrollmentSemesterFilter = (
          e.target as HTMLSelectElement
        ).value;
        this.render();
      });

    document
      .getElementById('admin-enr-status')
      ?.addEventListener('change', (e) => {
        this.adminEnrollmentStatusFilter = (
          e.target as HTMLSelectElement
        ).value;
        this.render();
      });

    this.rootEl
      .querySelector('[data-action="open-admin-enroll-modal"]')
      ?.addEventListener('click', () => this.openAdminEnrollModal());

    // Admin Reports Tabs & Exports
    this.rootEl.querySelectorAll('[data-report-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.reportTab as
          | 'courses'
          | 'students'
          | 'seats'
          | 'active'
          | 'dropped';
        if (tab) {
          this.activeReportTab = tab;
          this.render();
        }
      });
    });

    this.rootEl
      .querySelector('[data-action="save-report-snapshot"]')
      ?.addEventListener('click', async () => {
        try {
          const res = await this.apiRequest('/api/reports/generate', {
            method: 'POST',
            body: JSON.stringify({
              reportType: `Admin ${this.activeReportTab.toUpperCase()} Report`,
            }),
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'success');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Failed to save snapshot.',
            'error'
          );
        }
      });

    this.rootEl
      .querySelector('[data-action="export-active-report-csv"]')
      ?.addEventListener('click', () => this.exportCurrentAdminReport('csv'));

    this.rootEl
      .querySelector('[data-action="export-active-report-pdf"]')
      ?.addEventListener('click', () => this.exportCurrentAdminReport('pdf'));

    // Admin Settings & Demo Reset
    const settingsForm = document.getElementById(
      'ch-settings-form'
    ) as HTMLFormElement | null;
    settingsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(settingsForm);
      const payload = {
        currentSemester: String(fd.get('currentSemester') || 'Fall 2026'),
        registrationDeadline: new Date(
          String(fd.get('registrationDeadline') || '2027-05-15')
        ).toISOString(),
        dropDeadline: new Date(
          String(fd.get('dropDeadline') || '2027-04-30')
        ).toISOString(),
        maxCoursesPerSemester: Number(fd.get('maxCoursesPerSemester') || 6),
        enforceScheduleClash:
          (document.getElementById('set-clash') as HTMLInputElement | null)
            ?.checked ?? true,
      };
      try {
        const res = await this.apiRequest('/api/settings', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        this.settings = res.settings || this.settings;
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Failed to save settings.',
          'error'
        );
      }
    });

    this.rootEl
      .querySelector('[data-action="reset-demo-db"]')
      ?.addEventListener('click', async () => {
        try {
          const res = await this.apiRequest('/api/settings/reset-demo', {
            method: 'POST',
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Reset failed.',
            'error'
          );
        }
      });

    // Shared Profile Form
    const profileForm = document.getElementById(
      'ch-profile-form'
    ) as HTMLFormElement | null;
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(profileForm);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        department: String(fd.get('department') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        newPassword: String(fd.get('newPassword') || '').trim(),
      };
      try {
        const res = await this.apiRequest('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        this.currentUser = res.user;
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(res.user));
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Failed to update profile.',
          'error'
        );
      }
    });
  }

  private exportCurrentAdminReport(format: 'csv' | 'pdf'): void {
    const activeEnrollments = this.adminEnrollments.filter(
      (e) => e.status === 'Active'
    );
    const droppedEnrollments = this.adminEnrollments.filter(
      (e) => e.status === 'Dropped'
    );

    let title = '';
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = '';

    if (this.activeReportTab === 'courses') {
      title = 'Course-Wise Student Enrollment Count Report';
      filename = 'CourseHub_Course_Wise_Report';
      headers = [
        'Course Code',
        'Course Name',
        'Department',
        'Faculty',
        'Semester',
        'Total Seats',
        'Occupied Seats',
        'Available Seats',
      ];
      rows = this.adminCoursesReport.map((r) => [
        String(r.courseCode),
        String(r.title),
        String(r.department),
        String(r.facultyName),
        String(r.semester),
        String(r.totalSeats),
        String(r.occupiedSeats),
        String(r.availableSeats),
      ]);
    } else if (this.activeReportTab === 'students') {
      title = 'Student-Wise Enrollment List Report';
      filename = 'CourseHub_Student_Wise_Report';
      headers = [
        'Student ID',
        'Name',
        'Email',
        'Department',
        'Active Courses',
        'Dropped Courses',
        'Credits',
        'Course Codes',
      ];
      rows = this.adminStudentsReport.map((s) => [
        String(s.userId),
        String(s.name),
        String(s.email),
        String(s.department),
        String(s.activeCoursesCount),
        String(s.droppedCoursesCount),
        String(s.totalCredits),
        String(s.activeCourseCodes),
      ]);
    } else if (this.activeReportTab === 'seats') {
      title = 'Total Seats Used vs Available Capacity Report';
      filename = 'CourseHub_Seat_Utilization_Report';
      headers = [
        'Course Code',
        'Course Title',
        'Total Capacity',
        'Seats Used',
        'Seats Available',
        'Utilization %',
        'Status',
      ];
      rows = this.adminCoursesReport.map((r) => [
        String(r.courseCode),
        String(r.title),
        String(r.totalSeats),
        String(r.occupiedSeats),
        String(r.availableSeats),
        `${r.utilizationPercent}%`,
        String(r.status),
      ]);
    } else if (this.activeReportTab === 'active') {
      title = 'Active Course Enrollments Report';
      filename = 'CourseHub_Active_Enrollments_Report';
      headers = [
        'Enrollment ID',
        'Student ID',
        'Student Name',
        'Course Code',
        'Course Title',
        'Faculty',
        'Semester',
        'Enrolled Date',
      ];
      rows = activeEnrollments.map((e) => [
        e.enrollmentId,
        e.studentId,
        e.studentName,
        e.courseCode,
        e.courseTitle,
        e.facultyName,
        e.semester,
        this.formatDate(e.enrolledAt),
      ]);
    } else {
      title = 'Dropped Course Enrollments Report';
      filename = 'CourseHub_Dropped_Enrollments_Report';
      headers = [
        'Enrollment ID',
        'Student ID',
        'Student Name',
        'Course Code',
        'Course Title',
        'Enrolled Date',
        'Dropped Date',
      ];
      rows = droppedEnrollments.map((e) => [
        e.enrollmentId,
        e.studentId,
        e.studentName,
        e.courseCode,
        e.courseTitle,
        this.formatDate(e.enrolledAt),
        this.formatDate(e.droppedAt),
      ]);
    }

    if (format === 'csv') {
      downloadCsvFile(`${filename}.csv`, headers, rows);
      this.showToast(`Exported ${title} as CSV.`, 'success');
    } else {
      downloadTabularReportPdf({
        title,
        subtitle: `Westbridge Institute of Technology · Generated by ${this.currentUser?.name}`,
        headers,
        rows,
        filename: `${filename}.pdf`,
      });
      this.showToast(`Exported ${title} as PDF.`, 'success');
    }
  }

  // =========================================================================
  // MODALS & CONFIRMATION DIALOGS
  // =========================================================================

  private closeModal(): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
  }

  private openCourseDetailsModal(courseId: string): void {
    const course = this.courses.find((c) => c.courseId === courseId);
    const modalRoot = document.getElementById('ch-modal-root');
    if (!course || !modalRoot) return;

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-course-title">
        <div class="ch-modal-panel space-y-4">
          <div class="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
            <div>
              <div class="font-mono-tabular text-xs font-bold text-blue-600">${this.escapeHtml(course.courseCode)} · ${this.escapeHtml(course.semester)}</div>
              <h2 id="modal-course-title" class="text-xl font-bold text-slate-900 mt-0.5">${this.escapeHtml(course.title)}</h2>
            </div>
            <button type="button" id="modal-close-btn" aria-label="Close course details" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕ Close</button>
          </div>

          <p class="text-sm text-slate-700 leading-relaxed">${this.escapeHtml(course.description)}</p>

          <div class="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <div><strong>Department:</strong> ${this.escapeHtml(course.department)}</div>
            <div><strong>Assigned Faculty:</strong> ${this.escapeHtml(course.facultyName)}</div>
            <div><strong>Schedule:</strong> <span class="font-mono-tabular">${this.escapeHtml(course.schedule)}</span></div>
            <div><strong>Room:</strong> ${this.escapeHtml(course.room)}</div>
            <div><strong>Credit Hours:</strong> <span class="font-mono-tabular">${course.credits} Credits</span></div>
            <div><strong>Seat Availability:</strong> <span class="font-mono-tabular font-bold">${course.availableSeats} available of ${course.totalSeats}</span></div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-2">
            <button type="button" id="modal-cancel-btn" class="ch-btn ch-btn-secondary">Close</button>
            ${
              !course.isEnrolled && course.availableSeats > 0
                ? `<button type="button" id="modal-enroll-btn" class="ch-btn ch-btn-primary">Enroll in ${this.escapeHtml(course.courseCode)}</button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    document
      .getElementById('modal-close-btn')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('modal-cancel-btn')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('modal-enroll-btn')
      ?.addEventListener('click', async () => {
        this.closeModal();
        try {
          const res = await this.apiRequest('/api/enrollments', {
            method: 'POST',
            body: JSON.stringify({ courseId: course.courseId }),
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'success');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Enrollment failed.',
            'error'
          );
        }
      });
  }

  private openDropConfirmationModal(enrollmentId: string): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;

    const source =
      this.currentUser?.role === 'admin'
        ? this.adminEnrollments
        : this.studentEnrollments;
    const enr = source.find((e) => e.enrollmentId === enrollmentId);

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-drop-title">
        <div class="ch-modal-panel max-w-md space-y-4">
          <h2 id="modal-drop-title" class="text-lg font-bold text-slate-900">Confirm Course Drop</h2>
          <p class="text-sm text-slate-600">
            Are you sure you want to drop <strong>${this.escapeHtml(enr ? `${enr.courseCode} (${enr.courseTitle})` : enrollmentId)}</strong>?
            Your seat will be released immediately and available seats will increase by 1.
          </p>
          <div class="flex items-center justify-end gap-2.5 pt-2">
            <button type="button" id="modal-drop-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
            <button type="button" id="modal-drop-confirm" class="ch-btn ch-btn-danger">Confirm Drop Course</button>
          </div>
        </div>
      </div>
    `;

    document
      .getElementById('modal-drop-cancel')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('modal-drop-confirm')
      ?.addEventListener('click', async () => {
        this.closeModal();
        try {
          const res = await this.apiRequest(
            `/api/enrollments/${enrollmentId}`,
            {
              method: 'DELETE',
            }
          );
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Could not drop course.',
            'error'
          );
        }
      });
  }

  private async openStudentDetailsModal(studentId: string): Promise<void> {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;

    try {
      const res = await this.apiRequest(
        `/api/enrollments/student/${studentId}`
      );
      const stu = res.student;
      const active: EnrollmentItem[] = res.activeEnrollments || [];

      modalRoot.innerHTML = `
        <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
          <div class="ch-modal-panel space-y-4">
            <div class="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <div class="font-mono-tabular text-xs font-bold text-blue-600">${this.escapeHtml(stu.userId)} · ${this.escapeHtml(stu.department)}</div>
                <h2 class="text-xl font-bold text-slate-900">${this.escapeHtml(stu.name)}</h2>
                <div class="text-xs text-slate-500 font-mono-tabular">${this.escapeHtml(stu.email)}</div>
              </div>
              <button type="button" id="stu-modal-close" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕ Close</button>
            </div>

            <div>
              <h3 class="text-xs font-bold text-slate-700 mb-2">Active Enrolled Courses (${active.length})</h3>
              ${
                active.length === 0
                  ? `<div class="text-xs text-slate-500 py-4">No active enrollments.</div>`
                  : `<div class="space-y-2">
                      ${active
                        .map(
                          (e) => `
                        <div class="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                          <div>
                            <span class="font-mono-tabular font-bold text-blue-600">${this.escapeHtml(e.courseCode)}</span>
                            <span class="font-semibold text-slate-900 ml-1">${this.escapeHtml(e.courseTitle)}</span>
                            <div class="text-slate-500 mt-0.5">${this.escapeHtml(e.facultyName)} · ${this.escapeHtml(e.semester)} · ${this.escapeHtml(e.schedule)}</div>
                          </div>
                          <span class="font-mono-tabular text-slate-600">${this.formatDate(e.enrolledAt)}</span>
                        </div>
                      `
                        )
                        .join('')}
                    </div>`
              }
            </div>
          </div>
        </div>
      `;

      document
        .getElementById('stu-modal-close')
        ?.addEventListener('click', () => this.closeModal());
    } catch (err) {
      this.showToast(
        err instanceof Error ? err.message : 'Failed to load student details.',
        'error'
      );
    }
  }

  private openCourseFormModal(course?: CourseItem): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;
    const isEdit = Boolean(course);

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
        <div class="ch-modal-panel space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 class="text-lg font-bold text-slate-900">${isEdit ? `Edit Course ${this.escapeHtml(course?.courseCode)}` : 'Add New University Course'}</h2>
            <button type="button" id="course-modal-close" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕</button>
          </div>

          <form id="admin-course-form" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Course Code</label>
                <input name="courseCode" type="text" required placeholder="e.g. CS410" value="${this.escapeHtml(course?.courseCode || '')}" class="ch-input font-mono-tabular" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Course Title</label>
                <input name="title" type="text" required placeholder="e.g. Cloud Native Security" value="${this.escapeHtml(course?.title || '')}" class="ch-input" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Course Description</label>
              <textarea name="description" rows="2" required placeholder="Detailed syllabus summary..." class="ch-textarea">${this.escapeHtml(course?.description || '')}</textarea>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input name="department" type="text" required value="${this.escapeHtml(course?.department || 'Computer Science')}" class="ch-input" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Assign Faculty</label>
                <select name="facultyId" class="ch-select">
                  ${this.faculties
                    .map(
                      (f) =>
                        `<option value="${this.escapeHtml(f.userId)}" ${course?.facultyId === f.userId ? 'selected' : ''}>${this.escapeHtml(f.name)}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Total Seat Capacity</label>
                <input name="totalSeats" type="number" min="1" required value="${course?.totalSeats || 25}" class="ch-input font-mono-tabular" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
                <select name="semester" class="ch-select">
                  <option value="Fall 2026" ${course?.semester === 'Fall 2026' ? 'selected' : ''}>Fall 2026</option>
                  <option value="Spring 2027" ${course?.semester === 'Spring 2027' ? 'selected' : ''}>Spring 2027</option>
                  <option value="Summer 2027" ${course?.semester === 'Summer 2027' ? 'selected' : ''}>Summer 2027</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Class Schedule</label>
                <input name="schedule" type="text" required placeholder="Mon/Wed 10:00-11:30" value="${this.escapeHtml(course?.schedule || 'Mon/Wed 10:00-11:30')}" class="ch-input font-mono-tabular" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Room / Lecture Hall</label>
                <input name="room" type="text" required value="${this.escapeHtml(course?.room || 'Gates Hall 205')}" class="ch-input" />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-3">
              <button type="button" id="course-modal-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
              <button type="submit" class="ch-btn ch-btn-primary">${isEdit ? 'Save Course Changes' : 'Create Course'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document
      .getElementById('course-modal-close')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('course-modal-cancel')
      ?.addEventListener('click', () => this.closeModal());

    const form = document.getElementById(
      'admin-course-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        courseCode: String(fd.get('courseCode') || '').trim(),
        title: String(fd.get('title') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        department: String(fd.get('department') || 'Computer Science').trim(),
        facultyId: String(fd.get('facultyId') || ''),
        totalSeats: Number(fd.get('totalSeats') || 25),
        semester: String(fd.get('semester') || 'Fall 2026'),
        schedule: String(fd.get('schedule') || 'Mon/Wed 10:00-11:30').trim(),
        room: String(fd.get('room') || 'Gates Hall 205').trim(),
      };

      try {
        const res = isEdit
          ? await this.apiRequest(`/api/courses/${course!.courseId}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            })
          : await this.apiRequest('/api/courses', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
        this.closeModal();
        await this.refreshRoleData();
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Failed to save course.',
          'error'
        );
      }
    });
  }

  private openDeleteCourseModal(course: CourseItem): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
        <div class="ch-modal-panel max-w-md space-y-4">
          <h2 class="text-lg font-bold text-slate-900">Delete Course ${this.escapeHtml(course.courseCode)}?</h2>
          <p class="text-sm text-slate-600">
            Are you sure you want to permanently delete <strong>${this.escapeHtml(course.title)}</strong> and all associated enrollment records?
          </p>
          <div class="flex items-center justify-end gap-2 pt-2">
            <button type="button" id="del-course-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
            <button type="button" id="del-course-confirm" class="ch-btn ch-btn-danger">Delete Course</button>
          </div>
        </div>
      </div>
    `;

    document
      .getElementById('del-course-cancel')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('del-course-confirm')
      ?.addEventListener('click', async () => {
        this.closeModal();
        try {
          const res = await this.apiRequest(`/api/courses/${course.courseId}`, {
            method: 'DELETE',
          });
          await this.refreshRoleData();
          this.render();
          this.showToast(res.message, 'info');
        } catch (err) {
          this.showToast(
            err instanceof Error ? err.message : 'Failed to delete course.',
            'error'
          );
        }
      });
  }

  private openAddStudentModal(): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
        <div class="ch-modal-panel max-w-lg space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 class="text-lg font-bold text-slate-900">Register New Student Account</h2>
            <button type="button" id="add-stu-close" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕</button>
          </div>
          <form id="admin-add-student-form" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Student Full Name</label>
              <input name="name" type="text" required placeholder="e.g. Maya Lin" class="ch-input" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">University Email</label>
              <input name="email" type="email" required placeholder="maya.lin@university.edu" class="ch-input" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input name="department" type="text" required value="Computer Science" class="ch-input" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
                <select name="semester" class="ch-select">
                  <option value="Fall 2026">Fall 2026</option>
                  <option value="Spring 2027">Spring 2027</option>
                </select>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" id="add-stu-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
              <button type="submit" class="ch-btn ch-btn-primary">Create Student</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document
      .getElementById('add-stu-close')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('add-stu-cancel')
      ?.addEventListener('click', () => this.closeModal());

    const form = document.getElementById(
      'admin-add-student-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const res = await this.apiRequest('/api/users/students', {
          method: 'POST',
          body: JSON.stringify({
            name: String(fd.get('name') || ''),
            email: String(fd.get('email') || ''),
            department: String(fd.get('department') || 'Computer Science'),
            semester: String(fd.get('semester') || 'Fall 2026'),
          }),
        });
        this.closeModal();
        await this.refreshRoleData();
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Failed to create student.',
          'error'
        );
      }
    });
  }

  private openFacultyFormModal(faculty?: Record<string, any>): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;
    const isEdit = Boolean(faculty);

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
        <div class="ch-modal-panel max-w-lg space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 class="text-lg font-bold text-slate-900">${isEdit ? `Edit ${this.escapeHtml(faculty?.name)}` : 'Add New Faculty Member'}</h2>
            <button type="button" id="fac-modal-close" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕</button>
          </div>
          <form id="admin-faculty-form" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Full Name &amp; Honorific</label>
              <input name="name" type="text" required placeholder="e.g. Dr. Alan Grant" value="${this.escapeHtml(faculty?.name || '')}" class="ch-input" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">University Email</label>
              <input name="email" type="email" required placeholder="alan.grant@university.edu" value="${this.escapeHtml(faculty?.email || '')}" class="ch-input" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input name="department" type="text" required value="${this.escapeHtml(faculty?.department || 'Computer Science')}" class="ch-input" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Academic Title</label>
                <input name="title" type="text" value="${this.escapeHtml(faculty?.title || 'Associate Professor')}" class="ch-input" />
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" id="fac-modal-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
              <button type="submit" class="ch-btn ch-btn-primary">${isEdit ? 'Save Faculty' : 'Add Faculty'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document
      .getElementById('fac-modal-close')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('fac-modal-cancel')
      ?.addEventListener('click', () => this.closeModal());

    const form = document.getElementById(
      'admin-faculty-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || ''),
        email: String(fd.get('email') || ''),
        department: String(fd.get('department') || ''),
        title: String(fd.get('title') || ''),
      };
      try {
        const res = isEdit
          ? await this.apiRequest(`/api/users/faculty/${faculty!.userId}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            })
          : await this.apiRequest('/api/users/faculty', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
        this.closeModal();
        await this.refreshRoleData();
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Failed to save faculty.',
          'error'
        );
      }
    });
  }

  private openAdminEnrollModal(): void {
    const modalRoot = document.getElementById('ch-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="ch-modal-backdrop" role="dialog" aria-modal="true">
        <div class="ch-modal-panel max-w-md space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 class="text-lg font-bold text-slate-900">Register Student in Course</h2>
            <button type="button" id="adm-enr-close" class="ch-btn ch-btn-secondary text-xs py-1 px-2.5">✕</button>
          </div>
          <form id="adm-enroll-form" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Select Student</label>
              <select name="studentId" class="ch-select">
                ${this.adminStudents
                  .map(
                    (s) =>
                      `<option value="${this.escapeHtml(s.userId)}">${this.escapeHtml(s.name)} (${this.escapeHtml(s.userId)})</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Select Course (with Available Seats)</label>
              <select name="courseId" class="ch-select">
                ${this.courses
                  .map(
                    (c) =>
                      `<option value="${this.escapeHtml(c.courseId)}">${this.escapeHtml(c.courseCode)} — ${this.escapeHtml(c.title)} (${c.availableSeats} avail)</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" id="adm-enr-cancel" class="ch-btn ch-btn-secondary">Cancel</button>
              <button type="submit" class="ch-btn ch-btn-primary">Confirm Enrollment</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document
      .getElementById('adm-enr-close')
      ?.addEventListener('click', () => this.closeModal());
    document
      .getElementById('adm-enr-cancel')
      ?.addEventListener('click', () => this.closeModal());

    const form = document.getElementById(
      'adm-enroll-form'
    ) as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const res = await this.apiRequest('/api/enrollments', {
          method: 'POST',
          body: JSON.stringify({
            studentId: String(fd.get('studentId') || ''),
            courseId: String(fd.get('courseId') || ''),
          }),
        });
        this.closeModal();
        await this.refreshRoleData();
        this.render();
        this.showToast(res.message, 'success');
      } catch (err) {
        this.showToast(
          err instanceof Error ? err.message : 'Enrollment failed.',
          'error'
        );
      }
    });
  }
}

export function bootstrapCourseHubApp(): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const app = new CourseHubClientApp(rootEl);
  app.init();
}
