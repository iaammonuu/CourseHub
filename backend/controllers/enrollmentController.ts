import type { Response } from 'express';
import {
  getDb,
  runAtomic,
  saveDatabase,
  type EnrollmentDoc,
  type WaitlistDoc,
} from '../config/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  validateDropRequest,
  validateEnrollmentRequest,
} from '../utils/enrollmentRules';

function enrichEnrollment(enrollment: EnrollmentDoc) {
  const db = getDb();
  const course = db.courses.find((c) => c.courseId === enrollment.courseId);
  const student = db.users.find((u) => u.userId === enrollment.studentId);
  const faculty = course ? db.users.find((u) => u.userId === course.facultyId) : undefined;

  const activeCount = course
    ? db.enrollments.filter((e) => e.courseId === course.courseId && e.status === 'Active')
        .length
    : 0;

  return {
    ...enrollment,
    studentName: student ? student.name : 'Unknown Student',
    studentEmail: student ? student.email : '',
    studentDepartment: student ? student.department : '',
    courseCode: course ? course.courseCode : 'N/A',
    courseTitle: course ? course.title : 'Deleted Course',
    courseDescription: course ? course.description : '',
    courseDepartment: course ? course.department : '',
    credits: course ? course.credits : 0,
    semester: course ? course.semester : 'N/A',
    schedule: course ? course.schedule : '',
    room: course ? course.room : '',
    totalSeats: course ? course.totalSeats : 0,
    availableSeats: course ? Math.max(0, course.totalSeats - activeCount) : 0,
    facultyId: course ? course.facultyId : '',
    facultyName: faculty ? faculty.name : 'Unassigned Faculty',
    facultyEmail: faculty ? faculty.email : '',
  };
}

export async function enrollInCourse(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const requestingUser = req.user;
    if (!requestingUser) {
      res.status(401).json({
        success: false,
        message: 'Authentication required to enroll in a course.',
      });
      return;
    }

    const { courseId, studentId: bodyStudentId } = req.body || {};
    const targetStudentId =
      requestingUser.role === 'admin' && bodyStudentId
        ? String(bodyStudentId)
        : requestingUser.userId;

    if (!courseId) {
      res.status(400).json({
        success: false,
        message: 'courseId is required.',
      });
      return;
    }

    const course = db.courses.find(
      (c) => c.courseId === courseId || c.courseCode === courseId
    );
    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Selected course does not exist.',
      });
      return;
    }

    const student = db.users.find(
      (u) => u.userId === targetStudentId && u.role === 'student'
    );
    if (!student) {
      res.status(404).json({
        success: false,
        message: 'Student account not found.',
      });
      return;
    }

    // Recompute authoritative availableSeats before validation
    const currentOccupied = db.enrollments.filter(
      (e) => e.courseId === course.courseId && e.status === 'Active'
    ).length;
    course.availableSeats = Math.max(0, course.totalSeats - currentOccupied);

    const studentEnrollments = db.enrollments.filter(
      (e) => e.studentId === targetStudentId
    );
    const activeCourseIds = studentEnrollments
      .filter((e) => e.status === 'Active')
      .map((e) => e.courseId);
    const activeCoursesForStudent = db.settings.enforceScheduleClash
      ? db.courses.filter((c) => activeCourseIds.includes(c.courseId))
      : [];

    const validation = validateEnrollmentRequest({
      studentId: targetStudentId,
      targetCourse: course,
      studentEnrollments,
      activeCoursesForStudent,
      registrationDeadlineIso: db.settings.registrationDeadline,
      maxCoursesPerSemester: db.settings.maxCoursesPerSemester || 6,
    });

    if (!validation.allowed) {
      res.status(validation.statusCode).json({
        success: false,
        code: validation.code,
        conflictingCourseCode: validation.conflictingCourseCode,
        message: validation.message,
      });
      return;
    }

    const enrollmentNums = db.enrollments
      .map((e) => parseInt(e.enrollmentId.replace('ENR-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextEnrNum = (enrollmentNums.length ? Math.max(...enrollmentNums) : 5000) + 1;

    const newEnrollment: EnrollmentDoc = {
      enrollmentId: `ENR-${nextEnrNum}`,
      studentId: targetStudentId,
      courseId: course.courseId,
      status: 'Active',
      enrolledAt: new Date().toISOString(),
    };

    db.enrollments.push(newEnrollment);
    course.availableSeats =
      validation.nextAvailableSeats !== undefined
        ? validation.nextAvailableSeats
        : Math.max(0, course.availableSeats - 1);

    // If student was on waitlist for this course, mark waitlisted entry as Promoted
    const waitlistEntry = db.waitlists.find(
      (w) =>
        w.studentId === targetStudentId &&
        w.courseId === course.courseId &&
        w.status === 'Waiting'
    );
    if (waitlistEntry) {
      waitlistEntry.status = 'Promoted';
    }

    saveDatabase();

    res.status(201).json({
      success: true,
      message: validation.message,
      enrollment: enrichEnrollment(newEnrollment),
      course: {
        courseId: course.courseId,
        courseCode: course.courseCode,
        totalSeats: course.totalSeats,
        availableSeats: course.availableSeats,
      },
    });
  });
}

export async function dropCourseEnrollment(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const requestingUser = req.user;
    if (!requestingUser) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    const { id } = req.params;
    // Allow dropping by enrollmentId OR by courseId for the current student
    const enrollment = db.enrollments.find(
      (e) =>
        e.enrollmentId === id ||
        (e.courseId === id &&
          e.studentId === requestingUser.userId &&
          e.status === 'Active')
    );

    if (!enrollment) {
      res.status(404).json({
        success: false,
        message: 'Enrollment record not found.',
      });
      return;
    }

    const course = db.courses.find((c) => c.courseId === enrollment.courseId);
    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Associated course not found.',
      });
      return;
    }

    const validation = validateDropRequest({
      requestingUserId: requestingUser.userId,
      requestingUserRole: requestingUser.role,
      enrollment,
      course,
      dropDeadlineIso: db.settings.dropDeadline,
    });

    if (!validation.allowed) {
      res.status(validation.statusCode).json({
        success: false,
        code: validation.code,
        message: validation.message,
      });
      return;
    }

    enrollment.status = 'Dropped';
    enrollment.droppedAt = new Date().toISOString();

    const remainingActive = db.enrollments.filter(
      (e) => e.courseId === course.courseId && e.status === 'Active'
    ).length;
    course.availableSeats = Math.max(0, course.totalSeats - remainingActive);

    saveDatabase();

    res.status(200).json({
      success: true,
      message: validation.message,
      enrollment: enrichEnrollment(enrollment),
      course: {
        courseId: course.courseId,
        courseCode: course.courseCode,
        totalSeats: course.totalSeats,
        availableSeats: course.availableSeats,
      },
    });
  });
}

export function getStudentEnrollments(
  req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const requestingUser = req.user;
  const { id } = req.params;

  const targetStudentId = id === 'me' ? requestingUser?.userId : id;
  if (!targetStudentId) {
    res.status(400).json({
      success: false,
      message: 'Student ID is required.',
    });
    return;
  }

  // Students can only view their own enrollments; faculty/admin can inspect student records
  if (
    requestingUser?.role === 'student' &&
    requestingUser.userId !== targetStudentId
  ) {
    res.status(403).json({
      success: false,
      message: 'You are only permitted to view your own enrollment records.',
    });
    return;
  }

  const student = db.users.find((u) => u.userId === targetStudentId);
  if (!student) {
    res.status(404).json({
      success: false,
      message: 'Student not found.',
    });
    return;
  }

  const allEnrollments = db.enrollments
    .filter((e) => e.studentId === targetStudentId)
    .map(enrichEnrollment)
    .sort(
      (a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()
    );

  const activeEnrollments = allEnrollments.filter((e) => e.status === 'Active');
  const droppedEnrollments = allEnrollments.filter((e) => e.status === 'Dropped');

  const waitlistEntries = db.waitlists
    .filter((w) => w.studentId === targetStudentId && w.status === 'Waiting')
    .map((w) => {
      const course = db.courses.find((c) => c.courseId === w.courseId);
      const faculty = course
        ? db.users.find((u) => u.userId === course.facultyId)
        : undefined;
      return {
        ...w,
        courseCode: course ? course.courseCode : 'N/A',
        courseTitle: course ? course.title : 'Course',
        semester: course ? course.semester : '',
        schedule: course ? course.schedule : '',
        facultyName: faculty ? faculty.name : 'Unassigned',
      };
    });

  const maxSlots = db.settings.maxCoursesPerSemester || 6;
  const availableCoursesCount = db.courses.filter((c) => {
    const activeCount = db.enrollments.filter(
      (e) => e.courseId === c.courseId && e.status === 'Active'
    ).length;
    return c.totalSeats - activeCount > 0;
  }).length;

  res.status(200).json({
    success: true,
    student: {
      userId: student.userId,
      name: student.name,
      email: student.email,
      department: student.department,
      semester: student.semester || 'Fall 2026',
    },
    stats: {
      totalCoursesEnrolled: activeEnrollments.length,
      remainingSlots: Math.max(0, maxSlots - activeEnrollments.length),
      maxSlots,
      availableCourses: availableCoursesCount,
      activeEnrollments: activeEnrollments.length,
      droppedEnrollments: droppedEnrollments.length,
      totalCredits: activeEnrollments.reduce((sum, e) => sum + (e.credits || 0), 0),
    },
    enrollments: allEnrollments,
    activeEnrollments,
    droppedEnrollments,
    waitlists: waitlistEntries,
    settings: db.settings,
  });
}

export function getCourseEnrollments(
  req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const requestingUser = req.user;
  const { id } = req.params;
  const { search } = req.query;

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

  // Faculty must only access courses assigned to them
  if (
    requestingUser?.role === 'faculty' &&
    course.facultyId !== requestingUser.userId
  ) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Faculty members can only view students in their assigned courses.',
    });
    return;
  }

  let roster = db.enrollments
    .filter((e) => e.courseId === course.courseId && e.status === 'Active')
    .map(enrichEnrollment);

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    roster = roster.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.studentEmail.toLowerCase().includes(q) ||
        r.studentDepartment.toLowerCase().includes(q)
    );
  }

  const faculty = db.users.find((u) => u.userId === course.facultyId);
  const occupiedSeats = db.enrollments.filter(
    (e) => e.courseId === course.courseId && e.status === 'Active'
  ).length;

  res.status(200).json({
    success: true,
    course: {
      ...course,
      occupiedSeats,
      availableSeats: Math.max(0, course.totalSeats - occupiedSeats),
      facultyName: faculty ? faculty.name : 'Unassigned',
    },
    count: roster.length,
    students: roster,
  });
}

export function getAllEnrollments(
  req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const { courseId, studentId, semester, status, search } = req.query;

  let list = db.enrollments.map(enrichEnrollment);

  if (courseId && courseId !== 'all') {
    list = list.filter((e) => e.courseId === String(courseId));
  }

  if (studentId && studentId !== 'all') {
    list = list.filter((e) => e.studentId === String(studentId));
  }

  if (semester && semester !== 'all') {
    list = list.filter((e) => e.semester === String(semester));
  }

  if (status && status !== 'all') {
    list = list.filter(
      (e) => e.status.toLowerCase() === String(status).toLowerCase()
    );
  }

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.studentName.toLowerCase().includes(q) ||
        e.studentId.toLowerCase().includes(q) ||
        e.courseCode.toLowerCase().includes(q) ||
        e.courseTitle.toLowerCase().includes(q) ||
        e.enrollmentId.toLowerCase().includes(q)
    );
  }

  list.sort(
    (a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()
  );

  res.status(200).json({
    success: true,
    count: list.length,
    enrollments: list,
  });
}

export async function joinWaitlist(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const requestingUser = req.user;
    if (!requestingUser) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    const { courseId } = req.body || {};
    const course = db.courses.find((c) => c.courseId === courseId);
    if (!course) {
      res.status(404).json({
        success: false,
        message: 'Course not found.',
      });
      return;
    }

    const alreadyEnrolled = db.enrollments.some(
      (e) =>
        e.studentId === requestingUser.userId &&
        e.courseId === course.courseId &&
        e.status === 'Active'
    );
    if (alreadyEnrolled) {
      res.status(409).json({
        success: false,
        message: 'You are already enrolled in this course.',
      });
      return;
    }

    const alreadyWaiting = db.waitlists.find(
      (w) =>
        w.studentId === requestingUser.userId &&
        w.courseId === course.courseId &&
        w.status === 'Waiting'
    );
    if (alreadyWaiting) {
      res.status(409).json({
        success: false,
        message: `You are already on the waitlist for ${course.courseCode} (Position #${alreadyWaiting.position}).`,
      });
      return;
    }

    const currentCourseWaitlist = db.waitlists.filter(
      (w) => w.courseId === course.courseId && w.status === 'Waiting'
    );
    const nextPosition = currentCourseWaitlist.length + 1;

    const nums = db.waitlists
      .map((w) => parseInt(w.waitlistId.replace('WL-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextWlNum = (nums.length ? Math.max(...nums) : 3000) + 1;

    const entry: WaitlistDoc = {
      waitlistId: `WL-${nextWlNum}`,
      studentId: requestingUser.userId,
      courseId: course.courseId,
      position: nextPosition,
      status: 'Waiting',
      createdAt: new Date().toISOString(),
    };

    db.waitlists.push(entry);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: `Added to waitlist for ${course.courseCode} (${course.title}) at position #${nextPosition}.`,
      waitlist: entry,
    });
  });
}

export async function leaveWaitlist(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const requestingUser = req.user;
    const { id } = req.params;

    const entry = db.waitlists.find(
      (w) =>
        w.waitlistId === id ||
        (w.courseId === id &&
          w.studentId === requestingUser?.userId &&
          w.status === 'Waiting')
    );

    if (!entry) {
      res.status(404).json({
        success: false,
        message: 'Waitlist entry not found.',
      });
      return;
    }

    entry.status = 'Cancelled';
    saveDatabase();

    res.status(200).json({
      success: true,
      message: 'Removed from course waitlist.',
    });
  });
}
