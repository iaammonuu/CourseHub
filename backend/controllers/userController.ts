import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, runAtomic, saveDatabase, type UserDoc } from '../config/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function getFacultyDashboard(
  req: AuthenticatedRequest,
  res: Response
): void {
  const db = getDb();
  const facultyId = req.user?.userId;
  const faculty = db.users.find((u) => u.userId === facultyId);

  if (!faculty) {
    res.status(404).json({
      success: false,
      message: 'Faculty profile not found.',
    });
    return;
  }

  const assignedCourses = db.courses
    .filter((c) => c.facultyId === faculty.userId)
    .map((course) => {
      const activeEnrollments = db.enrollments.filter(
        (e) => e.courseId === course.courseId && e.status === 'Active'
      );
      const occupiedSeats = activeEnrollments.length;
      const availableSeats = Math.max(0, course.totalSeats - occupiedSeats);

      const students = activeEnrollments.map((enr) => {
        const student = db.users.find((u) => u.userId === enr.studentId);
        return {
          enrollmentId: enr.enrollmentId,
          studentId: enr.studentId,
          name: student ? student.name : 'Unknown Student',
          email: student ? student.email : '',
          department: student ? student.department : '',
          semester: student ? student.semester || course.semester : course.semester,
          phone: student ? student.phone || '' : '',
          enrolledAt: enr.enrolledAt,
          status: enr.status,
        };
      });

      return {
        ...course,
        occupiedSeats,
        availableSeats,
        fillPercentage:
          course.totalSeats > 0
            ? Math.round((occupiedSeats / course.totalSeats) * 100)
            : 0,
        students,
      };
    });

  const totalEnrolledStudents = assignedCourses.reduce(
    (sum, c) => sum + c.occupiedSeats,
    0
  );
  const totalAvailableSeats = assignedCourses.reduce(
    (sum, c) => sum + c.availableSeats,
    0
  );
  const totalCapacitySeats = assignedCourses.reduce(
    (sum, c) => sum + c.totalSeats,
    0
  );

  res.status(200).json({
    success: true,
    faculty: {
      userId: faculty.userId,
      name: faculty.name,
      email: faculty.email,
      department: faculty.department,
      title: faculty.title || 'Faculty Member',
      phone: faculty.phone || '',
    },
    stats: {
      assignedCourses: assignedCourses.length,
      totalEnrolledStudents,
      totalAvailableSeats,
      totalCapacitySeats,
    },
    courses: assignedCourses,
  });
}

export function getAllStudents(req: AuthenticatedRequest, res: Response): void {
  const db = getDb();
  const { search, department, semester } = req.query;

  let students = db.users
    .filter((u) => u.role === 'student')
    .map((student) => {
      const studentEnrollments = db.enrollments.filter(
        (e) => e.studentId === student.userId
      );
      const activeEnrollments = studentEnrollments.filter(
        (e) => e.status === 'Active'
      );
      const droppedEnrollments = studentEnrollments.filter(
        (e) => e.status === 'Dropped'
      );

      const enrolledCourses = activeEnrollments.map((enr) => {
        const c = db.courses.find((course) => course.courseId === enr.courseId);
        return {
          enrollmentId: enr.enrollmentId,
          courseId: enr.courseId,
          courseCode: c ? c.courseCode : 'N/A',
          title: c ? c.title : 'Unknown Course',
          semester: c ? c.semester : '',
          credits: c ? c.credits : 0,
          enrolledAt: enr.enrolledAt,
        };
      });

      const { password: _pw, ...safeStudent } = student;
      return {
        ...safeStudent,
        activeEnrollmentsCount: activeEnrollments.length,
        droppedEnrollmentsCount: droppedEnrollments.length,
        totalCredits: enrolledCourses.reduce((s, c) => s + (c.credits || 0), 0),
        enrolledCourses,
      };
    });

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    students = students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.userId.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }

  if (department && department !== 'all') {
    students = students.filter((s) => s.department === String(department));
  }

  if (semester && semester !== 'all') {
    students = students.filter((s) => s.semester === String(semester));
  }

  res.status(200).json({
    success: true,
    count: students.length,
    students,
  });
}

export async function createStudentByAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const {
      name,
      email,
      password = 'student123',
      department = 'Computer Science',
      semester = 'Fall 2026',
      phone = '',
    } = req.body || {};

    if (!name || !email) {
      res.status(400).json({
        success: false,
        message: 'Student name and email are required.',
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
      return;
    }

    const studentNumbers = db.users
      .filter((u) => u.userId.startsWith('STU-'))
      .map((u) => parseInt(u.userId.replace('STU-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextNum = (studentNumbers.length ? Math.max(...studentNumbers) : 2000) + 1;

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newStudent: UserDoc = {
      userId: `STU-${nextNum}`,
      name: String(name).trim(),
      role: 'student',
      email: normalizedEmail,
      password: hashedPassword,
      department: String(department).trim(),
      semester: String(semester).trim(),
      phone: String(phone).trim(),
      createdAt: new Date().toISOString(),
    };

    db.users.push(newStudent);
    saveDatabase();

    const { password: _pw, ...safeStudent } = newStudent;
    res.status(201).json({
      success: true,
      message: `Student ${newStudent.name} (${newStudent.userId}) created successfully.`,
      student: safeStudent,
    });
  });
}

export async function updateStudentByAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const student = db.users.find((u) => u.userId === id && u.role === 'student');

    if (!student) {
      res.status(404).json({
        success: false,
        message: 'Student account not found.',
      });
      return;
    }

    const { name, email, department, semester, phone } = req.body || {};
    if (name && String(name).trim()) student.name = String(name).trim();
    if (email && String(email).trim()) {
      const normalized = String(email).trim().toLowerCase();
      const dup = db.users.find(
        (u) => u.email.toLowerCase() === normalized && u.userId !== student.userId
      );
      if (dup) {
        res.status(409).json({
          success: false,
          message: 'Email address is already in use.',
        });
        return;
      }
      student.email = normalized;
    }
    if (department && String(department).trim())
      student.department = String(department).trim();
    if (semester && String(semester).trim()) student.semester = String(semester).trim();
    if (phone !== undefined) student.phone = String(phone).trim();

    saveDatabase();
    const { password: _pw, ...safeStudent } = student;

    res.status(200).json({
      success: true,
      message: `Student ${student.name} updated successfully.`,
      student: safeStudent,
    });
  });
}

export async function deleteStudentByAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const index = db.users.findIndex((u) => u.userId === id && u.role === 'student');

    if (index === -1) {
      res.status(404).json({
        success: false,
        message: 'Student account not found.',
      });
      return;
    }

    const removed = db.users[index];
    db.users.splice(index, 1);
    db.enrollments = db.enrollments.filter((e) => e.studentId !== removed.userId);
    db.waitlists = db.waitlists.filter((w) => w.studentId !== removed.userId);

    // Recalculate available seats across courses
    db.courses.forEach((course) => {
      const activeCount = db.enrollments.filter(
        (e) => e.courseId === course.courseId && e.status === 'Active'
      ).length;
      course.availableSeats = Math.max(0, course.totalSeats - activeCount);
    });

    saveDatabase();

    res.status(200).json({
      success: true,
      message: `Student ${removed.name} (${removed.userId}) removed and seats updated.`,
    });
  });
}

export function getAllFaculty(req: AuthenticatedRequest, res: Response): void {
  const db = getDb();
  const { search } = req.query;

  let facultyList = db.users
    .filter((u) => u.role === 'faculty')
    .map((fac) => {
      const assignedCourses = db.courses
        .filter((c) => c.facultyId === fac.userId)
        .map((c) => {
          const enrolledCount = db.enrollments.filter(
            (e) => e.courseId === c.courseId && e.status === 'Active'
          ).length;
          return {
            courseId: c.courseId,
            courseCode: c.courseCode,
            title: c.title,
            semester: c.semester,
            totalSeats: c.totalSeats,
            availableSeats: Math.max(0, c.totalSeats - enrolledCount),
            enrolledCount,
          };
        });

      const totalStudentsTaught = assignedCourses.reduce(
        (sum, c) => sum + c.enrolledCount,
        0
      );

      const { password: _pw, ...safeFaculty } = fac;
      return {
        ...safeFaculty,
        assignedCoursesCount: assignedCourses.length,
        totalStudentsTaught,
        assignedCourses,
      };
    });

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    facultyList = facultyList.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.userId.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        f.department.toLowerCase().includes(q)
    );
  }

  res.status(200).json({
    success: true,
    count: facultyList.length,
    faculty: facultyList,
  });
}

export async function createFacultyByAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const {
      name,
      email,
      password = 'faculty123',
      department = 'Computer Science',
      title = 'Associate Professor',
      phone = '',
    } = req.body || {};

    if (!name || !email || !department) {
      res.status(400).json({
        success: false,
        message: 'Faculty name, email, and department are required.',
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
      return;
    }

    const facNumbers = db.users
      .filter((u) => u.userId.startsWith('FAC-'))
      .map((u) => parseInt(u.userId.replace('FAC-', ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextNum = (facNumbers.length ? Math.max(...facNumbers) : 100) + 1;

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newFaculty: UserDoc = {
      userId: `FAC-${nextNum}`,
      name: String(name).trim(),
      role: 'faculty',
      email: normalizedEmail,
      password: hashedPassword,
      department: String(department).trim(),
      title: String(title).trim(),
      phone: String(phone).trim(),
      createdAt: new Date().toISOString(),
    };

    db.users.push(newFaculty);
    saveDatabase();

    const { password: _pw, ...safeFaculty } = newFaculty;
    res.status(201).json({
      success: true,
      message: `Faculty member ${newFaculty.name} (${newFaculty.userId}) added successfully.`,
      faculty: safeFaculty,
    });
  });
}

export async function updateFacultyByAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await runAtomic(async () => {
    const db = getDb();
    const { id } = req.params;
    const fac = db.users.find((u) => u.userId === id && u.role === 'faculty');

    if (!fac) {
      res.status(404).json({
        success: false,
        message: 'Faculty account not found.',
      });
      return;
    }

    const { name, email, department, title, phone } = req.body || {};
    if (name && String(name).trim()) fac.name = String(name).trim();
    if (email && String(email).trim()) {
      const normalized = String(email).trim().toLowerCase();
      const dup = db.users.find(
        (u) => u.email.toLowerCase() === normalized && u.userId !== fac.userId
      );
      if (dup) {
        res.status(409).json({
          success: false,
          message: 'Email address is already in use.',
        });
        return;
      }
      fac.email = normalized;
    }
    if (department && String(department).trim())
      fac.department = String(department).trim();
    if (title !== undefined) fac.title = String(title).trim();
    if (phone !== undefined) fac.phone = String(phone).trim();

    saveDatabase();
    const { password: _pw, ...safeFaculty } = fac;

    res.status(200).json({
      success: true,
      message: `Faculty member ${fac.name} updated successfully.`,
      faculty: safeFaculty,
    });
  });
}
