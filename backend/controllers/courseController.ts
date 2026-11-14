import type { Response } from 'express';
import { getDb, runAtomic, saveDatabase, type CourseDoc } from '../config/db';
import {
  verifyAuthToken,
  type AuthenticatedRequest,
} from '../middleware/auth';
import {
  detectScheduleClash,
  validateSeatCapacityUpdate,
} from '../utils/enrollmentRules';

function enrichCourse(course: CourseDoc, studentId?: string) {
  const db = getDb();
  const faculty = db.users.find((u) => u.userId === course.facultyId);
  const activeEnrollments = db.enrollments.filter(
    (e) => e.courseId === course.courseId && e.status === 'Active'
  );
  const occupiedSeats = activeEnrollments.length;
  const availableSeats = Math.max(0, course.totalSeats - occupiedSeats);

  // Keep course.availableSeats synchronized with active enrollments
  course.availableSeats = availableSeats;

  const waitlists = db.waitlists.filter(
    (w) => w.courseId === course.courseId && w.status === 'Waiting'
  );

  let isEnrolled = false;
  let studentEnrollmentId: string | null = null;
  let isWaitlisted = false;
  let studentWaitlistId: string | null = null;
  let scheduleClashWith: string | null = null;

  if (studentId) {
    const activeMatch = activeEnrollments.find((e) => e.studentId === studentId);
    if (activeMatch) {
      isEnrolled = true;
      studentEnrollmentId = activeMatch.enrollmentId;
    }

    const waitMatch = waitlists.find((w) => w.studentId === studentId);
    if (waitMatch) {
      isWaitlisted = true;
      studentWaitlistId = waitMatch.waitlistId;
    }

    if (!isEnrolled) {
      const studentActiveCourseIds = db.enrollments
        .filter((e) => e.studentId === studentId && e.status === 'Active')
        .map((e) => e.courseId);
      const studentActiveCourses = db.courses.filter((c) =>
        studentActiveCourseIds.includes(c.courseId)
      );
      const clash = detectScheduleClash(course, studentActiveCourses);
      if (clash.clashing && clash.conflictingCourse) {
        scheduleClashWith = `${clash.conflictingCourse.courseCode} (${clash.conflictingCourse.schedule})`;
      }
    }
  }

  let seatStatus: 'Available' | 'Full' | 'Enrolled' = 'Available';
  if (isEnrolled) {
    seatStatus = 'Enrolled';
  } else if (availableSeats <= 0) {
    seatStatus = 'Full';
  }

  return {
    ...course,
    availableSeats,
    occupiedSeats,
    fillPercentage:
      course.totalSeats > 0 ? Math.round((occupiedSeats / course.totalSeats) * 100) : 0,
    facultyName: faculty ? faculty.name : 'Unassigned Faculty',
    facultyEmail: faculty ? faculty.email : '',
    facultyDepartment: faculty ? faculty.department : course.department,
    waitlistCount: waitlists.length,
    isEnrolled,
    studentEnrollmentId,
    isWaitlisted,
    studentWaitlistId,
    scheduleClashWith,
    seatStatus,
  };
}

export function getAllCourses(req: AuthenticatedRequest, res: Response): void {
  const db = getDb();

  // Optional token inspection so public or student requests both work seamlessly
  let currentStudentId: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = verifyAuthToken(authHeader.slice(7).trim());
      if (decoded.role === 'student') {
        currentStudentId = decoded.userId;
      }
    } catch {
      // Ignore invalid token on public catalog view
    }
  }

  const { search, semester, facultyId, department, status } = req.query;

  let list = db.courses.map((c) => enrichCourse(c, currentStudentId));

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.courseCode.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.facultyName.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q)
    );
  }

  if (semester && semester !== 'all') {
    list = list.filter((c) => c.semester === String(semester));
  }

  if (facultyId && facultyId !== 'all') {
    list = list.filter((c) => c.facultyId === String(facultyId));
  }

  if (department && department !== 'all') {
    list = list.filter((c) => c.department === String(department));
  }

  if (status && status !== 'all') {
    if (status === 'available') {
      list = list.filter((c) => c.availableSeats > 0);
    } else if (status === 'full') {
      list = list.filter((c) => c.availableSeats === 0);
    } else if (status === 'enrolled') {
      list = list.filter((c) => c.isEnrolled);
    }
  }

  const semesters = Array.from(new Set(db.courses.map((c) => c.semester)));
  const departments = Array.from(new Set(db.courses.map((c) => c.department)));
  const faculties = db.users
    .filter((u) => u.role === 'faculty')
    .map((f) => ({
      userId: f.userId,
      name: f.name,
      department: f.department,
      email: f.email,
    }));

  res.status(200).json({
    success: true,
    count: list.length,
    courses: list,
    filters: {
      semesters,
      departments,
      faculties,
    },
    settings: db.settings,
  });
}

export function getCourseById(req: AuthenticatedRequest, res: Response): void {
  const db = getDb();
  const { id } = req.params;
  const course = db.courses.find(
    (c) => c.courseId === id || c.courseCode.toLowerCase() === String(id).toLowerCase()
  );

  if (!course) {
    res.status(404).json({
      success: false,
      message: 'Course not found.',
    });
    return;
  }

  let currentStudentId: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = verifyAuthToken(authHeader.slice(7).trim());
      if (decoded.role === 'student') {
        currentStudentId = decoded.userId;
      }
    } catch {
      // Ignore
    }
  }

  const enriched = enrichCourse(course, currentStudentId);
  res.status(200).json({
    success: true,
    course: enriched,
  });
}

export async function createCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const {
      courseCode,
      title,
      description,
      department = 'Computer Science',
      credits = 4,
      facultyId,
      totalSeats,
      semester = 'Fall 2026',
      schedule = 'Mon/Wed 10:00-11:30',
      room = 'Academic Hall 201',
    } = req.body || {};

    if (!courseCode || !title || !description || !facultyId || totalSeats === undefined) {
      res.status(400).json({
        success: false,
        message:
          'Course code, title, description, assigned faculty, and total seat capacity are required.',
      });
      return;
    }

    const normalizedCode = String(courseCode).trim().toUpperCase();
    const duplicate = db.courses.find((c) => c.courseCode.toUpperCase() === normalizedCode);
    if (duplicate) {
      res.status(409).json({
        success: false,
        message: `A course with code ${normalizedCode} already exists.`,
      });
      return;
    }

    const parsedSeats = Number(totalSeats);
    if (!Number.isInteger(parsedSeats) || parsedSeats < 1) {
      res.status(400).json({
        success: false,
        message: 'Total seats must be a positive integer (at least 1).',
      });
      return;
    }

    const faculty = db.users.find((u) => u.userId === facultyId && u.role === 'faculty');
    if (!faculty) {
      res.status(400).json({
        success: false,
        message: 'Selected faculty member was not found.',
      });
      return;
    }

    const nums = db.courses
      .map((c) => parseInt(c.courseId.replace('CRS-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextCourseNum = (nums.length ? Math.max(...nums) : 100) + 1;

    const newCourse: CourseDoc = {
      courseId: `CRS-${nextCourseNum}`,
      courseCode: normalizedCode,
      title: String(title).trim(),
      description: String(description).trim(),
      department: String(department).trim() || faculty.department,
      credits: Number(credits) || 4,
      facultyId: faculty.userId,
      totalSeats: parsedSeats,
      availableSeats: parsedSeats,
      semester: String(semester).trim(),
      schedule: String(schedule).trim() || 'Mon/Wed 10:00-11:30',
      room: String(room).trim() || 'Academic Hall 201',
      createdAt: new Date().toISOString(),
    };

    db.courses.push(newCourse);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: `Course ${newCourse.courseCode} (${newCourse.title}) created successfully.`,
      course: enrichCourse(newCourse),
    });
  });
}

export async function updateCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const course = db.courses.find((c) => c.courseId === id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Course not found.',
      });
      return;
    }

    const {
      courseCode,
      title,
      description,
      department,
      credits,
      facultyId,
      totalSeats,
      semester,
      schedule,
      room,
    } = req.body || {};

    if (courseCode && String(courseCode).trim()) {
      const normalizedCode = String(courseCode).trim().toUpperCase();
      const duplicate = db.courses.find(
        (c) => c.courseCode.toUpperCase() === normalizedCode && c.courseId !== course.courseId
      );
      if (duplicate) {
        res.status(409).json({
          success: false,
          message: `Course code ${normalizedCode} is already in use by another course.`,
        });
        return;
      }
      course.courseCode = normalizedCode;
    }

    if (totalSeats !== undefined) {
      const activeCount = db.enrollments.filter(
        (e) => e.courseId === course.courseId && e.status === 'Active'
      ).length;
      const currentAvail = Math.max(0, course.totalSeats - activeCount);
      const seatCheck = validateSeatCapacityUpdate(
        course.totalSeats,
        currentAvail,
        Number(totalSeats)
      );

      if (!seatCheck.valid) {
        res.status(400).json({
          success: false,
          message: seatCheck.message,
        });
        return;
      }

      course.totalSeats = Number(totalSeats);
      course.availableSeats = seatCheck.nextAvailableSeats;
    }

    if (facultyId) {
      const faculty = db.users.find((u) => u.userId === facultyId && u.role === 'faculty');
      if (!faculty) {
        res.status(400).json({
          success: false,
          message: 'Assigned faculty member does not exist.',
        });
        return;
      }
      course.facultyId = faculty.userId;
    }

    if (title && String(title).trim()) course.title = String(title).trim();
    if (description && String(description).trim()) course.description = String(description).trim();
    if (department && String(department).trim()) course.department = String(department).trim();
    if (credits !== undefined) course.credits = Number(credits) || course.credits;
    if (semester && String(semester).trim()) course.semester = String(semester).trim();
    if (schedule && String(schedule).trim()) course.schedule = String(schedule).trim();
    if (room && String(room).trim()) course.room = String(room).trim();

    saveDatabase();

    res.status(200).json({
      success: true,
      message: `Course ${course.courseCode} updated successfully.`,
      course: enrichCourse(course),
    });
  });
}

export async function deleteCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const index = db.courses.findIndex((c) => c.courseId === id);

    if (index === -1) {
      res.status(404).json({
        success: false,
        message: 'Course not found.',
      });
      return;
    }

    const removed = db.courses[index];
    db.courses.splice(index, 1);
    db.enrollments = db.enrollments.filter((e) => e.courseId !== removed.courseId);
    db.waitlists = db.waitlists.filter((w) => w.courseId !== removed.courseId);
    saveDatabase();

    res.status(200).json({
      success: true,
      message: `Course ${removed.courseCode} (${removed.title}) and its associated enrollments have been deleted.`,
    });
  });
}

export async function assignFacultyToCourse(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const { facultyId } = req.body || {};

    const course = db.courses.find((c) => c.courseId === id);
    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Course not found.',
      });
      return;
    }

    const faculty = db.users.find((u) => u.userId === facultyId && u.role === 'faculty');
    if (!faculty) {
      res.status(404).json({
        success: false,
        message: 'Faculty member not found.',
      });
      return;
    }

    course.facultyId = faculty.userId;
    saveDatabase();

    res.status(200).json({
      success: true,
      message: `Assigned ${faculty.name} to ${course.courseCode} (${course.title}).`,
      course: enrichCourse(course),
    });
  });
}

export async function updateCourseSeats(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const { totalSeats } = req.body || {};

    const course = db.courses.find((c) => c.courseId === id);
    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Course not found.',
      });
      return;
    }

    const activeCount = db.enrollments.filter(
      (e) => e.courseId === course.courseId && e.status === 'Active'
    ).length;
    const currentAvail = Math.max(0, course.totalSeats - activeCount);

    const validation = validateSeatCapacityUpdate(
      course.totalSeats,
      currentAvail,
      Number(totalSeats)
    );

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        message: validation.message,
      });
      return;
    }

    course.totalSeats = Number(totalSeats);
    course.availableSeats = validation.nextAvailableSeats;
    saveDatabase();

    res.status(200).json({
      success: true,
      message: `Updated ${course.courseCode} seat capacity to ${course.totalSeats} (${course.availableSeats} available, ${validation.occupiedSeats} occupied).`,
      course: enrichCourse(course),
    });
  });
}
