import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reportType: {
      type: String,
      default: 'Comprehensive',
    },
    title: {
      type: String,
      default: 'CourseHub System Snapshot Report',
    },
    totalCourses: {
      type: Number,
      required: true,
    },
    totalStudents: {
      type: Number,
      required: true,
    },
    totalEnrollments: {
      type: Number,
      required: true,
    },
    generatedBy: {
      type: String,
      default: 'ADM-001',
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export const ReportModel = mongoose.models.Report || mongoose.model('Report', reportSchema);
export default ReportModel;
