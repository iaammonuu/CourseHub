import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_FULL_MESSAGE,
  ENROLL_SUCCESS_MESSAGE,
  detectScheduleClash,
  hasScheduleOverlap,
  parseScheduleSlot,
  validateDropRequest,
  validateEnrollmentRequest,
  validateSeatCapacityUpdate,
  type CourseRecord,
  type EnrollmentRecord,
} from './enrollmentRules';

const sampleCourse: CourseRecord = {
  courseId: 'CRS-101',
  courseCode: 'CS301',
  title: 'Distributed Systems & Cloud Architecture',
  description: 'Consensus protocols, replication, fault tolerance, and microservices.',
  department: 'Computer Science',
  credits: 4,
  facultyId: 'FAC-1',
  facultyName: 'Dr. Elena Rostova',
  totalSeats: 30,
  availableSeats: 5,
  semester: 'Fall 2026',
  schedule: 'Mon/Wed 10:00-11:30',
  room: 'Gates Hall 302',
  createdAt: '2026-08-01T00:00:00.000Z',
};

test('parseScheduleSlot and hasScheduleOverlap accurately detect timetable collisions', () => {
  const parsed = parseScheduleSlot('Mon/Wed 10:00-11:30');
  assert.ok(parsed);
  assert.deepEqual(parsed.days, ['mon', 'wed']);
  assert.equal(parsed.startMinutes, 600);
  assert.equal(parsed.endMinutes, 690);

  assert.equal(hasScheduleOverlap('Mon/Wed 10:00-11:30', 'Wed/Fri 11:00-12:30'), true);
  assert.equal(hasScheduleOverlap('Mon/Wed 10:00-11:30', 'Tue/Thu 10:00-11:30'), false);
  assert.equal(hasScheduleOverlap('Mon/Wed 10:00-11:30', 'Mon/Wed 11:30-13:00'), false);
});

test('validateEnrollmentRequest succeeds and decrements availableSeats by 1', () => {
  const res = validateEnrollmentRequest({
    studentId: 'STU-1001',
    targetCourse: sampleCourse,
    studentEnrollments: [],
    activeCoursesForStudent: [],
  });

  assert.equal(res.allowed, true);
  assert.equal(res.code, 'OK');
  assert.equal(res.message, ENROLL_SUCCESS_MESSAGE);
  assert.equal(res.nextAvailableSeats, 4);
});

test('validateEnrollmentRequest blocks duplicate active enrollment', () => {
  const existingEnrollment: EnrollmentRecord = {
    enrollmentId: 'ENR-1',
    studentId: 'STU-1001',
    courseId: 'CRS-101',
    status: 'Active',
    enrolledAt: '2026-09-01T00:00:00.000Z',
  };

  const res = validateEnrollmentRequest({
    studentId: 'STU-1001',
    targetCourse: sampleCourse,
    studentEnrollments: [existingEnrollment],
    activeCoursesForStudent: [sampleCourse],
  });

  assert.equal(res.allowed, false);
  assert.equal(res.code, 'DUPLICATE_ENROLLMENT');
  assert.equal(res.statusCode, 409);
});

test('validateEnrollmentRequest blocks full course with exact required message and never goes negative', () => {
  const fullCourse: CourseRecord = { ...sampleCourse, availableSeats: 0 };
  const res = validateEnrollmentRequest({
    studentId: 'STU-1001',
    targetCourse: fullCourse,
    studentEnrollments: [],
    activeCoursesForStudent: [],
  });

  assert.equal(res.allowed, false);
  assert.equal(res.code, 'COURSE_FULL');
  assert.equal(res.message, COURSE_FULL_MESSAGE);
});

test('validateEnrollmentRequest blocks timetable clashes in the same semester', () => {
  const conflictingCourse: CourseRecord = {
    ...sampleCourse,
    courseId: 'CRS-202',
    courseCode: 'DS204',
    title: 'Statistical Machine Learning',
    schedule: 'Wed/Fri 10:30-12:00',
  };

  const clashCheck = detectScheduleClash(sampleCourse, [conflictingCourse]);
  assert.equal(clashCheck.clashing, true);

  const res = validateEnrollmentRequest({
    studentId: 'STU-1001',
    targetCourse: sampleCourse,
    studentEnrollments: [],
    activeCoursesForStudent: [conflictingCourse],
  });

  assert.equal(res.allowed, false);
  assert.equal(res.code, 'SCHEDULE_CLASH');
  assert.equal(res.conflictingCourseCode, 'DS204');
});

test('validateDropRequest enforces ownership, deadline, single-drop rule, and increments seat', () => {
  const activeEnrollment: EnrollmentRecord = {
    enrollmentId: 'ENR-1',
    studentId: 'STU-1001',
    courseId: 'CRS-101',
    status: 'Active',
    enrolledAt: '2026-09-01T00:00:00.000Z',
  };

  // Unauthorized student
  const unauth = validateDropRequest({
    requestingUserId: 'STU-9999',
    requestingUserRole: 'student',
    enrollment: activeEnrollment,
    course: sampleCourse,
  });
  assert.equal(unauth.allowed, false);
  assert.equal(unauth.code, 'FORBIDDEN');

  // Valid drop
  const valid = validateDropRequest({
    requestingUserId: 'STU-1001',
    requestingUserRole: 'student',
    enrollment: activeEnrollment,
    course: sampleCourse,
    dropDeadlineIso: '2027-04-30T23:59:59.000Z',
    nowIso: '2026-11-14T00:00:00.000Z',
  });
  assert.equal(valid.allowed, true);
  assert.equal(valid.nextAvailableSeats, 6);

  // Prevent dropping same course twice
  const droppedEnrollment: EnrollmentRecord = { ...activeEnrollment, status: 'Dropped' };
  const duplicateDrop = validateDropRequest({
    requestingUserId: 'STU-1001',
    requestingUserRole: 'student',
    enrollment: droppedEnrollment,
    course: sampleCourse,
  });
  assert.equal(duplicateDrop.allowed, false);
  assert.equal(duplicateDrop.code, 'ALREADY_DROPPED');
});

test('validateSeatCapacityUpdate prevents reducing capacity below occupied seats', () => {
  // 30 total, 5 available => 25 occupied
  const invalid = validateSeatCapacityUpdate(30, 5, 20);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.occupiedSeats, 25);

  const valid = validateSeatCapacityUpdate(30, 5, 40);
  assert.equal(valid.valid, true);
  assert.equal(valid.occupiedSeats, 25);
  assert.equal(valid.nextAvailableSeats, 15);
});
