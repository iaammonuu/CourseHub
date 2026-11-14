import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['student', 'faculty', 'admin'],
      required: true,
      default: 'student',
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    department: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    semester: {
      type: String,
      default: 'Fall 2026',
    },
    phone: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export default UserModel;
