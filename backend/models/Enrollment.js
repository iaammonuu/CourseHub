import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    enrollmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      ref: 'Course',
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Dropped'],
      default: 'Active',
      required: true,
      index: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    droppedAt: {
      type: Date,
    },
  },
  { timestamps: false }
);

// Unique compound index to prevent duplicate active enrollment records for the same student and course
enrollmentSchema.index(
  { studentId: 1, courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Active' },
    name: 'uniq_active_student_course_enrollment',
  }
);

export const EnrollmentModel =
  mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
export default EnrollmentModel;
