import type { Response } from 'express';
import {
  getDb,
  resetToSeedData,
  runAtomic,
  saveDatabase,
  type ReportDoc,
} from '../config/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function getEnrollmentsReport(
  _req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();

  const students = db.users.filter((u) => u.role === 'student');
  const faculty = db.users.filter((u) => u.role === 'faculty');
  const activeEnrollments = db.enrollments.filter((e) => e.status === 'Active');
  const droppedEnrollments = db.enrollments.filter((e) => e.status === 'Dropped');

  const courseStats = db.courses.map((course) => {
    const activeCount = activeEnrollments.filter(
      (e) => e.courseId === course.courseId
    ).length;
    const droppedCount = droppedEnrollments.filter(
      (e) => e.courseId === course.courseId
    ).length;
    const available = Math.max(0, course.totalSeats - activeCount);
    const fac = faculty.find((f) => f.userId === course.facultyId);
    const waitlistCount = db.waitlists.filter(
      (w) => w.courseId === course.courseId && w.status === 'Waiting'
    ).length;

    return {
      courseId: course.courseId,
      courseCode: course.courseCode,
      title: course.title,
      department: course.department,
      semester: course.semester,
      facultyName: fac ? fac.name : 'Unassigned',
      totalSeats: course.totalSeats,
      occupiedSeats: activeCount,
      availableSeats: available,
      droppedCount,
      waitlistCount,
      fillRate:
        course.totalSeats > 0
          ? Math.round((activeCount / course.totalSeats) * 100)
          : 0,
      popularityScore: activeCount + waitlistCount,
    };
  });

  const totalSeatsCapacity = courseStats.reduce((s, c) => s + c.totalSeats, 0);
  const totalAvailableSeats = courseStats.reduce((s, c) => s + c.availableSeats, 0);
  const totalOccupiedSeats = courseStats.reduce((s, c) => s + c.occupiedSeats, 0);
  const fullyOccupiedCourses = courseStats.filter(
    (c) => c.availableSeats === 0
  ).length;

  // Department-wise breakdown
  const departmentMap = new Map<
    string,
    { department: string; enrollments: number; courses: number; students: number }
  >();

  db.courses.forEach((c) => {
    const curr = departmentMap.get(c.department) || {
      department: c.department,
      enrollments: 0,
      courses: 0,
      students: 0,
    };
    curr.courses += 1;
    const activeForCourse = activeEnrollments.filter(
      (e) => e.courseId === c.courseId
    ).length;
    curr.enrollments += activeForCourse;
    departmentMap.set(c.department, curr);
  });

  students.forEach((s) => {
    const curr = departmentMap.get(s.department) || {
      department: s.department,
      enrollments: 0,
      courses: 0,
      students: 0,
    };
    curr.students += 1;
    departmentMap.set(s.department, curr);
  });

  const departmentBreakdown = Array.from(departmentMap.values());

  // Top popularity ranking
  const popularityRanking = [...courseStats].sort(
    (a, b) => b.popularityScore - a.popularityScore || b.fillRate - a.fillRate
  );

  // Enriched active and dropped lists
  const enrichRecord = (enr: (typeof db.enrollments)[number]) => {
    const stu = db.users.find((u) => u.userId === enr.studentId);
    const crs = db.courses.find((c) => c.courseId === enr.courseId);
    const fac = crs ? db.users.find((u) => u.userId === crs.facultyId) : undefined;
    return {
      enrollmentId: enr.enrollmentId,
      studentId: enr.studentId,
      studentName: stu ? stu.name : 'Unknown Student',
      studentEmail: stu ? stu.email : '',
      studentDepartment: stu ? stu.department : '',
      courseId: enr.courseId,
      courseCode: crs ? crs.courseCode : 'N/A',
      courseTitle: crs ? crs.title : 'N/A',
      semester: crs ? crs.semester : 'N/A',
      facultyName: fac ? fac.name : 'Unassigned',
      status: enr.status,
      enrolledAt: enr.enrolledAt,
      droppedAt: enr.droppedAt || null,
    };
  };

  res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    summaryCards: {
      totalCourses: db.courses.length,
      totalStudents: students.length,
      totalFaculty: faculty.length,
      totalActiveEnrollments: activeEnrollments.length,
      totalDroppedEnrollments: droppedEnrollments.length,
      totalSeatsCapacity,
      availableSeats: totalAvailableSeats,
      occupiedSeats: totalOccupiedSeats,
      fullyOccupiedCourses,
    },
    charts: {
      courseWiseEnrollment: courseStats.map((c) => ({
        courseCode: c.courseCode,
        title: c.title,
        enrolled: c.occupiedSeats,
        available: c.availableSeats,
        totalSeats: c.totalSeats,
      })),
      seatsFilledVsAvailable: {
        occupied: totalOccupiedSeats,
        available: totalAvailableSeats,
        total: totalSeatsCapacity,
      },
      departmentWiseEnrollment: departmentBreakdown,
      activeVsDropped: {
        active: activeEnrollments.length,
        dropped: droppedEnrollments.length,
        waitlisted: db.waitlists.filter((w) => w.status === 'Waiting').length,
      },
      coursePopularity: popularityRanking.map((c) => ({
        courseCode: c.courseCode,
        title: c.title,
        fillRate: c.fillRate,
        enrolled: c.occupiedSeats,
        waitlistCount: c.waitlistCount,
      })),
    },
    activeEnrollmentsReport: activeEnrollments.map(enrichRecord),
    droppedEnrollmentsReport: droppedEnrollments.map(enrichRecord),
    savedReports: db.reports,
  });
}

export function getCoursesReport(
  _req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const reportRows = db.courses.map((course) => {
    const activeCount = db.enrollments.filter(
      (e) => e.courseId === course.courseId && e.status === 'Active'
    ).length;
    const droppedCount = db.enrollments.filter(
      (e) => e.courseId === course.courseId && e.status === 'Dropped'
    ).length;
    const availableSeats = Math.max(0, course.totalSeats - activeCount);
    const faculty = db.users.find((u) => u.userId === course.facultyId);

    return {
      courseId: course.courseId,
      courseCode: course.courseCode,
      title: course.title,
      department: course.department,
      semester: course.semester,
      schedule: course.schedule,
      facultyId: course.facultyId,
      facultyName: faculty ? faculty.name : 'Unassigned',
      totalSeats: course.totalSeats,
      occupiedSeats: activeCount,
      availableSeats,
      droppedCount,
      utilizationPercent:
        course.totalSeats > 0
          ? Math.round((activeCount / course.totalSeats) * 100)
          : 0,
      status: availableSeats === 0 ? 'Full' : 'Seats Available',
    };
  });

  res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    count: reportRows.length,
    coursesReport: reportRows,
  });
}

export function getStudentsReport(
  _req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const students = db.users.filter((u) => u.role === 'student');

  const studentRows = students.map((student) => {
    const enrollments = db.enrollments.filter(
      (e) => e.studentId === student.userId
    );
    const active = enrollments.filter((e) => e.status === 'Active');
    const dropped = enrollments.filter((e) => e.status === 'Dropped');

    const activeCourseCodes = active
      .map((e) => {
        const c = db.courses.find((course) => course.courseId === e.courseId);
        return c ? c.courseCode : e.courseId;
      })
      .join(', ');

    const totalCredits = active.reduce((sum, e) => {
      const c = db.courses.find((course) => course.courseId === e.courseId);
      return sum + (c ? c.credits : 0);
    }, 0);

    return {
      userId: student.userId,
      name: student.name,
      email: student.email,
      department: student.department,
      semester: student.semester || 'Fall 2026',
      activeCoursesCount: active.length,
      droppedCoursesCount: dropped.length,
      totalCredits,
      activeCourseCodes: activeCourseCodes || 'None',
      createdAt: student.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    count: studentRows.length,
    studentsReport: studentRows,
  });
}

export async function generateSnapshotReport(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { reportType = 'Comprehensive Audit', title } = req.body || {};

    const nums = db.reports
      .map((r) => parseInt(r.reportId.replace('RPT-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextNum = (nums.length ? Math.max(...nums) : 1000) + 1;

    const totalCourses = db.courses.length;
    const totalStudents = db.users.filter((u) => u.role === 'student').length;
    const totalEnrollments = db.enrollments.filter(
      (e) => e.status === 'Active'
    ).length;

    const newReport: ReportDoc = {
      reportId: `RPT-${nextNum}`,
      reportType: String(reportType),
      title:
        title && String(title).trim()
          ? String(title).trim()
          : `${reportType} – ${new Date().toLocaleDateString('en-US')}`,
      totalCourses,
      totalStudents,
      totalEnrollments,
      generatedBy: req.user
        ? `${req.user.name} (${req.user.userId})`
        : 'System Administrator',
      generatedAt: new Date().toISOString(),
    };

    db.reports.unshift(newReport);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: `Report ${newReport.reportId} generated and archived in MongoDB REPORTS collection.`,
      report: newReport,
    });
  });
}

export function getSystemSettings(
  _req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  res.status(200).json({
    success: true,
    settings: db.settings,
  });
}

export async function updateSystemSettings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const {
      currentSemester,
      registrationDeadline,
      dropDeadline,
      maxCoursesPerSemester,
      allowWaitlist,
      autoPromoteWaitlist,
      enforceScheduleClash,
      universityName,
      academicYear,
    } = req.body || {};

    if (currentSemester) db.settings.currentSemester = String(currentSemester);
    if (registrationDeadline)
      db.settings.registrationDeadline = String(registrationDeadline);
    if (dropDeadline) db.settings.dropDeadline = String(dropDeadline);
    if (maxCoursesPerSemester !== undefined)
      db.settings.maxCoursesPerSemester = Math.max(
        1,
        Number(maxCoursesPerSemester) || 6
      );
    if (allowWaitlist !== undefined)
      db.settings.allowWaitlist = Boolean(allowWaitlist);
    if (autoPromoteWaitlist !== undefined)
      db.settings.autoPromoteWaitlist = Boolean(autoPromoteWaitlist);
    if (enforceScheduleClash !== undefined)
      db.settings.enforceScheduleClash = Boolean(enforceScheduleClash);
    if (universityName) db.settings.universityName = String(universityName);
    if (academicYear) db.settings.academicYear = String(academicYear);

    db.settings.updatedAt = new Date().toISOString();
    saveDatabase();

    res.status(200).json({
      success: true,
      message: 'University registration settings and deadlines updated.',
      settings: db.settings,
    });
  });
}

export async function resetDemoDatabase(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const fresh = resetToSeedData();
    res.status(200).json({
      success: true,
      message: 'Database reset to default university demo seed data.',
      counts: {
        users: fresh.users.length,
        courses: fresh.courses.length,
        enrollments: fresh.enrollments.length,
      },
    });
  });
}
