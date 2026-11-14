import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    courseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    courseCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    credits: {
      type: Number,
      default: 4,
      min: 1,
      max: 6,
    },
    facultyId: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 0,
    },
    semester: {
      type: String,
      required: true,
      index: true,
    },
    schedule: {
      type: String,
      default: 'Mon/Wed 10:00-11:30',
    },
    room: {
      type: String,
      default: 'Academic Hall 101',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export const CourseModel = mongoose.models.Course || mongoose.model('Course', courseSchema);
export default CourseModel;
