export interface ParsedSchedule {
  days: string[];
  startMinutes: number;
  endMinutes: number;
  raw: string;
}

export interface CourseRecord {
  courseId: string;
  courseCode: string;
  title: string;
  description: string;
  department: string;
  credits: number;
  facultyId: string;
  facultyName?: string;
  totalSeats: number;
  availableSeats: number;
  semester: string;
  schedule: string;
  room: string;
  createdAt: string;
}

export interface EnrollmentRecord {
  enrollmentId: string;
  studentId: string;
  courseId: string;
  status: 'Active' | 'Dropped';
  enrolledAt: string;
  droppedAt?: string;
}

export const ENROLL_SUCCESS_MESSAGE =
  'Congratulations! You have successfully enrolled in this course.';
export const COURSE_FULL_MESSAGE =
  'Sorry! No seats available for this course.';

/**
 * Parses a schedule string such as "Mon/Wed 09:00-10:30" or "Tue/Thu 13:30-15:00"
 */
export function parseScheduleSlot(scheduleStr: string): ParsedSchedule | null {
  if (!scheduleStr || typeof scheduleStr !== 'string') return null;
  const trimmed = scheduleStr.trim();
  const match = trimmed.match(/^([A-Za-z/]+)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const daysPart = match[1];
  const startH = parseInt(match[2], 10);
  const startM = parseInt(match[3], 10);
  const endH = parseInt(match[4], 10);
  const endM = parseInt(match[5], 10);

  const days = daysPart
    .split('/')
    .map((d) => d.trim().slice(0, 3).toLowerCase())
    .filter(Boolean);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (days.length === 0 || endMinutes <= startMinutes) {
    return null;
  }

  return {
    days,
    startMinutes,
    endMinutes,
    raw: trimmed,
  };
}

/**
 * Checks whether two schedule strings overlap in both day and time.
 */
export function hasScheduleOverlap(scheduleA: string, scheduleB: string): boolean {
  const parsedA = parseScheduleSlot(scheduleA);
  const parsedB = parseScheduleSlot(scheduleB);
  if (!parsedA || !parsedB) return false;

  const sharesDay = parsedA.days.some((day) => parsedB.days.includes(day));
  if (!sharesDay) return false;

  return parsedA.startMinutes < parsedB.endMinutes && parsedB.startMinutes < parsedA.endMinutes;
}

/**
 * Detects if a candidate course clashes with any of the student's active courses in the same semester.
 */
export function detectScheduleClash(
  candidateCourse: Pick<CourseRecord, 'courseId' | 'courseCode' | 'title' | 'semester' | 'schedule'>,
  activeCourses: Array<Pick<CourseRecord, 'courseId' | 'courseCode' | 'title' | 'semester' | 'schedule'>>
): { clashing: boolean; conflictingCourse?: Pick<CourseRecord, 'courseId' | 'courseCode' | 'title' | 'semester' | 'schedule'> } {
  for (const existing of activeCourses) {
    if (existing.courseId === candidateCourse.courseId) continue;
    if (existing.semester !== candidateCourse.semester) continue;
    if (hasScheduleOverlap(candidateCourse.schedule, existing.schedule)) {
      return { clashing: true, conflictingCourse: existing };
    }
  }
  return { clashing: false };
}

export interface EnrollmentValidationInput {
  studentId: string;
  targetCourse: CourseRecord;
  studentEnrollments: EnrollmentRecord[];
  activeCoursesForStudent: CourseRecord[];
  registrationDeadlineIso?: string;
  nowIso?: string;
  maxCoursesPerSemester?: number;
}

export interface EnrollmentValidationResult {
  allowed: boolean;
  statusCode: number;
  code:
    | 'OK'
    | 'UNAUTHENTICATED'
    | 'DEADLINE_PASSED'
    | 'DUPLICATE_ENROLLMENT'
    | 'COURSE_FULL'
    | 'SCHEDULE_CLASH'
    | 'MAX_LOAD_REACHED';
  message: string;
  nextAvailableSeats?: number;
  conflictingCourseCode?: string;
}

/**
 * Pure validation & atomic seat computation for Step 4-7 of the Enrollment Logic.
 */
export function validateEnrollmentRequest(
  input: EnrollmentValidationInput
): EnrollmentValidationResult {
  const {
    studentId,
    targetCourse,
    studentEnrollments,
    activeCoursesForStudent,
    registrationDeadlineIso,
    nowIso = new Date().toISOString(),
    maxCoursesPerSemester = 6,
  } = input;

  if (!studentId || !studentId.trim()) {
    return {
      allowed: false,
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required to enroll in courses.',
    };
  }

  if (registrationDeadlineIso) {
    const nowTime = new Date(nowIso).getTime();
    const deadlineTime = new Date(registrationDeadlineIso).getTime();
    if (!Number.isNaN(deadlineTime) && nowTime > deadlineTime) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'DEADLINE_PASSED',
        message: 'Registration deadline has passed for this semester.',
      };
    }
  }

  // Compound index check: never allow duplicate active enrollment for (studentId, courseId)
  const alreadyActive = studentEnrollments.some(
    (e) =>
      e.studentId === studentId &&
      e.courseId === targetCourse.courseId &&
      e.status === 'Active'
  );
  if (alreadyActive) {
    return {
      allowed: false,
      statusCode: 409,
      code: 'DUPLICATE_ENROLLMENT',
      message: `You are already actively enrolled in ${targetCourse.courseCode} (${targetCourse.title}).`,
    };
  }

  // Seat availability check: never allow enrollment when availableSeats <= 0
  if (targetCourse.availableSeats <= 0) {
    return {
      allowed: false,
      statusCode: 400,
      code: 'COURSE_FULL',
      message: COURSE_FULL_MESSAGE,
    };
  }

  // Check semester course limit
  const sameSemesterCount = activeCoursesForStudent.filter(
    (c) => c.semester === targetCourse.semester
  ).length;
  if (sameSemesterCount >= maxCoursesPerSemester) {
    return {
      allowed: false,
      statusCode: 400,
      code: 'MAX_LOAD_REACHED',
      message: `Maximum semester enrollment limit (${maxCoursesPerSemester} courses) reached for ${targetCourse.semester}.`,
    };
  }

  // Check timetable clash
  const clash = detectScheduleClash(targetCourse, activeCoursesForStudent);
  if (clash.clashing && clash.conflictingCourse) {
    return {
      allowed: false,
      statusCode: 409,
      code: 'SCHEDULE_CLASH',
      conflictingCourseCode: clash.conflictingCourse.courseCode,
      message: `Timetable clash detected with ${clash.conflictingCourse.courseCode} (${clash.conflictingCourse.schedule}).`,
    };
  }

  const nextAvailableSeats = Math.max(0, targetCourse.availableSeats - 1);

  return {
    allowed: true,
    statusCode: 201,
    code: 'OK',
    message: ENROLL_SUCCESS_MESSAGE,
    nextAvailableSeats,
  };
}

export interface DropValidationInput {
  requestingUserId: string;
  requestingUserRole: 'student' | 'faculty' | 'admin';
  enrollment: EnrollmentRecord;
  course: CourseRecord;
  dropDeadlineIso?: string;
  nowIso?: string;
}

export interface DropValidationResult {
  allowed: boolean;
  statusCode: number;
  code:
    | 'OK'
    | 'FORBIDDEN'
    | 'ALREADY_DROPPED'
    | 'DROP_DEADLINE_PASSED';
  message: string;
  nextAvailableSeats?: number;
}

/**
 * Pure validation & seat restoration calculation for Drop Course Logic.
 */
export function validateDropRequest(input: DropValidationInput): DropValidationResult {
  const {
    requestingUserId,
    requestingUserRole,
    enrollment,
    course,
    dropDeadlineIso,
    nowIso = new Date().toISOString(),
  } = input;

  if (requestingUserRole !== 'admin' && enrollment.studentId !== requestingUserId) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You are only authorized to drop your own course enrollments.',
    };
  }

  if (enrollment.status === 'Dropped') {
    return {
      allowed: false,
      statusCode: 400,
      code: 'ALREADY_DROPPED',
      message: 'This course enrollment has already been dropped.',
    };
  }

  if (dropDeadlineIso && requestingUserRole !== 'admin') {
    const nowTime = new Date(nowIso).getTime();
    const deadlineTime = new Date(dropDeadlineIso).getTime();
    if (!Number.isNaN(deadlineTime) && nowTime > deadlineTime) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'DROP_DEADLINE_PASSED',
        message: 'The course drop deadline has passed. Please contact the Academic Registrar.',
      };
    }
  }

  const nextAvailableSeats = Math.min(course.totalSeats, course.availableSeats + 1);

  return {
    allowed: true,
    statusCode: 200,
    code: 'OK',
    message: `Successfully dropped ${course.courseCode} (${course.title}).`,
    nextAvailableSeats,
  };
}

/**
 * Validates and computes new availableSeats when an administrator updates totalSeats.
 */
export function validateSeatCapacityUpdate(
  currentTotalSeats: number,
  currentAvailableSeats: number,
  newTotalSeats: number
): { valid: boolean; occupiedSeats: number; nextAvailableSeats: number; message?: string } {
  const occupiedSeats = Math.max(0, currentTotalSeats - currentAvailableSeats);
  if (!Number.isInteger(newTotalSeats) || newTotalSeats < 1) {
    return {
      valid: false,
      occupiedSeats,
      nextAvailableSeats: currentAvailableSeats,
      message: 'Total seat capacity must be a positive integer.',
    };
  }
  if (newTotalSeats < occupiedSeats) {
    return {
      valid: false,
      occupiedSeats,
      nextAvailableSeats: currentAvailableSeats,
      message: `Cannot reduce total seats to ${newTotalSeats} because ${occupiedSeats} seats are currently occupied by active students.`,
    };
  }
  return {
    valid: true,
    occupiedSeats,
    nextAvailableSeats: newTotalSeats - occupiedSeats,
  };
}
