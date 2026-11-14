import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

export interface UserDoc {
  userId: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  email: string;
  password: string; // bcrypt hash
  department: string;
  semester?: string;
  phone?: string;
  title?: string;
  createdAt: string;
}

export interface CourseDoc {
  courseId: string;
  courseCode: string;
  title: string;
  description: string;
  department: string;
  credits: number;
  facultyId: string;
  totalSeats: number;
  availableSeats: number;
  semester: string;
  schedule: string;
  room: string;
  createdAt: string;
}

export interface EnrollmentDoc {
  enrollmentId: string;
  studentId: string;
  courseId: string;
  status: 'Active' | 'Dropped';
  enrolledAt: string;
  droppedAt?: string;
}

export interface ReportDoc {
  reportId: string;
  reportType: string;
  title: string;
  totalCourses: number;
  totalStudents: number;
  totalEnrollments: number;
  generatedBy: string;
  generatedAt: string;
}

export interface WaitlistDoc {
  waitlistId: string;
  studentId: string;
  courseId: string;
  position: number;
  status: 'Waiting' | 'Promoted' | 'Cancelled';
  createdAt: string;
}

export interface SystemSettingsDoc {
  currentSemester: string;
  registrationDeadline: string;
  dropDeadline: string;
  maxCoursesPerSemester: number;
  allowWaitlist: boolean;
  autoPromoteWaitlist: boolean;
  enforceScheduleClash: boolean;
  universityName: string;
  academicYear: string;
  updatedAt: string;
}

export interface DatabaseState {
  users: UserDoc[];
  courses: CourseDoc[];
  enrollments: EnrollmentDoc[];
  reports: ReportDoc[];
  waitlists: WaitlistDoc[];
  settings: SystemSettingsDoc;
}

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const DATA_FILE = path.join(DATA_DIR, 'mongodb_store.json');

let dbState: DatabaseState | null = null;
let mongoConnected = false;

// Simple async mutex to ensure atomic enrollment / seat operations
let operationQueue: Promise<unknown> = Promise.resolve();

export function runAtomic<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = operationQueue.then(() => fn());
  operationQueue = result.catch(() => {});
  return result;
}

function buildInitialSeedData(): DatabaseState {
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const facultyPasswordHash = bcrypt.hashSync('faculty123', 10);
  const studentPasswordHash = bcrypt.hashSync('student123', 10);

  const users: UserDoc[] = [
    // 1 Admin Account
    {
      userId: 'ADM-001',
      name: 'Dr. Marcus Vance',
      role: 'admin',
      email: 'admin@coursehub.edu',
      password: adminPasswordHash,
      department: 'Academic Registrar',
      title: 'Chief University Registrar',
      phone: '+1 (555) 201-8800',
      createdAt: '2026-07-01T08:00:00.000Z',
    },
    // 3 Faculty Accounts
    {
      userId: 'FAC-101',
      name: 'Dr. Elena Rostova',
      role: 'faculty',
      email: 'elena.rostova@university.edu',
      password: facultyPasswordHash,
      department: 'Computer Science',
      title: 'Professor of Distributed Systems',
      phone: '+1 (555) 304-1120',
      createdAt: '2026-07-10T09:00:00.000Z',
    },
    {
      userId: 'FAC-102',
      name: 'Prof. David Chen',
      role: 'faculty',
      email: 'david.chen@university.edu',
      password: facultyPasswordHash,
      department: 'Data Science & AI',
      title: 'Associate Professor of Machine Learning',
      phone: '+1 (555) 304-1185',
      createdAt: '2026-07-11T09:30:00.000Z',
    },
    {
      userId: 'FAC-103',
      name: 'Dr. Sarah Jenkins',
      role: 'faculty',
      email: 'sarah.jenkins@university.edu',
      password: facultyPasswordHash,
      department: 'Electrical Engineering',
      title: 'Professor of Embedded & Quantum Systems',
      phone: '+1 (555) 304-1240',
      createdAt: '2026-07-12T10:15:00.000Z',
    },
    // 10 Student Accounts
    {
      userId: 'STU-2001',
      name: 'Alex Rivera',
      role: 'student',
      email: 'alex.rivera@university.edu',
      password: studentPasswordHash,
      department: 'Computer Science',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2001',
      createdAt: '2026-08-01T10:00:00.000Z',
    },
    {
      userId: 'STU-2002',
      name: 'Priya Patel',
      role: 'student',
      email: 'priya.patel@university.edu',
      password: studentPasswordHash,
      department: 'Data Science & AI',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2002',
      createdAt: '2026-08-01T11:20:00.000Z',
    },
    {
      userId: 'STU-2003',
      name: "Liam O'Connor",
      role: 'student',
      email: 'liam.oconnor@university.edu',
      password: studentPasswordHash,
      department: 'Computer Science',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2003',
      createdAt: '2026-08-02T09:15:00.000Z',
    },
    {
      userId: 'STU-2004',
      name: 'Sofia Martinez',
      role: 'student',
      email: 'sofia.martinez@university.edu',
      password: studentPasswordHash,
      department: 'Software Engineering',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2004',
      createdAt: '2026-08-02T14:40:00.000Z',
    },
    {
      userId: 'STU-2005',
      name: 'Noah Kim',
      role: 'student',
      email: 'noah.kim@university.edu',
      password: studentPasswordHash,
      department: 'Electrical Engineering',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2005',
      createdAt: '2026-08-03T12:10:00.000Z',
    },
    {
      userId: 'STU-2006',
      name: 'Amara Osei',
      role: 'student',
      email: 'amara.osei@university.edu',
      password: studentPasswordHash,
      department: 'Cybersecurity',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2006',
      createdAt: '2026-08-03T16:05:00.000Z',
    },
    {
      userId: 'STU-2007',
      name: 'Ethan Wright',
      role: 'student',
      email: 'ethan.wright@university.edu',
      password: studentPasswordHash,
      department: 'Data Science & AI',
      semester: 'Spring 2027',
      phone: '+1 (555) 410-2007',
      createdAt: '2026-08-04T09:50:00.000Z',
    },
    {
      userId: 'STU-2008',
      name: 'Chloe Dubois',
      role: 'student',
      email: 'chloe.dubois@university.edu',
      password: studentPasswordHash,
      department: 'Computer Science',
      semester: 'Spring 2027',
      phone: '+1 (555) 410-2008',
      createdAt: '2026-08-04T13:30:00.000Z',
    },
    {
      userId: 'STU-2009',
      name: 'Mateo Silva',
      role: 'student',
      email: 'mateo.silva@university.edu',
      password: studentPasswordHash,
      department: 'Software Engineering',
      semester: 'Fall 2026',
      phone: '+1 (555) 410-2009',
      createdAt: '2026-08-05T10:45:00.000Z',
    },
    {
      userId: 'STU-2010',
      name: 'Hanna Lindqvist',
      role: 'student',
      email: 'hanna.lindqvist@university.edu',
      password: studentPasswordHash,
      department: 'Electrical Engineering',
      semester: 'Spring 2027',
      phone: '+1 (555) 410-2010',
      createdAt: '2026-08-05T15:20:00.000Z',
    },
  ];

  // Sample Enrollments (Active and Dropped)
  const enrollments: EnrollmentDoc[] = [
    // Alex Rivera (STU-2001): enrolled in CS301 & DS204, dropped EE210 earlier
    {
      enrollmentId: 'ENR-5001',
      studentId: 'STU-2001',
      courseId: 'CRS-101',
      status: 'Active',
      enrolledAt: '2026-08-18T09:15:00.000Z',
    },
    {
      enrollmentId: 'ENR-5002',
      studentId: 'STU-2001',
      courseId: 'CRS-103',
      status: 'Active',
      enrolledAt: '2026-08-18T09:22:00.000Z',
    },
    {
      enrollmentId: 'ENR-5003',
      studentId: 'STU-2001',
      courseId: 'CRS-106',
      status: 'Dropped',
      enrolledAt: '2026-08-16T10:00:00.000Z',
      droppedAt: '2026-08-17T14:30:00.000Z',
    },
    // Priya Patel (STU-2002)
    {
      enrollmentId: 'ENR-5004',
      studentId: 'STU-2002',
      courseId: 'CRS-103',
      status: 'Active',
      enrolledAt: '2026-08-19T10:05:00.000Z',
    },
    {
      enrollmentId: 'ENR-5005',
      studentId: 'STU-2002',
      courseId: 'CRS-104',
      status: 'Active',
      enrolledAt: '2026-08-19T10:12:00.000Z',
    },
    {
      enrollmentId: 'ENR-5006',
      studentId: 'STU-2002',
      courseId: 'CRS-105',
      status: 'Active',
      enrolledAt: '2026-08-19T10:20:00.000Z',
    },
    // Liam O'Connor (STU-2003)
    {
      enrollmentId: 'ENR-5007',
      studentId: 'STU-2003',
      courseId: 'CRS-101',
      status: 'Active',
      enrolledAt: '2026-08-20T11:00:00.000Z',
    },
    {
      enrollmentId: 'ENR-5008',
      studentId: 'STU-2003',
      courseId: 'CRS-102',
      status: 'Active',
      enrolledAt: '2026-08-20T11:08:00.000Z',
    },
    {
      enrollmentId: 'ENR-5009',
      studentId: 'STU-2003',
      courseId: 'CRS-105',
      status: 'Active',
      enrolledAt: '2026-08-20T11:15:00.000Z',
    },
    // Sofia Martinez (STU-2004)
    {
      enrollmentId: 'ENR-5010',
      studentId: 'STU-2004',
      courseId: 'CRS-102',
      status: 'Active',
      enrolledAt: '2026-08-21T08:45:00.000Z',
    },
    {
      enrollmentId: 'ENR-5011',
      studentId: 'STU-2004',
      courseId: 'CRS-105',
      status: 'Active',
      enrolledAt: '2026-08-21T08:50:00.000Z',
    },
    {
      enrollmentId: 'ENR-5012',
      studentId: 'STU-2004',
      courseId: 'CRS-108',
      status: 'Active',
      enrolledAt: '2026-08-21T09:05:00.000Z',
    },
    // Noah Kim (STU-2005)
    {
      enrollmentId: 'ENR-5013',
      studentId: 'STU-2005',
      courseId: 'CRS-106',
      status: 'Active',
      enrolledAt: '2026-08-22T14:10:00.000Z',
    },
    {
      enrollmentId: 'ENR-5014',
      studentId: 'STU-2005',
      courseId: 'CRS-107',
      status: 'Active',
      enrolledAt: '2026-08-22T14:22:00.000Z',
    },
    {
      enrollmentId: 'ENR-5015',
      studentId: 'STU-2005',
      courseId: 'CRS-104',
      status: 'Dropped',
      enrolledAt: '2026-08-20T16:00:00.000Z',
      droppedAt: '2026-08-22T12:00:00.000Z',
    },
    // Amara Osei (STU-2006)
    {
      enrollmentId: 'ENR-5016',
      studentId: 'STU-2006',
      courseId: 'CRS-105',
      status: 'Active',
      enrolledAt: '2026-08-23T09:30:00.000Z',
    },
    {
      enrollmentId: 'ENR-5017',
      studentId: 'STU-2006',
      courseId: 'CRS-101',
      status: 'Active',
      enrolledAt: '2026-08-23T09:40:00.000Z',
    },
    // Ethan Wright (STU-2007)
    {
      enrollmentId: 'ENR-5018',
      studentId: 'STU-2007',
      courseId: 'CRS-109',
      status: 'Active',
      enrolledAt: '2026-08-24T10:15:00.000Z',
    },
    {
      enrollmentId: 'ENR-5019',
      studentId: 'STU-2007',
      courseId: 'CRS-104',
      status: 'Active',
      enrolledAt: '2026-08-24T10:25:00.000Z',
    },
    // Chloe Dubois (STU-2008)
    {
      enrollmentId: 'ENR-5020',
      studentId: 'STU-2008',
      courseId: 'CRS-108',
      status: 'Active',
      enrolledAt: '2026-08-25T13:10:00.000Z',
    },
    {
      enrollmentId: 'ENR-5021',
      studentId: 'STU-2008',
      courseId: 'CRS-102',
      status: 'Active',
      enrolledAt: '2026-08-25T13:20:00.000Z',
    },
    // Mateo Silva (STU-2009)
    {
      enrollmentId: 'ENR-5022',
      studentId: 'STU-2009',
      courseId: 'CRS-101',
      status: 'Active',
      enrolledAt: '2026-08-26T15:00:00.000Z',
    },
    {
      enrollmentId: 'ENR-5023',
      studentId: 'STU-2009',
      courseId: 'CRS-108',
      status: 'Active',
      enrolledAt: '2026-08-26T15:15:00.000Z',
    },
    {
      enrollmentId: 'ENR-5024',
      studentId: 'STU-2009',
      courseId: 'CRS-103',
      status: 'Dropped',
      enrolledAt: '2026-08-24T11:00:00.000Z',
      droppedAt: '2026-08-26T14:50:00.000Z',
    },
    // Hanna Lindqvist (STU-2010)
    {
      enrollmentId: 'ENR-5025',
      studentId: 'STU-2010',
      courseId: 'CRS-107',
      status: 'Active',
      enrolledAt: '2026-08-27T11:30:00.000Z',
    },
    {
      enrollmentId: 'ENR-5026',
      studentId: 'STU-2010',
      courseId: 'CRS-110',
      status: 'Active',
      enrolledAt: '2026-08-27T11:45:00.000Z',
    },
  ];

  const countActiveForCourse = (courseId: string) =>
    enrollments.filter((e) => e.courseId === courseId && e.status === 'Active').length;

  // 10 Courses across departments and semesters
  const rawCourses: Array<Omit<CourseDoc, 'availableSeats'>> = [
    {
      courseId: 'CRS-101',
      courseCode: 'CS301',
      title: 'Distributed Systems & Cloud Architecture',
      description:
        'Principles of fault-tolerant distributed computing, Raft/Paxos consensus, distributed transactions, and container orchestration.',
      department: 'Computer Science',
      credits: 4,
      facultyId: 'FAC-101',
      totalSeats: 25,
      semester: 'Fall 2026',
      schedule: 'Mon/Wed 09:00-10:30',
      room: 'Gates Hall 302',
      createdAt: '2026-07-15T10:00:00.000Z',
    },
    {
      courseId: 'CRS-102',
      courseCode: 'CS302',
      title: 'Advanced Algorithms & Graph Theory',
      description:
        'Network flows, randomized algorithms, dynamic programming optimization, NP-completeness, and approximation techniques.',
      department: 'Computer Science',
      credits: 4,
      facultyId: 'FAC-101',
      totalSeats: 30,
      semester: 'Fall 2026',
      schedule: 'Tue/Thu 11:00-12:30',
      room: 'Turing Auditorium 104',
      createdAt: '2026-07-15T10:30:00.000Z',
    },
    {
      courseId: 'CRS-103',
      courseCode: 'DS204',
      title: 'Statistical Machine Learning',
      description:
        'Supervised and unsupervised learning, kernel methods, Bayesian inference, ensemble boosting, and generalization bounds.',
      department: 'Data Science & AI',
      credits: 4,
      facultyId: 'FAC-102',
      totalSeats: 20,
      semester: 'Fall 2026',
      schedule: 'Mon/Wed 13:30-15:00',
      room: 'Lovelace Center 210',
      createdAt: '2026-07-16T09:00:00.000Z',
    },
    {
      courseId: 'CRS-104',
      courseCode: 'DS401',
      title: 'Deep Learning & Neural Architectures',
      description:
        'Transformer architectures, convolutional and diffusion networks, backprop optimization, and GPU hardware acceleration.',
      department: 'Data Science & AI',
      credits: 4,
      facultyId: 'FAC-102',
      totalSeats: 15,
      semester: 'Fall 2026',
      schedule: 'Tue/Thu 14:00-15:30',
      room: 'Lovelace Center 405',
      createdAt: '2026-07-16T11:00:00.000Z',
    },
    {
      courseId: 'CRS-105',
      courseCode: 'CS405',
      title: 'Cryptography & Zero-Knowledge Proofs',
      description:
        'Elliptic curve cryptography, homomorphic encryption, SNARKs/STARKs, and cryptographic protocol verification.',
      department: 'Cybersecurity',
      credits: 3,
      facultyId: 'FAC-101',
      totalSeats: 4, // 4 active enrollments => 0 available seats (Full course for testing waitlist & full indicator)
      semester: 'Fall 2026',
      schedule: 'Fri 10:00-13:00',
      room: 'Security Lab 112',
      createdAt: '2026-07-17T08:30:00.000Z',
    },
    {
      courseId: 'CRS-106',
      courseCode: 'EE210',
      title: 'Embedded Microprocessor Systems',
      description:
        'ARM Cortex architecture, real-time operating systems (RTOS), hardware interrupts, I2C/SPI buses, and firmware design.',
      department: 'Electrical Engineering',
      credits: 4,
      facultyId: 'FAC-103',
      totalSeats: 25,
      semester: 'Fall 2026',
      schedule: 'Mon/Wed 09:00-10:30', // Intentional clash with CS301 for testing timetable clash detection
      room: 'Tesla Lab 201',
      createdAt: '2026-07-17T14:00:00.000Z',
    },
    {
      courseId: 'CRS-107',
      courseCode: 'EE340',
      title: 'Quantum Computing Foundations',
      description:
        'Qubits, quantum gates, entanglement, Shor and Grover algorithms, and quantum error correction circuits.',
      department: 'Electrical Engineering',
      credits: 3,
      facultyId: 'FAC-103',
      totalSeats: 20,
      semester: 'Spring 2027',
      schedule: 'Tue/Thu 09:30-11:00',
      room: 'Planck Hall 108',
      createdAt: '2026-07-18T10:00:00.000Z',
    },
    {
      courseId: 'CRS-108',
      courseCode: 'SE315',
      title: 'Enterprise Software Architecture',
      description:
        'Domain-driven design, event-driven microservices, CI/CD pipelines, observability, and high-availability system design.',
      department: 'Software Engineering',
      credits: 4,
      facultyId: 'FAC-101',
      totalSeats: 35,
      semester: 'Spring 2027',
      schedule: 'Mon/Wed 15:30-17:00',
      room: 'Gates Hall 204',
      createdAt: '2026-07-18T12:00:00.000Z',
    },
    {
      courseId: 'CRS-109',
      courseCode: 'DS310',
      title: 'Natural Language Processing & Large Models',
      description:
        'Tokenization, attention mechanisms, retrieval-augmented generation, fine-tuning, and evaluation benchmarks.',
      department: 'Data Science & AI',
      credits: 4,
      facultyId: 'FAC-102',
      totalSeats: 25,
      semester: 'Spring 2027',
      schedule: 'Tue/Thu 13:00-14:30',
      room: 'Lovelace Center 302',
      createdAt: '2026-07-19T09:30:00.000Z',
    },
    {
      courseId: 'CRS-110',
      courseCode: 'EE412',
      title: 'Autonomous Robotics & Control Systems',
      description:
        'Kinematics, SLAM, Kalman filtering, PID and model predictive control, and ROS2 sensor fusion.',
      department: 'Electrical Engineering',
      credits: 4,
      facultyId: 'FAC-103',
      totalSeats: 18,
      semester: 'Summer 2027',
      schedule: 'Mon/Wed 11:00-12:30',
      room: 'Robotics Hangar B',
      createdAt: '2026-07-20T11:00:00.000Z',
    },
  ];

  const courses: CourseDoc[] = rawCourses.map((c) => {
    const active = countActiveForCourse(c.courseId);
    return {
      ...c,
      availableSeats: Math.max(0, c.totalSeats - active),
    };
  });

  const activeEnrollmentCount = enrollments.filter((e) => e.status === 'Active').length;

  const reports: ReportDoc[] = [
    {
      reportId: 'RPT-1001',
      reportType: 'Comprehensive Enrollment Audit',
      title: 'Fall 2026 Initial Registration Snapshot',
      totalCourses: courses.length,
      totalStudents: users.filter((u) => u.role === 'student').length,
      totalEnrollments: activeEnrollmentCount,
      generatedBy: 'Dr. Marcus Vance (ADM-001)',
      generatedAt: '2026-09-01T12:00:00.000Z',
    },
  ];

  const waitlists: WaitlistDoc[] = [
    {
      waitlistId: 'WL-3001',
      studentId: 'STU-2005',
      courseId: 'CRS-105', // CS405 is full
      position: 1,
      status: 'Waiting',
      createdAt: '2026-08-25T16:20:00.000Z',
    },
  ];

  const settings: SystemSettingsDoc = {
    currentSemester: 'Fall 2026',
    registrationDeadline: process.env.DEFAULT_REGISTRATION_DEADLINE || '2027-05-15T23:59:59.000Z',
    dropDeadline: process.env.DEFAULT_DROP_DEADLINE || '2027-04-30T23:59:59.000Z',
    maxCoursesPerSemester: 6,
    allowWaitlist: true,
    autoPromoteWaitlist: true,
    enforceScheduleClash: true,
    universityName: 'Westbridge Institute of Technology',
    academicYear: '2026–2027',
    updatedAt: '2026-08-15T08:00:00.000Z',
  };

  return {
    users,
    courses,
    enrollments,
    reports,
    waitlists,
    settings,
  };
}

export async function connectDatabase(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      dbState = JSON.parse(raw) as DatabaseState;
    } catch {
      dbState = buildInitialSeedData();
      saveDatabase();
    }
  } else {
    dbState = buildInitialSeedData();
    saveDatabase();
  }

  // Optional external MongoDB connection via Mongoose when MONGODB_URI is reachable
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && !mongoUri.includes('MY_')) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 1200 });
      mongoConnected = true;
      console.log('[CourseHub DB] Connected to MongoDB via Mongoose.');
    } catch {
      mongoConnected = false;
      console.log(
        '[CourseHub DB] External mongod not detected; operating with persistent CourseHub Document Store (backend/data/mongodb_store.json).'
      );
    }
  }
}

export function getDb(): DatabaseState {
  if (!dbState) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      try {
        dbState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as DatabaseState;
      } catch {
        dbState = buildInitialSeedData();
        saveDatabase();
      }
    } else {
      dbState = buildInitialSeedData();
      saveDatabase();
    }
  }
  return dbState;
}

export function saveDatabase(): void {
  if (!dbState) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(dbState, null, 2), 'utf-8');
}

export function resetToSeedData(): DatabaseState {
  dbState = buildInitialSeedData();
  saveDatabase();
  return dbState;
}

export function isExternalMongoConnected(): boolean {
  return mongoConnected;
}
